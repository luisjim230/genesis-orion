#!/usr/bin/env python3
"""
guardian_presupuesto.py — Guardián de Presupuesto de Meta (marketing #3) · V1 SIN LLM.

Vigila el gasto de pauta en Meta y AVISA solo cuando hay una anomalía (un gasto
muy por encima de lo normal — ej. el error real PANEL ACUST: $1.339 en vez de
$134). SOLO LEE meta_insights_daily (que NOVA refresca a diario). Nunca toca el
presupuesto (regla de seguridad #2).

Anti-fatiga (regla del Ciclo de Decisión): si no hay nada raro, NO manda nada.
Solo escala lo que importa.

Cadencia: corre 1x/día por la mañana (lo agenda el daemon), después de que NOVA
sincronizó la data del día. OJO: la data de Meta se actualiza 1x/día, así que la
detección es "a la mañana siguiente", no en tiempo real (NOVA corre 1x/día).

Uso:
  python guardian_presupuesto.py            -> imprime el análisis (NO envía)
  python guardian_presupuesto.py --send     -> envía a Telegram SOLO si hay anomalía
"""
import os, sys, json, urllib.request, urllib.error
from pathlib import Path
from datetime import date, datetime, timedelta

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

# Umbrales (tunables). Una campaña se marca anómala si su gasto del último día:
#   - es >= RATIO veces su promedio reciente, Y
#   - saltó al menos FLOOR_JUMP dólares por encima del promedio, Y
#   - el gasto en sí es de al menos MIN_SPEND (ignora ruido de campañas chiquitas).
RATIO      = 3.0
FLOOR_JUMP = 15.0
MIN_SPEND  = 10.0
VENTANA_DIAS = 21          # días hacia atrás para construir el promedio "normal"

MESES = ["","enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"]

def usd(n):
    try:    return "$" + f"{float(n):,.0f}"
    except Exception: return "$0"

def usd2(n):
    try:    return "$" + f"{float(n):,.2f}"
    except Exception: return "$0.00"

def _f(v):
    try:    return float(v or 0)
    except Exception: return 0.0

# ── Supabase ──────────────────────────────────────────────────────────────────
def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

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

# ── Análisis ──────────────────────────────────────────────────────────────────
def analizar():
    desde = (date.today() - timedelta(days=VENTANA_DIAS)).isoformat()
    rows = supa_get(f"meta_insights_daily?date=gte.{desde}"
                    "&select=campaign_name,date,spend&limit=10000")
    if not rows:
        return None, [], None

    # gasto por (campaña, día) y por día (total cuenta)
    porcamp = {}            # campaña -> {fecha: gasto}
    pordia_total = {}       # fecha -> gasto total
    for r in rows:
        c = (r.get("campaign_name") or "(sin nombre)").strip()
        d = r.get("date")
        s = _f(r.get("spend"))
        porcamp.setdefault(c, {})[d] = porcamp.setdefault(c, {}).get(d, 0.0) + s
        pordia_total[d] = pordia_total.get(d, 0.0) + s

    ult = max(pordia_total.keys())     # último día con data sincronizada

    anomalias = []
    for c, dias in porcamp.items():
        hoy_g = dias.get(ult, 0.0)
        previos = [g for d, g in dias.items() if d < ult]
        base = (sum(previos) / len(previos)) if previos else 0.0
        if hoy_g >= MIN_SPEND and hoy_g >= RATIO * max(base, 0.01) and (hoy_g - base) >= FLOOR_JUMP:
            anomalias.append({"campana": c, "hoy": hoy_g, "base": base,
                              "x": (hoy_g / base) if base > 0 else None})
    anomalias.sort(key=lambda a: -a["hoy"])

    # anomalía a nivel cuenta (total)
    tot_hoy = pordia_total.get(ult, 0.0)
    tot_prev = [g for d, g in pordia_total.items() if d < ult]
    tot_base = (sum(tot_prev) / len(tot_prev)) if tot_prev else 0.0
    cuenta = None
    if tot_hoy >= RATIO * max(tot_base, 0.01) and (tot_hoy - tot_base) >= FLOOR_JUMP:
        cuenta = {"hoy": tot_hoy, "base": tot_base}

    return ult, anomalias, cuenta

def render():
    ult, anomalias, cuenta = analizar()
    if ult is None:
        return "🛡️ Guardián de Presupuesto: sin datos de Meta para revisar.", False
    if not anomalias and not cuenta:
        return (f"🛡️ Guardián de Presupuesto: sin anomalías de gasto al {ult}. Todo normal.", False)

    d = datetime.strptime(ult, "%Y-%m-%d").date()
    o = [f"🚨 <b>Alerta de presupuesto — Meta</b>",
         f"Gasto del {d.day} de {MESES[d.month]} fuera de lo normal:"]
    if cuenta:
        o.append(f"• <b>Total de la cuenta</b>: {usd2(cuenta['hoy'])} "
                 f"(normal ~{usd2(cuenta['base'])})")
    for a in anomalias[:6]:
        xtxt = f" · {a['x']:.0f}x" if a["x"] else ""
        o.append(f"• <b>{a['campana'][:34]}</b>: {usd2(a['hoy'])} "
                 f"(normal ~{usd2(a['base'])}{xtxt})")
    o.append("")
    o.append("💡 Revisá si algún presupuesto quedó mal seteado (ej. un dígito de más).")
    o.append("❓ ¿Lo ajustaste vos, o querés que revise esas campañas?")
    return "\n".join(o), True

if __name__ == "__main__":
    msg, hay = render()
    if "--send" in sys.argv:
        if hay:
            res = enviar(msg)
            print("Enviado:", res.get("ok"))
        else:
            print("Sin anomalías; no se envía (anti-fatiga).")
    else:
        print(msg)
