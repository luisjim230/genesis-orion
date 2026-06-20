#!/usr/bin/env python3
"""
mateo_financiero.py — Mateo, Analista Financiero (coro de ángeles) · V1 SIN LLM.

Pulso financiero semanal por Telegram: ventas vs compras del mes (flujo de
inventario a costo), margen real (distinguiendo markup de margen), y la SIRENA de
SKUs bajo el piso de 20% de markup — avisa si la lista CRECE semana a semana.

Los números salen de la función read-only sol_pulso_financiero() (agrega sobre las
755k facturas en la base, no se baja nada). Cierra con una pregunta (Ciclo de
Decisión). Compara la sirena contra la corrida anterior (archivo de estado).

NO incluye (V1): posición de caja vs escalera de CDPs ni lectura de los estados
financieros de Ronald — esos datos no están en la base todavía (quedan para V2,
cuando se cargue una fuente).

Uso:
  python mateo_financiero.py            -> renderiza e imprime (NO envía)
  python mateo_financiero.py --send     -> envía a Telegram
"""
import os, sys, json, urllib.request, urllib.error
from pathlib import Path
from datetime import date

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

ESTADO = Path.home() / "sol-logs" / "mateo_estado.json"
PISO_MARKUP = 20
MESES = ["","enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"]

def _f(v):
    try:    return float(v or 0)
    except Exception: return 0.0

def crcM(n):
    """Colones en millones para legibilidad: ₡188.0M, o ₡guita si es chico."""
    n = _f(n)
    if abs(n) >= 1_000_000:
        return "₡" + f"{n/1_000_000:,.1f}M".replace(",", ".")
    return "₡" + f"{round(n):,}".replace(",", ".")

def supa_rpc(fn, args=None):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/{fn}", data=json.dumps(args or {}).encode(), method="POST",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
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

def leer_estado():
    try:    return json.loads(ESTADO.read_text())
    except Exception: return {}

def guardar_estado(bajo, perd):
    try:
        ESTADO.parent.mkdir(parents=True, exist_ok=True)
        ESTADO.write_text(json.dumps({"fecha": date.today().isoformat(),
                                      "bajo_piso": bajo, "a_perdida": perd}))
    except Exception:
        pass

def delta_txt(actual, previo):
    if previo is None: return ""
    d = actual - previo
    if d > 0:  return f" (↑ +{d} vs la semana pasada ⚠️)"
    if d < 0:  return f" (↓ {d} vs la semana pasada 👍)"
    return " (igual que la semana pasada)"

def render():
    row = supa_rpc("sol_pulso_financiero")
    r = row[0] if isinstance(row, list) and row else (row or {})
    ventas  = _f(r.get("ventas_mes")); costo = _f(r.get("costo_mes"))
    compras = _f(r.get("compras_mes"))
    bajo = int(_f(r.get("markup_bajo_piso"))); perd = int(_f(r.get("markup_a_perdida")))

    margen = (ventas - costo) / ventas * 100 if ventas else 0
    markup = (ventas - costo) / costo * 100 if costo else 0
    flujo = costo - compras   # costo de lo vendido vs lo comprado (ambos a costo)

    hoy = date.today()
    o = [f"💰 <b>Pulso Financiero — {MESES[hoy.month]}</b> (al {hoy.day})"]
    o.append(f"Ventas: <b>{crcM(ventas)}</b> · margen bruto <b>{margen:.0f}%</b> (markup ~{markup:.0f}%)")
    o.append(f"Compras: <b>{crcM(compras)}</b> · costo de lo vendido {crcM(costo)}")
    if flujo > 0:
        o.append(f"   → estás <b>bajando inventario</b> ~{crcM(flujo)} (vendés más rápido de lo que reponés)")
    elif flujo < 0:
        o.append(f"   → estás <b>cargando inventario</b> ~{crcM(-flujo)} (comprás más de lo que vendés)")

    prev = leer_estado()
    o.append(f"\n🚨 <b>SKUs bajo el piso de {PISO_MARKUP}% markup: {bajo}</b>"
             f"{delta_txt(bajo, prev.get('bajo_piso'))}")
    o.append(f"   De esos, <b>{perd} a pérdida</b> (precio por debajo del costo)"
             f"{delta_txt(perd, prev.get('a_perdida'))}")

    o.append("\n💡 <b>Lo que yo haría</b>")
    if perd > 0:
        o.append(f"   Atacá primero los {perd} a pérdida — cada venta de esos te cuesta plata. Repreciá o discontinuá.")
        preg = f"¿Te paso la lista de los {perd} a pérdida para repreciar?"
    else:
        o.append("   Margen sano y sin productos a pérdida. Mantené el ojo en los que están cerca del piso.")
        preg = "¿Querés ver los que están más cerca del piso de markup?"
    o.append(f"\n❓ <b>{preg}</b>")
    o.append("\n<i>(Margen ≠ markup: 100% de markup = 50% de margen. Caja/CDPs y estados de Ronald: aún no en la base.)</i>")

    guardar_estado(bajo, perd)
    return "\n".join(o)

if __name__ == "__main__":
    msg = render()
    if "--send" in sys.argv:
        print("Enviado:", enviar(msg).get("ok"))
    else:
        print(msg)
