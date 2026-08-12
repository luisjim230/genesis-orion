"""
gmail_facturas_sync.py — Robot que lee la casilla de FACTURACIÓN por IMAP y sube
los XML/PDF de las facturas al módulo Contabilidad (endpoint /api/contabilidad/
procesar), que se encarga de clasificar, deduplicar por clave y crear el borrador.

Diseño (a propósito):
  - Corre en la M1 (como los otros robots), disparado por el sync_daemon.
  - Lee SOLO los correos DESDE la fecha de corte (conta_config 'gmail_sync_desde';
    ej. 2026-08-11). Todo lo anterior queda MANUAL (se sube a mano en SOL).
  - Solo mira correos con adjuntos que NO tengan ya la etiqueta 'sol-procesado';
    al terminar de procesar un correo le pone esa etiqueta, así no se repite.
  - No decide nada contable: reusa /procesar (misma lógica que el drag&drop).
    La dedup por clave del propio endpoint evita duplicados aunque algo se repita.

Requiere en scripts/.env:
  GMAIL_CONTA_USER           correo de facturación (ej. facturas@tu-dominio.com)
  GMAIL_CONTA_APP_PASSWORD   contraseña de aplicación de Google (16 caracteres)
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
  APP_URL                    (opcional) base del panel; default sol.depositojimenez.com

Uso:
  .venv/bin/python scripts/gmail_facturas_sync.py            # procesa y etiqueta
  .venv/bin/python scripts/gmail_facturas_sync.py --dry-run  # muestra qué haría, sin subir ni etiquetar
"""

import os, sys, ssl, json, imaplib, email, fcntl, argparse, logging, mimetypes
import urllib.request, urllib.error, random, string
from email.header import decode_header
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

GMAIL_USER = os.getenv("GMAIL_CONTA_USER")
GMAIL_PASS = os.getenv("GMAIL_CONTA_APP_PASSWORD")
SUPA_URL   = os.getenv("SUPABASE_URL")
SUPA_KEY   = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")
APP_URL    = os.getenv("APP_URL", "https://sol.depositojimenez.com")

CORTE_DEFAULT = "2026-08-11"          # 11-ago-2026 en adelante = automático
ETIQUETA      = "sol-procesado"       # etiqueta de Gmail para no reprocesar
LOCK_FILE     = BASE / ".gmail-sync.lock"
LOG_FILE      = BASE / "gmail-facturas-sync.log"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S",
    handlers=[logging.FileHandler(str(LOG_FILE)), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

_faltan = [n for n, v in (("GMAIL_CONTA_USER", GMAIL_USER), ("GMAIL_CONTA_APP_PASSWORD", GMAIL_PASS),
                          ("SUPABASE_URL", SUPA_URL), ("SUPABASE_SERVICE_ROLE_KEY/ANON_KEY", SUPA_KEY)) if not v]


def fecha_corte():
    """Lee la fecha de corte de conta_config; si no está, usa el default."""
    try:
        url = f"{SUPA_URL}/rest/v1/conta_config?select=valor&clave=eq.gmail_sync_desde"
        req = urllib.request.Request(url)
        req.add_header("apikey", SUPA_KEY)
        req.add_header("Authorization", f"Bearer {SUPA_KEY}")
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode() or "[]")
        if data and isinstance(data[0].get("valor"), dict):
            f = data[0]["valor"].get("fecha")
            if f:
                return f
    except Exception as e:
        log.warning(f"No pude leer la fecha de corte de la base ({e}); uso {CORTE_DEFAULT}.")
    return CORTE_DEFAULT


def _dec(s):
    """Decodifica un header MIME (nombre de archivo, asunto) a texto legible."""
    if not s:
        return ""
    partes = decode_header(s)
    out = ""
    for txt, enc in partes:
        out += txt.decode(enc or "utf-8", "replace") if isinstance(txt, bytes) else txt
    return out


def adjuntos_factura(msg):
    """Devuelve [(nombre, bytes)] de los adjuntos XML/PDF del correo."""
    out = []
    for part in msg.walk():
        if part.get_content_maintype() == "multipart":
            continue
        nombre = _dec(part.get_filename())
        if not nombre:
            continue
        low = nombre.lower()
        if low.endswith(".xml") or low.endswith(".pdf"):
            payload = part.get_payload(decode=True)
            if payload:
                out.append((nombre, payload))
    return out


