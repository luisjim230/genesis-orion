#!/usr/bin/env python3
"""
auditor_pauta.py — Auditor-Consultor de Pauta de Meta (marketing #2) · V1 SIN LLM.

El "media buyer en modo consultoría": mira el gasto de pauta de los últimos 30 días
y lo analiza con ojo experto — campañas GANADORAS vs PERDEDORAS, FUGAS de presupuesto
(gasto alto que rinde mal), concentración del gasto, tendencia, y mejor/peor día.
RECOMIENDA qué mejorar; la mano sobre el presupuesto es SIEMPRE de Luis (regla de
seguridad #2: nunca ejecuta cambios de gasto).

KPI rey = costo por CONVERSACIÓN de WhatsApp (la conversión real). Las compras/web
se omiten acá hasta arreglar el pixel.

SOLO LEE meta_insights_daily (que NOVA refresca a diario). Cero LLM en V1: los
números salen de SQL y la lectura experta sale de reglas fijas (un pulido con Haiku
queda para V2). Cierra con una recomendación + una pregunta (Ciclo de Decisión).

Uso:
  python auditor_pauta.py            -> renderiza e imprime (NO envía)
  python auditor_pauta.py --send     -> envía a Telegram
  python auditor_pauta.py --dias 14  -> cambia la ventana (default 30)
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

# Umbrales (tunables). Una campaña entra al ranking si tiene volumen suficiente
# en la ventana; una "fuga" es gasto significativo que rinde muy por debajo del promedio.
MIN_GASTO_RANK = 5.0       # gasto mínimo en la ventana para rankear
MIN_CONV_RANK  = 10        # conversaciones mínimas para rankear
FUGA_RATIO     = 1.8       # costo/conv >= 1.8x el promedio de la cuenta = fuga
FUGA_MIN_GASTO = 10.0      # y al menos este gasto para que valga la pena marcarla
DIAS_DEFAULT   = 30

DOW = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]

def usd(n):
    try:    return "$" + f"{float(n):,.0f}"
    except Exception: return "$0"

def usd2(n):
    try:    return "$" + f"{float(n):,.2f}"
    except Exception: return "$0.00"

def _f(v):
    try:    return float(v or 0)
    except Exception: return 0.0

def cpc(gasto, conv):
    try:
        conv = float(conv)
        return float(gasto) / conv if conv else None
    except Exception:
        return None

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

# ── Datos ─────────────────────────────────────────────────────────────────────
def fetch(dias):
    desde = (date.today() - timedelta(days=dias)).isoformat()
    return supa_get(f"meta_insights_daily?date=gte.{desde}"
                    "&select=campaign_name,date,spend,conversations_started,link_clicks,impressions"
                    "&limit=20000")

def por_campana(rows):
    agg = {}
    for r in rows:
        c = (r.get("campaign_name") or "(sin nombre)").strip()
        a = agg.setdefault(c, {"gasto":0.0,"conv":0.0,"clicks":0.0,"impr":0.0})
        a["gasto"]  += _f(r.get("spend"))
        a["conv"]   += _f(r.get("conversations_started"))
        a["clicks"] += _f(r.get("link_clicks"))
        a["impr"]   += _f(r.get("impressions"))
    return agg

def totales(rows):
    t = {"gasto":0.0,"conv":0.0}
    for r in rows:
        t["gasto"] += _f(r.get("spend")); t["conv"] += _f(r.get("conversations_started"))
    return t

def tendencia(rows, dias):
    """costo/conv de la mitad reciente vs la mitad previa de la ventana."""
    corte = (date.today() - timedelta(days=dias // 2)).isoformat()
    rec = {"g":0.0,"c":0.0}; pre = {"g":0.0,"c":0.0}
    for r in rows:
        d = r.get("date","")
        tgt = rec if d >= corte else pre
        tgt["g"] += _f(r.get("spend")); tgt["c"] += _f(r.get("conversations_started"))
    return cpc(rec["g"], rec["c"]), cpc(pre["g"], pre["c"])

def por_dia_semana(rows):
    g = [0.0]*7; c = [0.0]*7
    for r in rows:
        try:
            wd = datetime.strptime(r.get("date"), "%Y-%m-%d").weekday()
        except Exception:
            continue
        g[wd] += _f(r.get("spend")); c[wd] += _f(r.get("conversations_started"))
    res = []
    for i in range(7):
        cc = cpc(g[i], c[i])
        if cc is not None and c[i] >= 5:
            res.append((i, cc, g[i]))
    return res

# ── Render ────────────────────────────────────────────────────────────────────
def render(dias):
    rows = fetch(dias)
    if not rows:
        return "🔍 <b>Auditoría de Pauta</b>\nSin datos de Meta para el período."
    agg = por_campana(rows); tot = totales(rows)
    cc_cuenta = cpc(tot["gasto"], tot["conv"])

    rankeables = []
    for c, v in agg.items():
        cc = cpc(v["gasto"], v["conv"])
        if v["gasto"] >= MIN_GASTO_RANK and v["conv"] >= MIN_CONV_RANK and cc is not None:
            rankeables.append({"c":c, "cc":cc, **v})
    rankeables.sort(key=lambda x: x["cc"])   # menor costo/conv = mejor

    o = [f"🔍 <b>Auditoría de Pauta — últimos {dias} días</b>"]
    o.append(f"Gasto: <b>{usd2(tot['gasto'])}</b> · {tot['conv']:.0f} conversaciones · "
             f"costo/conv <b>{usd2(cc_cuenta) if cc_cuenta else 's/d'}</b>")
    cc_rec, cc_pre = tendencia(rows, dias)
    if cc_rec is not None and cc_pre is not None:
        if cc_rec < cc_pre:  o.append(f"📉 Tendencia: mejorando ({usd2(cc_pre)} → {usd2(cc_rec)} por conv) 👍")
        elif cc_rec > cc_pre:o.append(f"📈 Tendencia: encareciendo ({usd2(cc_pre)} → {usd2(cc_rec)} por conv) ⚠️")

    # Ganadoras y perdedoras
    if rankeables:
        o.append("\n🏆 <b>Ganadoras</b> (mejor costo/conv):")
        for r in rankeables[:3]:
            o.append(f"   • {r['c'][:32]} — {usd2(r['cc'])}/conv ({r['conv']:.0f} conv, {usd2(r['gasto'])})")
        if len(rankeables) >= 2:
            o.append("🐢 <b>Perdedoras</b> (peor costo/conv):")
            for r in rankeables[-2:][::-1]:
                o.append(f"   • {r['c'][:32]} — {usd2(r['cc'])}/conv ({r['conv']:.0f} conv, {usd2(r['gasto'])})")

    # Fugas de presupuesto
    fugas = [r for r in rankeables
             if cc_cuenta and r["cc"] >= FUGA_RATIO * cc_cuenta and r["gasto"] >= FUGA_MIN_GASTO]
    if fugas:
        o.append("\n💸 <b>Posibles fugas</b> (gastan bien pero rinden mal):")
        for r in sorted(fugas, key=lambda x: -x["gasto"])[:3]:
            o.append(f"   • {r['c'][:32]}: {usd2(r['gasto'])} a {usd2(r['cc'])}/conv "
                     f"(la cuenta promedia {usd2(cc_cuenta)})")

    # Concentración del gasto
    if tot["gasto"] > 0 and rankeables:
        top = max(rankeables, key=lambda x: x["gasto"])
        share = top["gasto"] / tot["gasto"] * 100
        if share >= 35:
            o.append(f"\n📦 Concentración: <b>{top['c'][:28]}</b> se lleva el {share:.0f}% del gasto.")

    # Mejor / peor día
    dsem = por_dia_semana(rows)
    if len(dsem) >= 3:
        mejor = min(dsem, key=lambda x: x[1]); peor = max(dsem, key=lambda x: x[1])
        o.append(f"📅 Mejor día: <b>{DOW[mejor[0]]}</b> ({usd2(mejor[1])}/conv) · "
                 f"peor: {DOW[peor[0]]} ({usd2(peor[1])}/conv)")

    # Recomendación (siempre como sugerencia; Luis ejecuta)
    o.append("\n💡 <b>Lo que yo haría</b>")
    rec = None
    if fugas and rankeables:
        mejor = rankeables[0]; f = sorted(fugas, key=lambda x: -x["gasto"])[0]
        rec = (f"Mové parte del presupuesto de “{f['c'][:28]}” (rinde a {usd2(f['cc'])}/conv) "
               f"hacia “{mejor['c'][:28]}” (rinde a {usd2(mejor['cc'])}/conv). Misma plata, más conversaciones.")
        preg = f"¿Reviso a fondo “{f['c'][:28]}” (creativo/segmentación) o le bajo el presupuesto?"
    elif len(rankeables) >= 2:
        mejor = rankeables[0]; peor = rankeables[-1]
        rec = (f"“{mejor['c'][:28]}” es tu mejor caballo ({usd2(mejor['cc'])}/conv) y "
               f"“{peor['c'][:28]}” el más caro ({usd2(peor['cc'])}/conv). Pensá en correr más presupuesto al primero.")
        preg = f"¿Le subo el foco a “{mejor['c'][:28]}” esta semana?"
    else:
        rec = "Poca data con volumen para un veredicto fuerte. Dejá correr unos días más y vuelvo a auditar."
        preg = "¿Querés que baje el umbral de volumen para ver más campañas?"
    o.append(f"   {rec}")
    o.append(f"\n❓ <b>{preg}</b>")
    o.append("\n<i>(Son recomendaciones — la mano sobre el presupuesto la tenés vos.)</i>")
    return "\n".join(o)

if __name__ == "__main__":
    dias = DIAS_DEFAULT
    if "--dias" in sys.argv:
        try: dias = int(sys.argv[sys.argv.index("--dias") + 1])
        except Exception: pass
    msg = render(dias)
    if "--send" in sys.argv:
        print("Enviado:", enviar(msg).get("ok"))
    else:
        print(msg)
