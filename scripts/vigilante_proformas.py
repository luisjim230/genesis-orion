#!/usr/bin/env python3
"""
vigilante_proformas.py — Vigilante de Proformas (ventas) · V1 SIN LLM.

Persigue las cotizaciones para que no se enfríen: qué toca seguir HOY, qué está
atrasado, cuánta plata hay en juego y quién (vendedor) tiene más por perseguir.
SOLO LEE (hermes_panel_view + RPC sol_proformas_resumen). Cierra con una pregunta.

Es el agente dedicado (antes esto vivía parcial dentro del Reporte Matutino).
La versión por-vendedor para el grupo del equipo es de Fase 2.

Uso:
  python vigilante_proformas.py            -> renderiza e imprime (NO envía)
  python vigilante_proformas.py --send     -> envía a Telegram
"""
import os, sys, json, urllib.request, urllib.error
from pathlib import Path

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

def crc(n):
    try:    return "₡" + f"{round(float(n)):,}".replace(",", ".")
    except Exception: return "₡0"

def crcM(n):
    try:
        n = float(n)
        return ("₡" + f"{n/1_000_000:,.1f}M".replace(",", ".")) if abs(n) >= 1_000_000 else crc(n)
    except Exception: return "₡0"

def _f(v):
    try:    return float(v or 0)
    except Exception: return 0.0

def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def supa_rpc(fn, args=None):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/{fn}", data=json.dumps(args or {}).encode(), method="POST",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}", "Content-Type": "application/json"})
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

def render():
    resumen = {r["semaforo"]: r for r in supa_rpc("sol_proformas_resumen")}
    def res(sem):
        r = resumen.get(sem, {})
        return int(_f(r.get("n"))), _f(r.get("total"))

    # Detalle accionable: lo que toca hoy + lo atrasado, por monto
    det = supa_get("hermes_panel_view?facturada=eq.false&semaforo=in.(toca_hoy,atrasado)"
                   "&order=monto_total.desc&limit=400"
                   "&select=vendedor,cliente,monto_total,dias_desde_proforma,semaforo")

    n_hoy, t_hoy = res("toca_hoy")
    n_atr, t_atr = res("atrasado")
    n_sc,  t_sc  = res("sin_contactar")

    o = ["📄 <b>Vigilante de Proformas</b>"]

    hoy = [d for d in det if d.get("semaforo") == "toca_hoy"]
    if n_hoy:
        o.append(f"\n🎯 <b>Toca seguir HOY: {n_hoy}</b> proformas · {crcM(t_hoy)}")
        for d in hoy[:3]:
            o.append(f"   • {crc(d['monto_total'])} — {(d.get('cliente') or '?')[:26]} ({(d.get('vendedor') or '?')[:14]})")

    atr = [d for d in det if d.get("semaforo") == "atrasado"]
    if n_atr:
        o.append(f"\n⏰ <b>Atrasadas: {n_atr}</b> · {crcM(t_atr)}")
        for d in atr[:3]:
            o.append(f"   • {crc(d['monto_total'])} — {(d.get('cliente') or '?')[:26]} "
                     f"({d.get('dias_desde_proforma','?')}d, {(d.get('vendedor') or '?')[:14]})")

    # Por vendedor (sobre lo accionable: toca hoy + atrasado)
    porv = {}
    for d in det:
        porv[d.get("vendedor") or "?"] = porv.get(d.get("vendedor") or "?", 0.0) + _f(d.get("monto_total"))
    if porv:
        top = sorted(porv.items(), key=lambda kv: -kv[1])[:3]
        o.append("\n👤 <b>Quién tiene más por perseguir</b> (hoy+atrasadas):")
        for v, m in top:
            o.append(f"   • {v[:18]} — {crcM(m)}")

    if n_sc:
        o.append(f"\n🗂️ Backlog: <b>{n_sc} proformas sin contactar nunca</b> ({crcM(t_sc)}). "
                 "Mina de oro sin tocar.")

    o.append("\n💡 <b>Lo que yo haría</b>: arrancá por las que tocan hoy y las atrasadas de mayor monto — "
             "ahí está la plata más fácil de cerrar.")
    o.append("\n❓ <b>¿Querés la lista por vendedor para repartir el seguimiento?</b>")
    return "\n".join(o)

if __name__ == "__main__":
    msg = render()
    if "--send" in sys.argv:
        print("Enviado:", enviar(msg).get("ok"))
    else:
        print(msg)
