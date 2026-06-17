#!/usr/bin/env python3
"""
actualizar_ventas_impl.py — Lógica del comando "actualizar ventas" de dios (Comando 2).

Lo dispara dios cuando Luis pide por Telegram "actualizá ventas / bajá las ventas / /ventas".
NO escribe un downloader nuevo: ENCOLA la descarga de ventas que ya existe en la cola
`sync_requests` (script=items_facturados) que el daemon procesa de a uno → reusa el código,
sin credenciales nuevas, y sin correr en paralelo (el daemon es serial).

Anti-solapamiento: si ya hay una descarga de ventas corriendo (programada o manual) o una
en cola, avisa "ya hay una en curso" y sale, sin encolar otra.

Mensajes a Telegram (mismo bot/chat que el resto, vía scripts/.env):
  1) "⏳ Bajando ventas de NEO..." al arrancar
  2) al terminar: cuántas líneas nuevas entraron + el corte real de los datos

Uso:
  actualizar_ventas_impl.py            -> dispara la actualización (uso real de dios)
  actualizar_ventas_impl.py --check    -> NO encola nada; solo verifica conexión, conteo,
                                          corte y el guardia de solapamiento (autotest seguro)
"""
import os, sys, json, time, subprocess, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone, timedelta

BASE = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

SUPA_URL = os.getenv("SUPABASE_URL")
SUPA_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT  = os.getenv("TELEGRAM_CHAT_ID")
if not SUPA_URL or not SUPA_KEY:
    raise SystemExit("ERROR: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en scripts/.env")

DOWNLOADER = "neo_items_facturados_downloader.py"   # la rutina de ventas que ya existe
SCRIPT_KEY = "items_facturados"                      # clave en sync_requests / SCRIPT_MAP
POLL_TIMEOUT_S = 360                                 # cuánto esperamos a que el daemon termine
POLL_EVERY_S   = 5
CR_OFFSET = timedelta(hours=-6)                      # Costa Rica = UTC-6 (sin horario de verano)

# ── Telegram ──────────────────────────────────────────────────────────────────
def tg_send(text):
    if not TG_TOKEN or not TG_CHAT:
        print("(sin TELEGRAM_* en .env; no se envía)", text)
        return
    try:
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            data=json.dumps({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                             "disable_web_page_preview": True}).encode(),
            headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=30).read()
    except Exception as e:
        print(f"(falló envío a Telegram: {e})")

