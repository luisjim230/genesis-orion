#!/usr/bin/env python3
"""
reportero_performance.py — Reportero de Performance de Pauta (Meta) · V1 SIN LLM.

Primer agente del departamento de marketing. Le llega a Luis por Telegram los
LUNES por la mañana con el cierre de la semana pasada (lun-dom completos) de la
pauta de Meta. SOLO LEE (tabla meta_insights_daily, que NOVA refresca a diario):
cero riesgo, nunca toca el presupuesto (regla de seguridad #2).

KPI rey = CONVERSACIONES de WhatsApp y su COSTO POR CONVERSACIÓN (la conversión
real del negocio hoy). Las COMPRAS/web se muestran con asterisco: el pixel está
roto (Purchase no dispara, falta Conversions API + desactivar el pixel MONEO),
así que ROAS no es confiable todavía.

Sigue el Ciclo de Decisión: brevedad, una mini-auditoría (mejor vs peor campaña)
y cierra con "💡 Lo que yo haría" + UNA pregunta.

Uso:
  python reportero_performance.py            -> renderiza e imprime (NO envía)
  python reportero_performance.py --send     -> envía a Telegram
  python reportero_performance.py --semana-actual  -> usa la semana en curso (debug)
"""
import os, sys, json, urllib.parse, urllib.request, urllib.error
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

MESES = ["","enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"]

# Umbral para que una campaña entre a la mini-auditoría (evita ruido de campañas
# con casi nada de gasto/conversaciones).
MIN_GASTO_AUDIT = 2.0
MIN_CONV_AUDIT  = 5

# ── Formato ───────────────────────────────────────────────────────────────────
def usd(n):
    try:    return "$" + f"{float(n):,.0f}"
    except Exception: return "$0"

def usd2(n):
    try:    return "$" + f"{float(n):,.2f}"
    except Exception: return "$0.00"

def variacion(a, b):
    """% de cambio de a vs b; None si b es 0/None."""
    try:
        b = float(b)
        if b == 0: return None
        return (float(a) - b) / b * 100
    except Exception:
        return None

def flecha(p):
    if p is None: return "s/d"
    return ("📈 +" if p >= 0 else "📉 ") + f"{p:.0f}%"

def costo_conv(gasto, conv):
    try:
        conv = float(conv)
        return float(gasto) / conv if conv else None
    except Exception:
        return None

# ── Supabase (PostgREST) ──────────────────────────────────────────────────────
def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

CAMPOS = ("campaign_name,spend,conversations_started,messaging_connections,"
          "link_clicks,impressions,reach,purchases,purchase_value")

def fetch_insights(desde, hasta):
    """Filas diarias por campaña en [desde, hasta] (inclusive)."""
    q = (f"meta_insights_daily?date=gte.{desde.isoformat()}&date=lte.{hasta.isoformat()}"
         f"&select={CAMPOS}&limit=5000")
    return supa_get(q)

# ── Agregación en Python (volumen chico: ~50-150 filas/semana) ────────────────
def _f(v):
    try:    return float(v or 0)
    except Exception: return 0.0

def totales(rows):
    t = {"gasto":0.0,"conv":0.0,"msg":0.0,"clicks":0.0,"impr":0.0,
         "reach":0.0,"compras":0.0,"valor":0.0}
    for r in rows:
        t["gasto"]   += _f(r.get("spend"))
        t["conv"]    += _f(r.get("conversations_started"))
        t["msg"]     += _f(r.get("messaging_connections"))
        t["clicks"]  += _f(r.get("link_clicks"))
        t["impr"]    += _f(r.get("impressions"))
        t["reach"]   += _f(r.get("reach"))
        t["compras"] += _f(r.get("purchases"))
        t["valor"]   += _f(r.get("purchase_value"))
    return t

def por_campana(rows):
    agg = {}
    for r in rows:
        k = (r.get("campaign_name") or "(sin nombre)").strip()
        a = agg.setdefault(k, {"gasto":0.0,"conv":0.0,"clicks":0.0,"impr":0.0})
        a["gasto"]  += _f(r.get("spend"))
        a["conv"]   += _f(r.get("conversations_started"))
        a["clicks"] += _f(r.get("link_clicks"))
        a["impr"]   += _f(r.get("impressions"))
    return agg

# ── Fechas: última semana COMPLETA (lun-dom) ─────────────────────────────────
def semana_pasada(hoy=None):
    hoy = hoy or date.today()
    lunes_esta = hoy - timedelta(days=hoy.weekday())   # lunes de la semana en curso
    fin = lunes_esta - timedelta(days=1)               # domingo pasado
    ini = lunes_esta - timedelta(days=7)               # lunes pasado
    return ini, fin

def semana_actual(hoy=None):
    hoy = hoy or date.today()
    ini = hoy - timedelta(days=hoy.weekday())
    return ini, hoy

def rango_txt(ini, fin):
    if ini.month == fin.month:
        return f"{ini.day}–{fin.day} {MESES[fin.month]}"
    return f"{ini.day} {MESES[ini.month]} – {fin.day} {MESES[fin.month]}"

# ── Bloques ───────────────────────────────────────────────────────────────────
def bloque_resumen(cur, prev):
    o = ["💰 <b>Resumen de la semana</b>"]
    o.append(f"Gasto: <b>{usd2(cur['gasto'])}</b>  ·  {flecha(variacion(cur['gasto'], prev['gasto']))} vs semana previa")
    o.append(f"Conversaciones: <b>{cur['conv']:.0f}</b>  ·  {flecha(variacion(cur['conv'], prev['conv']))}")
    cc, ccp = costo_conv(cur['gasto'], cur['conv']), costo_conv(prev['gasto'], prev['conv'])
    if cc is not None:
        # OJO: en costo, BAJAR es bueno → invertimos la lectura de la flecha.
        v = variacion(cc, ccp)
        lectura = "s/d" if v is None else (("📉 " if v <= 0 else "📈 +") + f"{v:.0f}% " + ("(mejor 👍)" if v <= 0 else "(más caro)"))
        o.append(f"Costo x conversación: <b>{usd2(cc)}</b>  ·  {lectura}")
    o.append(f"Clics al enlace: {cur['clicks']:.0f}  ·  Alcance: {cur['reach']:.0f}")
    return "\n".join(o)

