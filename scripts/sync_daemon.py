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

SUPA_URL = os.getenv("SUPABASE_URL")
SUPA_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

# --- Validación de credenciales del .env (migración a servidor M1) ---
# Sin defaults hardcodeados: si falta algo, cortar con mensaje claro.
_faltan_env = [n for n, v in (("SUPABASE_URL", SUPA_URL), ("SUPABASE_SERVICE_ROLE_KEY/ANON_KEY", SUPA_KEY)) if not v]
if _faltan_env:
    raise SystemExit("ERROR: faltan variables en scripts/.env: " + ", ".join(_faltan_env) + ". Completá scripts/.env y reintentá.")
APP_URL  = os.getenv("APP_URL", "https://genesis-orion.vercel.app")

PYTHON  = sys.executable  # venv de la M1 (migración)
SCRIPTS = BASE

LOG_FILE = BASE / "sync-daemon.log"
HEARTBEAT_FILE = Path.home() / "sol-logs" / "daemon_heartbeat.txt"
# Evitar handlers duplicados si el módulo se re-importa
_root_log = logging.getLogger()
if not _root_log.handlers:
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
    "proformas_cabecera":      "neo_proformas_downloader.py",
    "proformas_items":         "neo_items_proformados_downloader.py",
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


def latido():
    """Escribe un latido (timestamp UTC) a Supabase y a un archivo local en cada
    ciclo. Permite que el health-check (en la nube) detecte si el daemon murió en
    silencio (ej. Mac apagada). No crítico: si falla, el daemon sigue."""
    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        HEARTBEAT_FILE.parent.mkdir(parents=True, exist_ok=True)
        HEARTBEAT_FILE.write_text(ahora)
    except Exception:
        pass
    try:
        url = f"{SUPA_URL}/rest/v1/daemon_heartbeat?on_conflict=id"
        body = json.dumps([{"id": 1, "last_beat": ahora}]).encode()
        req = urllib.request.Request(url, data=body, method="POST")
        req.add_header("apikey", SUPA_KEY)
        req.add_header("Authorization", f"Bearer {SUPA_KEY}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        log.warning(f"latido a Supabase falló (no crítico): {e}")


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

    # Refrescar todas las vistas derivadas (profecias_panel, mv_consumo_mensual,
    # mv_items_por_vend_mes, bi_resumen_producto) cuando un sync termina OK.
    # Sin esto los módulos siguen mostrando datos viejos.
    if status == "completed":
        try:
            url = f"{APP_URL}/api/refresh-all"
            req_http = urllib.request.Request(url, data=b'{}', method="POST")
            req_http.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(req_http, timeout=300) as r:
                body = r.read().decode()
                log.info(f"  🔁 refresh-all: {body[:200]}")
        except Exception as e:
            log.warning(f"  ⚠️ refresh-all falló (no crítico): {e}")


# ─── SCHEDULER INTEGRADO (cadencia por reporte) ───────────────────────────────
# Horario comercial, lunes a sábado (sin domingo), hora local. El daemon ejecuta
# los reportes EN FILA (uno por uno) para no pelear la sesión de NEO. Reemplaza a
# los LaunchAgents individuales por-reporte.

def _cada(paso_horas, minuto, desde=7, hasta=18):
    """(hora, minuto) cada `paso_horas` horas entre `desde` y `hasta` inclusive."""
    return [(h, minuto) for h in range(desde, hasta + 1, paso_horas)]

# Cadencia por reporte. Calibrada para bajar el Disk IO sin perder frescura:
# todos los insumos del Reporte Matutino corren ANTES de las 9:30.
SCHEDULE = {
    "items_facturados":        [(6,0),(10,0),(14,0),(17,30)],  # ventas (17:30 = cierre)
    "items_comprados":         [(10,0),(16,0)],
    "lista_items":             [(8,0),(12,0),(16,0)],
    "minimos_maximos":         [(8,5),(12,5),(16,5)],
    "proformas_cabecera":      [(6,0)],
    "proformas_items":         [(6,5)],
    "informe_ventas_vendedor": _cada(3, 18),                   # se deja (cada 3 h)
    "movimientos_contables":   [(8,15),(16,15)],               # se deja (2x/día)
    "antiguedad_clientes":     [(8,25),(16,25)],               # se deja (2x/día)
    "antiguedad_proveedores":  [(8,40),(16,40)],               # se deja (2x/día)
}
SCHEDULE_WEEKDAYS = {0, 1, 2, 3, 4, 5}   # 0=Lun ... 5=Sáb (sin domingo)

# Timeout por script (segundos). Antigüedad proveedores tarda más en NEO.
SCRIPT_TIMEOUTS = {"antiguedad_proveedores": 900}
TIMEOUT_DEFAULT = 600

_last_run: dict = {}  # script_key -> datetime del último run lanzado por el scheduler


def _slot_vencido(spec, now):
    """Último horario de hoy (datetime) que ya pasó, o None si ninguno pasó aún."""
    pasados = [s for s in (now.replace(hour=h, minute=m, second=0, microsecond=0)
                           for (h, m) in spec) if s <= now]
    return max(pasados) if pasados else None


def reportes_pendientes():
    """Reportes con un horario vencido que todavía no se corrió en ese slot."""
    now = datetime.now()
    if now.weekday() not in SCHEDULE_WEEKDAYS:
        return []
    due = []
    for key, spec in SCHEDULE.items():
        slot = _slot_vencido(spec, now)
        if slot is None:
            continue
        if _last_run.get(key) is None or _last_run[key] < slot:
            due.append((slot, key))
    due.sort()  # correr en orden de horario
    return [key for _, key in due]


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
            timeout=SCRIPT_TIMEOUTS.get(script_key, TIMEOUT_DEFAULT),
        )
        ok = result.returncode == 0
        log.info(f"  {'✅' if ok else '❌'} {script_key} (rc={result.returncode})")
        if not ok:
            log.error(f"    stderr: {result.stderr[-300:]}")
    except subprocess.TimeoutExpired:
        log.error(f"  ⏱ Timeout: {script_key}")
    except Exception as e:
        log.error(f"  Error {script_key}: {e}")


