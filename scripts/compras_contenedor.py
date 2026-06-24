#!/usr/bin/env python3
"""
compras_contenedor.py — Agente de Compras (coro de ángeles) · V1 SIN LLM.

El que arma la lista de contenedores: cada lunes avisa qué proveedores EXTRANJEROS
ya tienen MASA CRÍTICA de productos por pedir (≥8 SKUs), agrupado POR PROVEEDOR (no
producto suelto), para que Luis sepa a quién armarle contenedor. NO reinventa el
cálculo: se para sobre el motor de Profecías (vista `profecias_panel`, que ya cruza
demanda × stock × lead time × cantidad sugerida). El agente SOLO LEE, AGRUPA y AVISA.

Respeta SIEMPRE los filtros del motor: oculto_compras=false y proveedor_pausado=false.
Prioriza por más productos EN QUIEBRE y mayor lead time (los más urgentes: ya no hay
stock y tardan meses en llegar). Para los 3 proveedores más urgentes, lista sus
productos. Cierra señalando el más urgente y por qué (Ciclo de Decisión).

Anti-fatiga: si ningún proveedor llega a masa crítica para contenedor, no manda nada.

Uso:
  python compras_contenedor.py            -> renderiza e imprime (NO envía)
  python compras_contenedor.py --send     -> envía a Telegram SOLO si hay proveedores
"""
import os, sys, json, html, urllib.request, urllib.error
from collections import defaultdict
from pathlib import Path

BASE = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

SUPA_URL = os.getenv("SUPABASE_URL")
# Solo lectura: usamos la ANON key (NUNCA service_role para un agente de avisos).
SUPA_KEY = os.getenv("SUPABASE_ANON_KEY")
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT  = os.getenv("TELEGRAM_CHAT_ID")
if not SUPA_URL or not SUPA_KEY:
    raise SystemExit("ERROR: faltan SUPABASE_URL / SUPABASE_ANON_KEY en scripts/.env")

MASA_CRITICA = 8      # HAVING >= 8 SKUs: piso de masa crítica para armar contenedor
TOP_DETALLE  = 3      # proveedores más urgentes a los que se les lista el detalle
DET_LIMIT    = 20     # productos a listar por proveedor en el detalle

def esc(s):
    """Escapa &, <, > para que nombres con esos chars no rompan parse_mode=HTML."""
    return html.escape(str(s or ""), quote=False)

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

TG_LIMIT = 4096   # límite duro de Telegram por mensaje

def _trozos(msg):
    """Parte el mensaje en bloques <= TG_LIMIT respetando líneas (no corta tags HTML)."""
    trozos, actual = [], ""
    for linea in msg.split("\n"):
        cand = (actual + "\n" + linea) if actual else linea
        if len(cand) > TG_LIMIT - 16:
            if actual:
                trozos.append(actual)
            actual = linea
        else:
            actual = cand
    if actual:
        trozos.append(actual)
    return trozos

