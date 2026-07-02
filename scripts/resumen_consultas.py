#!/usr/bin/env python3
"""
resumen_consultas.py — Resumen diario (6:00pm) de las consultas que hicieron los
usuarios con rol "consulta" (Ronny, Rebeca, y otros a futuro) al bot AgenteDJ.

Fuente: los transcripts reales del agente openclaw "consulta"
(~/.openclaw/agents/consulta/sessions/*.jsonl). NO depende de que el LLM anote nada.

- Agrupa por persona, lista cada consulta del día (hora, pregunta) y resume la
  respuesta en UNA línea (la respuesta final del bot, recortada).
- Manda el mensaje SOLO a los usuarios con rol "admin" (Luis).
- Si nadie con rol consulta preguntó nada hoy, NO manda nada.

Uso:
  python resumen_consultas.py            -> arma e imprime (NO envía)
  python resumen_consultas.py --send     -> arma y envía por Telegram a los admins
"""
import os, sys, json, glob, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timezone, timedelta

HOME = Path.home()
AGENTS_DIR   = HOME / ".openclaw" / "agents"
CONSULTA_SESSIONS = AGENTS_DIR / "consulta" / "sessions"
USUARIOS_JSON = HOME / ".openclaw" / "usuarios_autorizados.json"
ENV_FILE = HOME / "genesis-orion" / "scripts" / ".env"

CR_TZ = timezone(timedelta(hours=-6))   # Costa Rica, sin horario de verano
MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
         "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
MAX_RESP = 140   # largo máx de la respuesta resumida en una línea


def load_env(path):
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_usuarios():
    data = json.loads(USUARIOS_JSON.read_text(encoding="utf-8"))
    return data.get("usuarios", {})


def cr_date(epoch_ms):
    return datetime.fromtimestamp(epoch_ms / 1000, CR_TZ).date()


def text_of(content):
    """Extrae el texto plano de un content (str o lista de partes)."""
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        out = []
        for part in content:
            if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                out.append(part["text"])
        return " ".join(out).strip()
    return ""


def one_line(s):
    s = " ".join(s.split())
    return s if len(s) <= MAX_RESP else s[:MAX_RESP - 1].rstrip() + "…"


def peer_id_from_trajectory(traj_path):
    """Saca el ID de Telegram del sessionKey (agent:consulta:telegram:direct:<ID>)."""
    try:
        with open(traj_path, encoding="utf-8") as f:
            for line in f:
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                sk = o.get("sessionKey", "")
                if "telegram:direct:" in sk:
                    return sk.split("telegram:direct:")[-1].split(":")[0]
    except FileNotFoundError:
        pass
    return None


def parse_session(jsonl_path, today):
    """Devuelve lista de (hh:mm, pregunta, respuesta_corta) de HOY en esa sesión."""
    msgs = []
    try:
        with open(jsonl_path, encoding="utf-8") as f:
            for line in f:
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                if o.get("type") != "message":
                    continue
                m = o.get("message", {})
                role = m.get("role")
                if role not in ("user", "assistant"):
                    continue
                ts = m.get("timestamp")
                if not isinstance(ts, (int, float)):
                    # fallback al timestamp ISO de la línea
                    iso = o.get("timestamp")
                    if iso:
                        try:
                            ts = datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000
                        except Exception:
                            ts = None
                msgs.append((role, text_of(m.get("content")), ts))
    except FileNotFoundError:
        return []

    # Emparejar: cada pregunta de usuario con la última respuesta del bot antes de
    # la siguiente pregunta.
    pares = []
    i = 0
    n = len(msgs)
    while i < n:
        role, text, ts = msgs[i]
        if role == "user" and text:
            # última respuesta assistant con texto antes del próximo user
            j = i + 1
            resp = ""
            while j < n and msgs[j][0] != "user":
                if msgs[j][0] == "assistant" and msgs[j][1]:
                    resp = msgs[j][1]
                j += 1
            if ts and cr_date(ts) == today:
                hhmm = datetime.fromtimestamp(ts / 1000, CR_TZ).strftime("%H:%M")
                pares.append((hhmm, text, one_line(resp) if resp else "(sin respuesta)"))
            i = j
        else:
            i += 1
    return pares


def build_report(usuarios, today):
    # IDs con rol consulta -> nombre
    consulta_ids = {uid: u.get("nombre", uid)
                    for uid, u in usuarios.items()
                    if u.get("rol") == "consulta" and not uid.startswith("PENDIENTE")}

    por_persona = {}  # nombre -> lista de (hh:mm, pregunta, resp)
    if CONSULTA_SESSIONS.is_dir():
        for traj in glob.glob(str(CONSULTA_SESSIONS / "*.trajectory.jsonl")):
            pid = peer_id_from_trajectory(traj)
            if pid is None or pid not in consulta_ids:
                continue
            plain = traj.replace(".trajectory.jsonl", ".jsonl")
            pares = parse_session(plain, today)
            if pares:
                por_persona.setdefault(consulta_ids[pid], []).extend(pares)

    if not por_persona:
        return None

    fecha_txt = f"{today.day} de {MESES[today.month]} {today.year}"
    lineas = [f"📋 Resumen de consultas — {fecha_txt}", ""]
    for nombre in sorted(por_persona):
        pares = sorted(por_persona[nombre], key=lambda p: p[0])
        lineas.append(f"{nombre} · {len(pares)} consulta" + ("s" if len(pares) != 1 else ""))
        for hhmm, preg, resp in pares:
            lineas.append(f"  {hhmm}  {preg}")
            lineas.append(f"        → {resp}")
        lineas.append("")
    return "\n".join(lineas).rstrip()


def send_telegram(token, chat_id, text):
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = json.dumps({"chat_id": chat_id, "text": text,
                       "disable_web_page_preview": True}).encode()
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def main():
    send = "--send" in sys.argv
    usuarios = load_usuarios()
    today = datetime.now(CR_TZ).date()

    report = build_report(usuarios, today)
    if report is None:
        print("Sin consultas de usuarios 'consulta' hoy — no se manda nada.")
        return

    print(report)
    if not send:
        print("\n(modo dry-run: usá --send para enviar)")
        return

    env = load_env(ENV_FILE)
    token = env.get("TELEGRAM_BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")
    if not token:
        raise SystemExit("ERROR: falta TELEGRAM_BOT_TOKEN")

    admins = [uid for uid, u in usuarios.items()
              if u.get("rol") == "admin" and not uid.startswith("PENDIENTE")]
    if not admins:
        # respaldo: usa el chat configurado en .env
        chat = env.get("TELEGRAM_CHAT_ID")
        admins = [chat] if chat else []

    for chat_id in admins:
        try:
            send_telegram(token, chat_id, report)
            print(f"✓ enviado a admin {chat_id}")
        except Exception as e:
            print(f"✗ error enviando a {chat_id}: {e}")


if __name__ == "__main__":
    main()