def refrescar_mv(fn):
    """Refresca una vista materializada vía RPC. No crítico."""
    try:
        req = urllib.request.Request(
            f"{SUPA_URL}/rest/v1/rpc/{fn}", data=b'{}', method="POST",
            headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                     "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=300)
        log.info(f"  ↻ {fn} ok")
    except Exception as e:
        log.warning(f"  ⚠️ refresh {fn} falló (no crítico): {e}")


def _llamar_endpoint(path, timeout, nombre):
    """POST a un endpoint de SOL (refresh-all / procesar-match). No crítico."""
    try:
        url = f"{APP_URL}{path}"
        req_http = urllib.request.Request(url, data=b'{}', method="POST")
        req_http.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req_http, timeout=timeout) as r:
            log.info(f"  🔁 {nombre}: {r.read().decode()[:160]}")
    except Exception as e:
        log.warning(f"  ⚠️ {nombre} falló (no crítico): {e}")


def check_schedule():
    """Corre EN FILA los reportes cuyo horario venció; refresca vistas al final."""
    due = reportes_pendientes()
    if not due:
        return
    log.info(f"⏰ Programados ahora ({len(due)}): {', '.join(due)}")
    corridos = []
    for key in due:
        # Aislamiento por reporte: si UNO falla de forma inesperada, se loguea y
        # se sigue con el resto. _last_run se marca igual (espera al próximo slot,
        # no reintenta en bucle cada 60s).
        try:
            ejecutar_script(key)
        except Exception as e:
            log.error(f"  ⚠️ {key}: error inesperado, sigo con el resto: {e}")
        _last_run[key] = datetime.now()
        corridos.append(key)

    # Tras bajar ítems comprados, recalcular matches de compras.
    if "items_comprados" in corridos:
        _llamar_endpoint("/api/procesar-match", 120, "procesar-match")

    # Refresco SELECTIVO de vistas materializadas (ahorro de Disk IO):
    # el script de items_facturados YA refresca mv_items_por_vend_mes + mv_consumo_mensual;
    # acá completamos solo lo que falta y solo cuando su fuente corrió.
    if "items_facturados" in corridos:
        refrescar_mv("bi_recalcular_resumen")            # bi_resumen_producto (ventas)
    if "items_facturados" in corridos or "minimos_maximos" in corridos:
        refrescar_mv("refresh_profecias_panel")          # depende de ventas y/o stock
    log.info("⏰ Lote programado completado")


REPORTE_MATUTINO = (9, 30)   # Reporte Matutino por Telegram: 9:30 lun-sáb
_reporte_enviado: set = set()  # fechas (iso) en que ya se envió