# ── Supabase REST ─────────────────────────────────────────────────────────────
def _req(method, path, body=None, extra_headers=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (extra_headers or {}).items():
        req.add_header(k, v)
    return urllib.request.urlopen(req, timeout=60)

def supa_get(path):
    with _req("GET", path) as r:
        return json.loads(r.read())

def contar_facturados():
    """count(*) de neo_items_facturados vía Content-Range (no descarga filas)."""
    with _req("GET", "neo_items_facturados?select=id&limit=1",
              extra_headers={"Prefer": "count=exact"}) as r:
        cr = r.headers.get("Content-Range", "")
    try:
        return int(cr.split("/")[-1])
    except Exception:
        return None

def corte_texto():
    """Sello de frescura (mismo formato que el cerebro): corte real en hora CR."""
    try:
        # Ordenar por id (PK indexada), NO por fecha_carga: ordenar 755k filas por una
        # columna sin índice hace timeout (HTTP 500). La última fila insertada trae el
        # fecha_carga más reciente, que es justo el corte.
        rows = supa_get("neo_items_facturados?select=fecha_carga&order=id.desc&limit=1")
        if not rows or not rows[0].get("fecha_carga"):
            return "📅 No pude confirmar el corte de los datos"
        raw = rows[0]["fecha_carga"]                       # ISO UTC, ej '2026-06-17T16:03:21+00:00'
        s = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        cr = dt.astimezone(timezone(CR_OFFSET))
        h12 = cr.hour % 12 or 12
        ampm = "a.m." if cr.hour < 12 else "p.m."
        return f"📅 Datos al corte de las {h12}:{cr.minute:02d} {ampm}"
    except Exception:
        return "📅 No pude confirmar el corte de los datos"

# ── Guardia anti-solapamiento ─────────────────────────────────────────────────
def ya_hay_corrida():
    """True si una descarga de ventas está corriendo (programada o manual) o en cola."""
    # 1) proceso del downloader vivo (cubre tanto la corrida programada como una manual)
    try:
        r = subprocess.run(["pgrep", "-f", DOWNLOADER], capture_output=True, text=True, timeout=10)
        if r.returncode == 0 and r.stdout.strip():
            return True
    except Exception:
        pass
    # 2) un pedido RECIENTE en la cola, pendiente o ejecutándose. Filtramos por
    #    requested_at de los últimos 30 min para NO trabarnos con filas zombi
    #    ('running' que nunca completaron por una caída vieja); una descarga real
    #    tarda minutos, así que algo "running" de hace media hora ya está muerto.
    try:
        corte = (datetime.now(timezone.utc) - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
        pend = supa_get(f"sync_requests?script=eq.{SCRIPT_KEY}"
                        f"&status=in.(pending,running)&requested_at=gte.{corte}&select=id&limit=1")
        if pend:
            return True
    except Exception:
        pass
    return False

# ── Encolar + esperar ─────────────────────────────────────────────────────────
def encolar():
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with _req("POST", "sync_requests",
              body={"script": SCRIPT_KEY, "status": "pending", "requested_at": now},
              extra_headers={"Prefer": "return=representation"}) as r:
        row = json.loads(r.read())
    return (row[0]["id"] if isinstance(row, list) else row["id"])

def esperar(req_id):
    fin = time.time() + POLL_TIMEOUT_S
    while time.time() < fin:
        time.sleep(POLL_EVERY_S)
        try:
            rows = supa_get(f"sync_requests?id=eq.{req_id}&select=status")
            st = rows[0]["status"] if rows else None
        except Exception:
            st = None
        if st in ("completed", "error", "timeout", "no_disponible"):
            return st
    return "esperando"   # no terminó dentro del límite; el daemon sigue

# ── Main ──────────────────────────────────────────────────────────────────────
def check():
    print("conteo facturados:", contar_facturados())
    print("corte:", corte_texto())
    print("¿ya hay corrida?:", ya_hay_corrida())
    print("OK --check (no se encoló nada)")

def lanzar_seguimiento(req_id, antes):
    """Lanza un proceso DESPRENDIDO que espera al daemon y manda el mensaje final.
    start_new_session=True lo saca del grupo del proceso padre → sobrevive aunque el
    tool exec de dios corte o segundo-planee la llamada original."""
    try:
        logf = open(BASE / "actualizar-ventas.log", "a")
        subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()),
             "--wait", str(req_id), str(antes if antes is not None else -1)],
            stdout=logf, stderr=logf, stdin=subprocess.DEVNULL,
            start_new_session=True, close_fds=True, cwd=str(BASE))
    except Exception as e:
        print(f"(no pude lanzar el seguimiento: {e})")

def run():
    if ya_hay_corrida():
        msg = "⏳ Ya hay una actualización de ventas en curso. Espera a que termine."
        tg_send(msg); print(msg); return

    tg_send("⏳ Bajando ventas de NEO...")
    antes = contar_facturados()
    try:
        req_id = encolar()
    except Exception as e:
        m = "❌ No pude encolar la actualización de ventas. Revisá el daemon."
        tg_send(m); print(m, e); return

    lanzar_seguimiento(req_id, antes)
    print(f"encolado items_facturados (req {req_id}); seguimiento en background.")

def wait(req_id, antes):
    antes = None if antes is None or antes < 0 else antes
    estado = esperar(req_id)
    if estado == "completed":
        despues = contar_facturados()
        if antes is not None and despues is not None:
            d = despues - antes
            if d > 0:    linea = f"Entraron <b>{d}</b> líneas nuevas."
            elif d == 0: linea = "No entraron líneas nuevas (ya estaba al día)."
            else:        linea = f"El total bajó en <b>{abs(d)}</b> líneas (anulaciones/devoluciones)."
        else:
            linea = "Actualización lista."
        msg = f"✅ Ventas actualizadas. {linea}\n\n{corte_texto()}"
    elif estado == "esperando":
        msg = ("⏳ La descarga sigue corriendo (tardó más de lo normal). "
               "Apenas termine vas a ver el nuevo corte; volvé a preguntar en un ratito.")
    else:
        msg = f"❌ La actualización de ventas no terminó bien (estado: {estado}). Revisá el log del daemon."
    tg_send(msg); print(msg)

if __name__ == "__main__":
    if "--check" in sys.argv:
        check()
    elif "--wait" in sys.argv:
        i = sys.argv.index("--wait")
        wait(sys.argv[i + 1], int(sys.argv[i + 2]))
    else:
        run()
