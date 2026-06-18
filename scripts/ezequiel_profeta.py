#!/usr/bin/env python3
"""
ezequiel_profeta.py — Ezequiel, Profeta de Quiebres (coro de ángeles) · V1 SIN LLM.

El de mayor retorno: avisa con MESES de anticipación qué productos IMPORTADOS
(lead time largo, ~China 90 días) se van a agotar, para que entren en el contenedor
de este mes y no haya venta perdida. NO reinventa el cálculo: se para sobre el motor
de Profecías (vista `profecias_panel`, que ya cruza velocidad × stock × lead time y
marca semáforo/cantidad sugerida). Ezequiel es la VOZ proactiva: filtra lo importado
crítico que todavía no se pidió, lo ordena por urgencia y lo manda por Telegram con
el encuadre del contenedor.

SOLO LEE. Cierra con una pregunta (Ciclo de Decisión). Anti-fatiga: si no hay nada
importado por quebrar, no manda nada.

Uso:
  python ezequiel_profeta.py            -> renderiza e imprime (NO envía)
  python ezequiel_profeta.py --send     -> envía a Telegram SOLO si hay quiebres
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

LEAD_MIN_DIAS = 60     # "importado de contenedor" = lead time largo (China ~90d)
TOP_N         = 10     # máximo de productos a listar (anti-fatiga)

def crc(n):
    try:    return "₡" + f"{round(float(n)):,}".replace(",", ".")
    except Exception: return "₡0"

def _f(v):
    try:    return float(v or 0)
    except Exception: return 0.0

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

# ── Datos: motor Profecías, solo importado crítico que aún no se pidió ─────────
def fetch():
    q = ("profecias_panel"
         f"?lead_time_dias=gte.{LEAD_MIN_DIAS}"
         "&semaforo=in.(rojo_critico,rojo)"
         "&oculto_compras=eq.false"
         "&bandera_discontinuar=eq.false"
         "&proveedor_pausado=eq.false"
         "&datos_insuficientes=eq.false"
         "&estado_aprobacion=eq.sin_decidir"
         "&orden_compra_id=is.null"
         "&demanda_proyectada=gt.0"
         "&select=item,categoria,ultimo_proveedor,lead_time_dias,existencias,ultimo_costo,"
         "demanda_proyectada,meses_cobertura,cantidad_sugerida,semaforo"
         "&order=meses_cobertura.asc&limit=300")
    return supa_get(q)

def dias_quiebre(meses):
    return max(0, round(_f(meses) * 30))

def render():
    rows = fetch()
    if not rows:
        return ("🔮 <b>Ezequiel — Profeta de Quiebres</b>\n"
                "Nada importado por quebrar en el horizonte. Vas bien para el próximo contenedor. 👍"), False

    # urgencia: primero lo que se agota antes; a igualdad, mayor valor del pedido sugerido
    for r in rows:
        r["_dias"] = dias_quiebre(r.get("meses_cobertura"))
        r["_valor"] = _f(r.get("cantidad_sugerida")) * _f(r.get("ultimo_costo"))
    rows.sort(key=lambda r: (r["_dias"], -r["_valor"]))
    top = rows[:TOP_N]

    o = ["🔮 <b>Ezequiel — Profeta de Quiebres</b>",
         "Importados que hay que mirar para el <b>contenedor de este mes</b> "
         "(si no entran ahora, llegan tarde — lead time largo):", ""]
    total_valor = 0.0
    for r in top:
        d = r["_dias"]
        cuando = "ya agotado" if d <= 0 else f"se agota en ~{d} días"
        dem = _f(r.get("demanda_proyectada"))
        sug = round(_f(r.get("cantidad_sugerida")))
        lt = int(_f(r.get("lead_time_dias")))
        total_valor += r["_valor"]
        o.append(f"• <b>{(r.get('item') or '?')[:46]}</b>")
        o.append(f"   {cuando} · vendés ~{dem:.1f}/mes · lead {lt}d · "
                 f"sugerido {sug} uds (~{crc(r['_valor'])})")
    if len(rows) > TOP_N:
        o.append(f"\n…y {len(rows) - TOP_N} importados más en alerta.")
    o.append(f"\n💰 Pedido sugerido total (estos {len(top)}): <b>{crc(total_valor)}</b>")
    o.append("\n💡 <b>Lo que yo haría</b>: meté estos en la lista del contenedor de este mes "
             "antes de cerrar el pedido — el lead time de China no perdona.")
    o.append("\n❓ <b>¿Querés la lista completa (con cantidades) para armar el pedido?</b>")
    o.append("\n<i>(Salido del motor de Profecías; cruzá con Apocalipsis en SOL antes de cerrar.)</i>")
    return "\n".join(o), True

if __name__ == "__main__":
    msg, hay = render()
    if "--send" in sys.argv:
        if hay:
            print("Enviado:", enviar(msg).get("ok"))
        else:
            print("Sin quiebres importados; no se envía (anti-fatiga).")
    else:
        print(msg)