def check_reporte_matutino():
    """A las 9:30 (lun-sáb) envía el Reporte Matutino por Telegram. Solo LEE
    Supabase (no toca NEO), así que corre sin chocar con los downloaders."""
    now = datetime.now()
    if now.weekday() not in SCHEDULE_WEEKDAYS:
        return
    slot = now.replace(hour=REPORTE_MATUTINO[0], minute=REPORTE_MATUTINO[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _reporte_enviado:
        return
    _reporte_enviado.add(hoy)
    log.info("📰 Enviando Reporte Matutino...")
    rc = -1
    try:
        r = subprocess.run([PYTHON, str(SCRIPTS / "reporte_matutino.py"), "--send"],
                           cwd=str(SCRIPTS), capture_output=True, text=True, timeout=300)
        rc = r.returncode
        log.info(f"📰 Reporte Matutino rc={rc}")
        if rc != 0:
            log.error(f"  stderr: {r.stderr[-300:]}")
    except Exception as e:
        log.error(f"📰 Reporte Matutino error: {e}")
    registrar_corrida("Reporte Matutino", rc)


# ─── Marketing: Reporte de Pauta (lunes) + Guardián de Presupuesto (diario) ────
REPORTE_PAUTA = (9, 35)    # lunes: cierre de la pauta de la semana pasada
GUARDIAN_PPTO = (8, 0)     # diario (lun-sáb): alerta solo si hubo gasto anómalo
_pauta_enviado: set = set()
_guardian_enviado: set = set()


RUNS_FILE = Path.home() / "sol-logs" / "agent_runs.jsonl"


def registrar_corrida(nombre, rc):
    """Anota que un agente corrió hoy (para que Latido lo verifique de noche)."""
    try:
        RUNS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(RUNS_FILE, "a") as f:
            f.write(json.dumps({"ts": datetime.now().isoformat(), "agente": nombre, "rc": rc}) + "\n")
    except Exception as e:
        log.warning(f"  no pude registrar corrida de {nombre}: {e}")


def _disparar_reporte(nombre, script, flag):
    """Corre un agente de reporte/alerta (--send). Solo LEE Supabase, no toca NEO."""
    log.info(f"{flag} Enviando {nombre}...")
    rc = -1
    try:
        r = subprocess.run([PYTHON, str(SCRIPTS / script), "--send"],
                           cwd=str(SCRIPTS), capture_output=True, text=True, timeout=180)
        rc = r.returncode
        log.info(f"{flag} {nombre} rc={rc}")
        if rc != 0:
            log.error(f"  stderr: {r.stderr[-300:]}")
    except Exception as e:
        log.error(f"{flag} {nombre} error: {e}")
    registrar_corrida(nombre, rc)


def check_reporte_pauta():
    """Lunes 9:35: Reporte de Performance de pauta (Meta)."""
    now = datetime.now()
    if now.weekday() != 0:                       # 0 = lunes
        return
    slot = now.replace(hour=REPORTE_PAUTA[0], minute=REPORTE_PAUTA[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _pauta_enviado:
        return
    _pauta_enviado.add(hoy)
    _disparar_reporte("Reporte de Pauta", "reportero_performance.py", "📣")


def check_guardian_presupuesto():
    """Diario (lun-sáb) 8:00: Guardián de Presupuesto (avisa solo si hay anomalía)."""
    now = datetime.now()
    if now.weekday() not in SCHEDULE_WEEKDAYS:
        return
    slot = now.replace(hour=GUARDIAN_PPTO[0], minute=GUARDIAN_PPTO[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _guardian_enviado:
        return
    _guardian_enviado.add(hoy)
    _disparar_reporte("Guardián de Presupuesto", "guardian_presupuesto.py", "🛡️")


REPORTE_AUDITOR = (9, 35)   # viernes: auditoría de pauta (consultoría, 30 días)
_auditor_enviado: set = set()


def check_auditor_pauta():
    """Viernes 9:35: Auditoría-Consultoría de Pauta (Meta)."""
    now = datetime.now()
    if now.weekday() != 4:                       # 4 = viernes
        return
    slot = now.replace(hour=REPORTE_AUDITOR[0], minute=REPORTE_AUDITOR[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _auditor_enviado:
        return
    _auditor_enviado.add(hoy)
    _disparar_reporte("Auditoría de Pauta", "auditor_pauta.py", "🔍")


EZEQUIEL = (9, 35)   # miércoles: Ezequiel, profeta de quiebres (planificación de contenedor)
_ezequiel_enviado: set = set()


def check_ezequiel():
    """Miércoles 9:35: Ezequiel — importados por quebrar (avisa solo si hay)."""
    now = datetime.now()
    if now.weekday() != 2:                       # 2 = miércoles
        return
    slot = now.replace(hour=EZEQUIEL[0], minute=EZEQUIEL[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _ezequiel_enviado:
        return
    _ezequiel_enviado.add(hoy)
    _disparar_reporte("Ezequiel (quiebres)", "ezequiel_profeta.py", "🔮")


MATEO = (9, 35)   # jueves: Mateo, pulso financiero (ventas/compras/margen + sirena markup)
_mateo_enviado: set = set()


def check_mateo():
    """Jueves 9:35: Mateo — pulso financiero por Telegram."""
    now = datetime.now()
    if now.weekday() != 3:                       # 3 = jueves
        return
    slot = now.replace(hour=MATEO[0], minute=MATEO[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _mateo_enviado:
        return
    _mateo_enviado.add(hoy)
    _disparar_reporte("Mateo (financiero)", "mateo_financiero.py", "💰")


VIGILANTE_PROF = (9, 35)   # martes: Vigilante de Proformas (seguimiento de cotizaciones)
_vigprof_enviado: set = set()


def check_vigilante_proformas():
    """Martes 9:35: Vigilante de Proformas."""
    now = datetime.now()
    if now.weekday() != 1:                       # 1 = martes
        return
    slot = now.replace(hour=VIGILANTE_PROF[0], minute=VIGILANTE_PROF[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _vigprof_enviado:
        return
    _vigprof_enviado.add(hoy)
    _disparar_reporte("Vigilante de Proformas", "vigilante_proformas.py", "📄")


LATIDO = (20, 0)   # lun-sáb 20:00: Latido verifica que los agentes del día corrieron
_latido_enviado: set = set()


def check_latido():
    """20:00 (lun-sáb): Latido — parte nocturno de que los agentes corrieron."""
    now = datetime.now()
    if now.weekday() not in SCHEDULE_WEEKDAYS:
        return
    slot = now.replace(hour=LATIDO[0], minute=LATIDO[1], second=0, microsecond=0)
    hoy = now.date().isoformat()
    if now < slot or hoy in _latido_enviado:
        return
    _latido_enviado.add(hoy)
    _disparar_reporte("Latido", "latido.py", "🌙")


def main():
    # Al arrancar, marcamos cada reporte como "ya corrido hasta ahora" para NO
    # disparar una avalancha por slots ya vencidos hoy (arrancan en el próximo).
    arranque = datetime.now()
    for key in SCHEDULE:
        _last_run[key] = arranque
    # Si el daemon arranca después de las 9:30, no reenviar el matutino de hoy.
    if (arranque.hour, arranque.minute) >= REPORTE_MATUTINO:
        _reporte_enviado.add(arranque.date().isoformat())
    # Igual para los agentes de marketing: no reenviar si el daemon reinicia pasado el slot.
    if arranque.weekday() == 0 and (arranque.hour, arranque.minute) >= REPORTE_PAUTA:
        _pauta_enviado.add(arranque.date().isoformat())
    if (arranque.hour, arranque.minute) >= GUARDIAN_PPTO:
        _guardian_enviado.add(arranque.date().isoformat())
    if arranque.weekday() == 4 and (arranque.hour, arranque.minute) >= REPORTE_AUDITOR:
        _auditor_enviado.add(arranque.date().isoformat())
    if arranque.weekday() == 2 and (arranque.hour, arranque.minute) >= EZEQUIEL:
        _ezequiel_enviado.add(arranque.date().isoformat())
    if arranque.weekday() == 3 and (arranque.hour, arranque.minute) >= MATEO:
        _mateo_enviado.add(arranque.date().isoformat())
    if arranque.weekday() == 1 and (arranque.hour, arranque.minute) >= VIGILANTE_PROF:
        _vigprof_enviado.add(arranque.date().isoformat())
    if (arranque.hour, arranque.minute) >= LATIDO:
        _latido_enviado.add(arranque.date().isoformat())
    log.info("=" * 50)
    log.info("SOL Sync Daemon iniciado")
    log.info("Revisando solicitudes cada 60 segundos")
    log.info(f"Scheduler por-reporte activo (lun-sáb). Reportes: {len(SCHEDULE)}")
    log.info("=" * 50)

    while True:
        try:
            latido()
            check_schedule()
            check_reporte_matutino()
            check_reporte_pauta()
            check_guardian_presupuesto()
            check_auditor_pauta()
            check_ezequiel()
            check_mateo()
            check_vigilante_proformas()
            check_latido()

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
