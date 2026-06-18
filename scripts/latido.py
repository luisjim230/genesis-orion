#!/usr/bin/env python3
"""
latido.py — Latido, ángel guardián de dios (coro de ángeles) · V1 SIN LLM.

Cada noche verifica que los agentes que TENÍAN que correr hoy efectivamente
corrieron (y sin error), y manda UN solo mensaje: "✅ corrieron N/N" o avisa cuál
faltó / falló. Es el vigilante de los vigilantes.

Lee ~/sol-logs/agent_runs.jsonl, que el daemon escribe cada vez que dispara un
agente (línea JSON: {ts, agente, rc}). El latido de infraestructura del daemon ya
existe aparte; Latido lo eleva a nivel de agentes.

Uso:
  python latido.py            -> imprime el parte (NO envía)
  python latido.py --send     -> envía a Telegram (manda siempre: es la confirmación nocturna)
"""
import os, sys, json
from pathlib import Path
from datetime import date

import urllib.request, urllib.error
BASE = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT  = os.getenv("TELEGRAM_CHAT_ID")
RUNS_FILE = Path.home() / "sol-logs" / "agent_runs.jsonl"

# Agentes esperados por día de semana (0=lun ... 6=dom). Mismos nombres que usa el
# daemon al registrar la corrida. Domingo no corre nada (y Latido tampoco).
DIARIOS = ["Reporte Matutino", "Guardián de Presupuesto"]
POR_DIA = {
    0: ["Reporte de Pauta"],       # lunes
    2: ["Ezequiel (quiebres)"],    # miércoles
    3: ["Mateo (financiero)"],     # jueves
    4: ["Auditoría de Pauta"],     # viernes
}

def esperados(wd):
    return DIARIOS + POR_DIA.get(wd, [])

def corridas_hoy():
    hoy = date.today().isoformat()
    ok, fail = set(), {}
    try:
        for line in RUNS_FILE.read_text().splitlines():
            try:    r = json.loads(line)
            except Exception: continue
            if str(r.get("ts", ""))[:10] == hoy:
                if r.get("rc") == 0: ok.add(r.get("agente"))
                else:                fail[r.get("agente")] = r.get("rc")
    except Exception:
        pass
    return ok, fail

def enviar(msg):
    if not TG_TOKEN or not TG_CHAT:
        raise SystemExit("Para --send faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en scripts/.env")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        data=json.dumps({"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML",
                         "disable_web_page_preview": True}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def render():
    wd = date.today().weekday()
    exp = esperados(wd)
    ok, fail = corridas_hoy()
    n_ok = sum(1 for a in exp if a in ok)
    fallaron = [a for a in exp if a in fail]
    faltaron = [a for a in exp if a not in ok and a not in fail]

    if not fallaron and not faltaron:
        return f"✅ <b>Latido</b> — corrieron {n_ok}/{len(exp)} agentes hoy. Todo en orden. 🌙"

    o = [f"⚠️ <b>Latido</b> — {n_ok}/{len(exp)} agentes OK hoy."]
    if fallaron:
        o.append("❌ Fallaron: " + ", ".join(f"{a} (rc {fail[a]})" for a in fallaron))
    if faltaron:
        o.append("🕳️ No corrieron: " + ", ".join(faltaron))
    o.append("\n❓ <b>¿Reviso el daemon?</b>")
    return "\n".join(o)

if __name__ == "__main__":
    msg = render()
    if "--send" in sys.argv:
        print("Enviado:", enviar(msg).get("ok"))
    else:
        print(msg)