def _post(text):
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        data=json.dumps({"chat_id": TG_CHAT, "text": text, "parse_mode": "HTML",
                         "disable_web_page_preview": True}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def enviar(msg):
    if not TG_TOKEN or not TG_CHAT:
        raise SystemExit("Para --send faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en scripts/.env")
    res = None
    for trozo in _trozos(msg):
        res = _post(trozo)
    return res or {}

# ── Datos: motor Profecías, solo extranjero con cantidad sugerida > 0 ──────────
# Mismos filtros del motor (oculto_compras=false, proveedor_pausado=false). Bajamos
# las filas crudas y replicamos en Python el GROUP BY / HAVING / FILTER de la
# consulta validada (PostgREST no agrega; agrupar es justo lo que hace este agente).
def fetch():
    q = ("profecias_panel"
         "?tipo_proveedor=eq.extranjero"
         "&oculto_compras=eq.false"
         "&proveedor_pausado=eq.false"
         "&cantidad_sugerida=gt.0"
         "&select=ultimo_proveedor,lead_time_dias,cantidad_sugerida,bandera_stockout,"
         "ultimo_costo,item,existencias"
         "&limit=10000")
    return supa_get(q)

def agrupar(rows):
    """Replica: GROUP BY ultimo_proveedor, lead_time_dias HAVING skus_a_pedir >= 8."""
    grupos = defaultdict(list)
    for r in rows:
        grupos[(r.get("ultimo_proveedor") or "?", _f(r.get("lead_time_dias")))].append(r)

    out = []
    for (prov, lt), items in grupos.items():
        skus = len(items)                 # ya vienen filtradas con cantidad_sugerida > 0
        if skus < MASA_CRITICA:           # HAVING: sin masa crítica, no es para contenedor
            continue
        quiebre = sum(1 for x in items if x.get("bandera_stockout"))
        costo = round(sum(_f(x.get("cantidad_sugerida")) * _f(x.get("ultimo_costo")) for x in items))
        out.append({"proveedor": prov, "lead_time": int(lt), "skus": skus,
                    "quiebre": quiebre, "costo": costo, "items": items})
    # Prioridad: más quiebres primero; a igualdad, más SKUs por pedir. Lead time
    # desempata al elegir "el más urgente" en el cierre.
    out.sort(key=lambda g: (-g["quiebre"], -g["skus"]))
    return out

def detalle(items):
    """Replica el detalle: ORDER BY bandera_stockout DESC, cantidad_sugerida DESC LIMIT 20."""
    orden = sorted(items, key=lambda x: (0 if x.get("bandera_stockout") else 1,
                                         -_f(x.get("cantidad_sugerida"))))
    return orden[:DET_LIMIT]

def render():
    grupos = agrupar(fetch())
    if not grupos:
        return ("🚢 <b>Compras — Proveedores listos para contenedor</b>\n"
                "Ningún proveedor extranjero llegó a masa crítica esta semana. "
                "Nada que armar por ahora. 👍"), False

    o = ["🚢 <b>COMPRAS — Proveedores listos para contenedor</b>",
         "<i>(lunes · datos de Profecías · agrupado por proveedor)</i>",
         "", "Proveedores extranjeros con masa crítica para armarles contenedor:", ""]

    for g in grupos:
        urgente = " 🔴" if g["quiebre"] else ""
        o.append(f"• <b>{esc(g['proveedor'][:40])}</b>{urgente}")
        o.append(f"   lead {g['lead_time']}d · <b>{g['skus']}</b> productos por pedir · "
                 f"<b>{g['quiebre']}</b> ya quebrados · {crcM(g['costo'])}")

    total = round(sum(g["costo"] for g in grupos))
    o.append(f"\n💰 Total sugerido (todos): <b>{crcM(total)}</b>")

    # Detalle de los más urgentes
    o.append(f"\n🔎 <b>Detalle de los {min(TOP_DETALLE, len(grupos))} más urgentes</b>")
    for g in grupos[:TOP_DETALLE]:
        o.append(f"\n<b>{esc(g['proveedor'][:40])}</b> (lead {g['lead_time']}d):")
        for x in detalle(g["items"]):
            estado = " — <b>QUEBRADO</b>" if x.get("bandera_stockout") else ""
            sug = round(_f(x.get("cantidad_sugerida")))
            exi = round(_f(x.get("existencias")))
            o.append(f"   • {esc((x.get('item') or '?')[:42])} · stock {exi} → pedir {sug}{estado}")
        if g["skus"] > DET_LIMIT:
            o.append(f"   …y {g['skus'] - DET_LIMIT} productos más de este proveedor.")

    # Cierre (Ciclo de Decisión): el más urgente = más quiebres + más lead time
    mas_urg = max(grupos, key=lambda g: (g["quiebre"], g["lead_time"]))
    o.append(f"\n💡 <b>Lo que yo haría</b>: arrancá por <b>{esc(mas_urg['proveedor'][:40])}</b> — "
             f"es el más urgente ({mas_urg['quiebre']} ya quebrados y lead time de "
             f"{mas_urg['lead_time']}d: si no entra ya, llega tarde).")
    o.append("\n❓ <b>¿Querés que te arme la orden de compra de ese proveedor?</b>")
    o.append("\n<i>(Salido del motor de Profecías; cruzá con Apocalipsis en SOL antes de cerrar.)</i>")
    return "\n".join(o), True

if __name__ == "__main__":
    msg, hay = render()
    if "--send" in sys.argv:
        if hay:
            print("Enviado:", enviar(msg).get("ok"))
        else:
            print("Sin proveedores con masa crítica; no se envía (anti-fatiga).")
    else:
        print(msg)