def subir_a_procesar(archivos):
    """POST multipart de los archivos al endpoint /procesar. Devuelve el JSON."""
    boundary = "----SOLGmail" + "".join(random.choices(string.ascii_letters + string.digits, k=20))
    cuerpo = b""
    for nombre, data in archivos:
        ctype = mimetypes.guess_type(nombre)[0] or "application/octet-stream"
        cuerpo += (f"--{boundary}\r\n"
                   f'Content-Disposition: form-data; name="files"; filename="{nombre}"\r\n'
                   f"Content-Type: {ctype}\r\n\r\n").encode("utf-8")
        cuerpo += data + b"\r\n"
    cuerpo += (f"--{boundary}\r\n"
               f'Content-Disposition: form-data; name="creado_por"\r\n\r\n'
               f"gmail-sync\r\n").encode("utf-8")
    cuerpo += f"--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(f"{APP_URL}/api/contabilidad/procesar", data=cuerpo, method="POST")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode() or "{}")


def main():
    ap = argparse.ArgumentParser(description="Sube a Contabilidad las facturas que llegan al correo.")
    ap.add_argument("--dry-run", action="store_true", help="Muestra qué haría, sin subir ni etiquetar.")
    ap.add_argument("--limit", type=int, default=50, help="Máximo de correos por corrida (default 50).")
    ap.add_argument("--desde", help="Fecha YYYY-MM-DD para forzar el corte (solo pruebas; ignora conta_config).")
    args = ap.parse_args()

    if _faltan:
        raise SystemExit("ERROR: faltan variables en scripts/.env: " + ", ".join(_faltan))

    lock_fp = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.info("Ya hay otra corrida de gmail-sync en curso. Salgo."); return

    corte = args.desde or fecha_corte()
    since_imap = datetime.strptime(corte, "%Y-%m-%d").strftime("%d-%b-%Y")  # IMAP: 11-Aug-2026
    log.info("=" * 60)
    log.info(f"Gmail → Contabilidad  [{datetime.now():%Y-%m-%d %H:%M}]"
             + ("  (DRY-RUN)" if args.dry_run else ""))
    log.info(f"Casilla: {GMAIL_USER}  ·  desde: {corte}  (lo anterior es manual)")
    log.info("=" * 60)

    imap = imaplib.IMAP4_SSL("imap.gmail.com", ssl_context=ssl.create_default_context())
    imap.login(GMAIL_USER, GMAIL_PASS)
    imap.select("INBOX")

    # SINCE (IMAP, inclusive del día) + Gmail: con adjunto y sin etiqueta procesada.
    # OJO: el valor de X-GM-RAW lleva espacios, así que hay que mandarlo ENTRE
    # COMILLAS; imaplib no las agrega solo y el servidor responde
    # "Could not parse command" si se manda crudo.
    raw = f'has:attachment -label:{ETIQUETA}'.replace('"', '')
    typ, data = imap.uid("search", None, "SINCE", since_imap,
                         "X-GM-RAW", f'"{raw}"')
    uids = (data[0].split() if data and data[0] else [])
    log.info(f"{len(uids)} correo(s) nuevos con adjunto desde {corte}.")

    tot_creados = tot_ignorados = tot_rechazados = tot_acuses = 0
    for uid in uids[: args.limit]:
        try:
            # BODY.PEEK[] lee el correo SIN marcarlo como leído (a diferencia de
            # RFC822, que sí pone el flag \Seen). Así el robot no deja huella y el
            # estado no-leído/leído lo maneja la persona en su flujo normal.
            typ, msgdata = imap.uid("fetch", uid, "(BODY.PEEK[])")
            msg = email.message_from_bytes(msgdata[0][1])
            asunto = _dec(msg.get("Subject"))[:70]
            archivos = adjuntos_factura(msg)
            if not archivos:
                # sin XML/PDF: igual la etiquetamos para no volver a mirarla
                if not args.dry_run:
                    imap.uid("store", uid, "+X-GM-LABELS", ETIQUETA)
                continue

            if args.dry_run:
                log.info(f"  [dry] «{asunto}» → {len(archivos)} adjunto(s): "
                         + ", ".join(n for n, _ in archivos))
                continue

            res = subir_a_procesar(archivos)
            c = len(res.get("creados", [])); ig = len(res.get("ignorados", []))
            re_ = len(res.get("rechazados", [])); ac = len(res.get("acuses", []))
            tot_creados += c; tot_ignorados += ig; tot_rechazados += re_; tot_acuses += ac
            log.info(f"  «{asunto}» → creados={c} ignorados={ig} rechazados={re_} acuses={ac}")
            imap.uid("store", uid, "+X-GM-LABELS", ETIQUETA)
        except Exception as e:
            log.error(f"  Correo {uid}: {e}")

    try:
        imap.logout()
    except Exception:
        pass
    if not args.dry_run:
        log.info(f"TOTAL: creados={tot_creados} ignorados={tot_ignorados} "
                 f"rechazados={tot_rechazados} acuses={tot_acuses}")


if __name__ == "__main__":
    main()