def bloque_campanas(agg):
    """Top campañas por gasto + mini-auditoría: la más y la menos eficiente."""
    activas = [(k,v) for k,v in agg.items() if v["gasto"] > 0]
    if not activas:
        return "📑 <b>Campañas</b>\n   Sin gasto en el periodo."
    activas.sort(key=lambda kv: -kv[1]["gasto"])
    o = ["📑 <b>Campañas</b> (por gasto)"]
    for k, v in activas[:6]:
        cc = costo_conv(v["gasto"], v["conv"])
        cc_txt = usd2(cc) + "/conv" if cc is not None else "0 conv"
        o.append(f"   • {k[:34]} — {usd2(v['gasto'])} → {v['conv']:.0f} conv ({cc_txt})")

    # Mini-auditoría: comparar eficiencia entre campañas con volumen suficiente.
    elegibles = [(k,v,costo_conv(v["gasto"],v["conv"])) for k,v in activas
                 if v["gasto"] >= MIN_GASTO_AUDIT and v["conv"] >= MIN_CONV_AUDIT]
    elegibles = [e for e in elegibles if e[2] is not None]
    if len(elegibles) >= 2:
        mejor = min(elegibles, key=lambda e: e[2])
        peor  = max(elegibles, key=lambda e: e[2])
        if mejor[0] != peor[0]:
            o.append("")
            o.append(f"🥇 Más eficiente: <b>{mejor[0][:30]}</b> ({usd2(mejor[2])}/conv)")
            o.append(f"🐢 Más cara: <b>{peor[0][:30]}</b> ({usd2(peor[2])}/conv)")
    return "\n".join(o)

def bloque_web(cur, prev):
    o = ["🛒 <b>Ventas web (pixel)</b> ⚠️"]
    o.append(f"Compras registradas: {cur['compras']:.0f}  ·  Valor: {usd2(cur['valor'])}")
    o.append("   <i>El pixel no mide bien las compras todavía (falta Purchase + "
             "Conversions API y desactivar el pixel MONEO). No te fíes de este número aún.</i>")
    return "\n".join(o)

def bloque_sugerencia(cur, prev, agg):
    """💡 Proactividad de startup + UNA pregunta (Ciclo de Decisión)."""
    o = ["💡 <b>Lo que yo haría</b>"]
    pista, pregunta = None, None

    # Detección simple de "fuga": campaña con costo/conv muy peor que el promedio.
    activas = [(k,v,costo_conv(v["gasto"],v["conv"])) for k,v in agg.items()
               if v["gasto"] >= MIN_GASTO_AUDIT and v["conv"] >= MIN_CONV_AUDIT]
    activas = [a for a in activas if a[2] is not None]
    cc_global = costo_conv(cur["gasto"], cur["conv"])
    if activas and cc_global:
        peor = max(activas, key=lambda a: a[2])
        if peor[2] > cc_global * 1.6:
            pista = (f"“{peor[0][:30]}” trae conversaciones a {usd2(peor[2])}, muy por "
                     f"encima del promedio ({usd2(cc_global)}). Vale la pena revisar su "
                     f"creativo/segmentación o moverle el presupuesto a las que rinden.")
            pregunta = f"¿Reviso a fondo “{peor[0][:30]}” o la pauso por ahora?"

    if not pista:
        vg = variacion(cur["gasto"], prev["gasto"])
        if vg is not None and vg < -40:
            pista = ("El gasto cayó fuerte vs la semana pasada. Si fue a propósito, ok; "
                     "si no, puede que una campaña se haya quedado sin presupuesto o pausada.")
            pregunta = "¿La bajada de gasto fue intencional?"
    if not pista:
        pista = "Las campañas vienen rindiendo parejo. Mantené el rumbo y ojo al pixel."
        pregunta = "¿Querés que la próxima semana sume el desglose por día?"

    o.append(f"   {pista}")
    return "\n".join(o), pregunta

# ── Render ───────────────────────────────────────────────────────────────────
def render(usar_actual=False):
    hoy = date.today()
    ini, fin = (semana_actual(hoy) if usar_actual else semana_pasada(hoy))
    p_ini, p_fin = ini - timedelta(days=7), fin - timedelta(days=7)

    rows_cur  = fetch_insights(ini, fin)
    rows_prev = fetch_insights(p_ini, p_fin)
    cur, prev = totales(rows_cur), totales(rows_prev)
    agg = por_campana(rows_cur)

    cab = (f"📣 <b>Reporte de Pauta — Meta</b>\n"
           f"Semana {rango_txt(ini, fin)}")
    bloques = [bloque_resumen(cur, prev), bloque_campanas(agg), bloque_web(cur, prev)]
    sug, pregunta = bloque_sugerencia(cur, prev, agg)
    bloques.append(sug)
    cuerpo = cab + "\n\n" + "\n\n".join(bloques)
    if pregunta:
        cuerpo += f"\n\n❓ <b>{pregunta}</b>"
    return cuerpo

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

if __name__ == "__main__":
    mensaje = render(usar_actual="--semana-actual" in sys.argv)
    if "--send" in sys.argv:
        res = enviar(mensaje)
        print("Enviado:", res.get("ok"))
    else:
        print(mensaje)
