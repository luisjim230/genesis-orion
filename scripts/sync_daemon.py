"""
sync_daemon.py — Daemon que escucha solicitudes de sincronización desde SOL.

Cuando alguien presiona "Forzar sincronización" en SOL (desde cualquier
dispositivo), se inserta un registro en Supabase. Este daemon revisa cada
60 segundos si hay solicitudes pendientes y ejecuta el script correspondiente.

Cómo correr manualmente:
  python3 sync_daemon.py

Se registra como LaunchAgent para correr siempre en segundo plano.
Usa ~10MB RAM y duerme la mayor parte del tiempo.
"""

import os, sys, json, time, logging, subprocess, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, date

BASE = Path(__file__).parent

try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

SUPA_URL = os.getenv("SUPABASE_URL",      "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")
APP_URL  = os.getenv("APP_URL", "https://genesis-orion.vercel.app")

PYTHON  = "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3"
SCRIPTS = BASE

LOG_FILE = BASE / "sync-daemon.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)

# Mapa script_id → archivo Python
SCRIPT_MAP = {
    "minimos_maximos":         "neo_minimos_downloader.py",
    "items_comprados":         "neo_items_comprados_downloader.py",
    "antiguedad_proveedores":  "neo_antiguedad_proveedores_downloader.py",
    "antiguedad_clientes":     "neo_antiguedad_clientes_downloader.py",
    "items_facturados":        "neo_items_facturados_downloader.py",
    "informe_ventas_vendedor": "neo_informe_ventas_vendedor_downloader.py",
    "movimientos_contables":   "neo_movimientos_contables_downloader.py",
    "lista_items":             "neo_lista_items_downloader.py",
}


def supa_get(path):
    url = f"{SUPA_URL}/rest/v1/{path}"
    req = urllib.request.Request(url, method="GET")
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        log.error(f"GET {path}: {e}")
        return []


def supa_patch(path, data):
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method="PATCH")
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "return=minimal")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status
    except Exception as e:
        log.error(f"PATCH {path}: {e}")
        return None


def procesar_solicitud(req):
    req_id = req["id"]
    script_key = req["script"]
    script_file = SCRIPT_MAP.get(script_key)

    log.info(f"▶ Solicitud recibida: {script_key} (id={req_id[:8]}...)")

    if not script_file:
        log.warning(f"  Script '{script_key}' no tiene automatización — marcando como completado")
        supa_patch(f"sync_requests?id=eq.{req_id}", {
            "status": "no_disponible",
            "completed_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
        return

    script_path = SCRIPTS / script_file
    if not script_path.exists():
        log.error(f"  Archivo no encontrado: {script_path}")
        supa_patch(f"sync_requests?id=eq.{req_id}", {
            "status": "error",
            "completed_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        })
        return

    # Marcar como en progreso
    supa_patch(f"sync_requests?id=eq.{req_id}", {"status": "running"})

    # Antigüedad proveedores tarda más porque NEO genera un reporte muy largo
    script_timeout = 900 if script_key == "antiguedad_proveedores" else 600
    try:
        result = subprocess.run(
            [PYTHON, str(script_path)],
            cwd=str(SCRIPTS),
            capture_output=True,
            text=True,
            timeout=script_timeout,
        )
        exito = result.returncode == 0
        status = "completed" if exito else "error"
        log.info(f"  {'✅' if exito else '❌'} {script_key} terminó (status={status})")
        if not exito:
            log.error(f"  stderr: {result.stderr[-500:]}")
    except subprocess.TimeoutExpired:
        status = "timeout"
        log.error(f"  Timeout ejecutando {script_key}")
    except Exception as e:
        status = "error"
        log.error(f"  Error: {e}")

    supa_patch(f"sync_requests?id=eq.{req_id}", {
        "status": status,
        "completed_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    })

    # Disparar procesar-match después de bajar ítems comprados
    if script_key == "items_comprados" and status == "completed":
        try:
            url = f"{APP_URL}/api/procesar-match"
            req_http = urllib.request.Request(url, data=b'{}', method="POST")
            req_http.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req_http, timeout=120) as r:
                body = r.read().decode()
                log.info(f"  🔄 procesar-match: {body[:200]}")
        except Exception as e:
            log.warning(f"  ⚠️ procesar-match falló (no crítico): {e}")


# ─── SCHEDULER INTEGRADO ──────────────────────────────────────────────────────
# Lun–Sáb a las 9:00 y 16:00. Reemplaza a los LaunchAgents individuales.

SCHEDULE_HOURS    = [9, 16]            # horas en que corre (hora local)
SCHEDULE_WEEKDAYS = [0, 1, 2, 3, 4, 5] # 0=Lunes, 5=Sábado
SCHEDULE_SCRIPTS  = list(SCRIPT_MAP.keys())

_ran_slots: set = set()  # "YYYY-MM-DD_HH" ya ejecutados en este ciclo de daemon


def ejecutar_script(script_key):
    """Corre un script directamente (sin pasar por sync_requests en Supabase)."""
    script_file = SCRIPT_MAP.get(script_key)
    if not script_file:
        log.warning(f"  ⏭ '{script_key}' sin script definido")
        return
    script_path = SCRIPTS / script_file
    if not script_path.exists():
        log.error(f"  ❌ No existe: {script_path}")
        return

    log.info(f"  ▶ {script_key}")
    try:
        result = subprocess.run(
            [PYTHON, str(script_path)],
            cwd=str(SCRIPTS),
            capture_output=True,
            text=True,
            timeout=600,
        )
        ok = result.returncode == 0
        log.info(f"  {'✅' if ok else '❌'} {script_key} (rc={result.returncode})")
        if not ok:
            log.error(f"    stderr: {result.stderr[-300:]}")
    except subprocess.TimeoutExpired:
        log.error(f"  ⏱ Timeout: {script_key}")
    except Exception as e:
        log.error(f"  Error {script_key}: {e}")


def check_schedule():
    """Si es hora programada y no ha corrido aún, ejecuta todos los scripts."""
    now = datetime.now()
    if now.weekday() not in SCHEDULE_WEEKDAYS:
        return
    if now.hour not in SCHEDULE_HOURS:
        return
    if now.minute > 4:  # ventana de 5 min desde el inicio de la hora
        return

    slot = now.strftime("%Y-%m-%d_%H")
    if slot in _ran_slots:
        return

    _ran_slots.add(slot)
    log.info(f"⏰ Sync programado {now.strftime('%A %H:%M')} — {len(SCHEDULE_SCRIPTS)} scripts")
    for key in SCHEDULE_SCRIPTS:
        ejecutar_script(key)
    log.info("⏰ Sync programado completado")


def main():
    log.info("=" * 50)
    log.info("SOL Sync Daemon iniciado")
    log.info(f"Revisando solicitudes cada 60 segundos")
    log.info(f"Sync programado: Lun–Sáb {SCHEDULE_HOURS} h")
    log.info("=" * 50)

    while True:
        try:
            check_schedule()

            # Buscar solicitudes pendientes
            pendientes = supa_get(
                "sync_requests?status=eq.pending&order=requested_at.asc&limit=5"
            )
            for req in pendientes:
                procesar_solicitud(req)
        except Exception as e:
            log.error(f"Error en ciclo principal: {e}")

        time.sleep(60)


if __name__ == "__main__":
    main()
