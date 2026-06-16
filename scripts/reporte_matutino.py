#!/usr/bin/env python3
"""
reporte_matutino.py — Reporte Matutino con criterio (V1, SIN LLM).

Le llega a Luis por Telegram 9:30 lun-sáb. NO es un volcado de datos: es el
titular accionable. Todos los números salen de SQL/funciones que REUSAN la
lógica de SOL (para que cuadren con el dashboard). Cero LLM en V1: el texto se
arma con plantillas. La función pulir_redaccion() es el punto de extensión para
sumar una capa Haiku en V2 (que pulirá la redacción SIN tocar las cifras).

Aislamiento por bloque: si una query falla, ese bloque se omite con un aviso
corto pero el reporte igual sale.

Uso:
  python reporte_matutino.py           -> renderiza e imprime (NO envía)
  python reporte_matutino.py --send    -> envía a Telegram
"""
import os, sys, json, calendar, urllib.request, urllib.error
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

DIAS  = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"]
MESES = ["","enero","febrero","marzo","abril","mayo","junio","julio","agosto",
         "septiembre","octubre","noviembre","diciembre"]

def crc(n):
    try:    return "₡" + f"{round(float(n)):,}".replace(",", ".")
    except Exception: return "₡0"

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

# ── Supabase ────────────────────────────────────────────────────────────────
def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def supa_rpc(fn, args=None):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/rpc/{fn}", data=json.dumps(args or {}).encode(), method="POST",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())

# ── Fechas ──────────────────────────────────────────────────────────────────
def fecha_ayer():
    ayer = date.today() - timedelta(days=1)
    if ayer.weekday() == 6:           # domingo -> usar sábado
        ayer -= timedelta(days=1)
    return ayer

# ── Punto de extensión V2 (Haiku). En V1 es identidad: NO toca nada. ─────────
def pulir_redaccion(texto):
    return texto

# ── BLOQUE 1: Cómo venimos ───────────────────────────────────────────────────
def bloque_ventas(ayer):
    def vp(d1, d2):
        return supa_rpc("sol_ventas_periodo", {"desde": d1.isoformat(), "hasta": d2.isoformat()})
    v_ayer = vp(ayer, ayer)
    sem    = ayer - timedelta(days=7)
    v_sem  = vp(sem, sem)
    ini    = ayer.replace(day=1)
    v_mes  = vp(ini, ayer)
    # mes anterior, misma fecha
    ini_prev = date(ini.year-1, 12, 1) if ini.month == 1 else date(ini.year, ini.month-1, 1)
    ult_prev = calendar.monthrange(ini_prev.year, ini_prev.month)[1]
    fin_prev = date(ini_prev.year, ini_prev.month, min(ayer.day, ult_prev))
    v_prev = vp(ini_prev, fin_prev)
    # proyección lineal de cierre
    dim  = calendar.monthrange(ayer.year, ayer.month)[1]
    proy = float(v_mes["ventas"]) / ayer.day * dim if ayer.day else 0

    o = ["📊 <b>Cómo venimos</b>"]
    o.append(f"Ayer vendiste <b>{crc(v_ayer['ventas'])}</b> · {v_ayer['facturas']} facturas")
    o.append(f"   {flecha(variacion(v_ayer['ventas'], v_sem['ventas']))} vs {DIAS[sem.weekday()]} pasado ({crc(v_sem['ventas'])})")
    o.append(f"Mes: <b>{crc(v_mes['ventas'])}</b> · {flecha(variacion(v_mes['ventas'], v_prev['ventas']))} vs mes pasado a la fecha")
    o.append(f"Proyección de cierre: <b>~{crc(proy)}</b>")
    return "\n".join(o)

# ── BLOQUE 2: Tus tareas del día ─────────────────────────────────────────────
def bloque_tareas():
    # Recurrentes (pagos/obligaciones fijas) que caen HOY, por día del mes.
    rec = supa_get(f"vega_recurrentes?dia=eq.{date.today().day}&select=titulo,notas")
    o = ["✅ <b>Recurrentes de hoy</b> (pagos/obligaciones)"]
    if rec:
        for r in rec:
            linea = f"   • {r['titulo']}"
            if (r.get("notas") or "").strip():
                linea += f" — {r['notas'].strip()[:50]}"
            o.append(linea)
    else:
        o.append("   Nada recurrente para hoy. 👍")
    return "\n".join(o)

# ── BLOQUE 3: Para hoy (stock / proformas / pagos) ───────────────────────────
def bloque_para_hoy():
    o = ["🎯 <b>Para hoy</b>"]
    # Stock crítico (Apocalipsis/Profecías) — alta rotación bajo semáforo rojo
    st = supa_get("profecias_panel?semaforo=in.(rojo_critico,rojo)&oculto_compras=eq.false"
                  "&demanda_proyectada=gt.0&order=demanda_proyectada.desc&limit=4"
                  "&select=item,meses_cobertura")
    if st:
        o.append("📦 <b>Stock crítico</b> (más se vende):")
        for s in st:
            dias = round(float(s["meses_cobertura"]) * 30)
            cob = "agotado" if dias <= 0 else f"~{dias} días"
            o.append(f"   • {s['item'][:44]} — {cob}")
    # Proformas sin seguir (Hermes) — por monto
    pf = supa_get("hermes_panel_view?semaforo=in.(atrasado,sin_contactar)&facturada=eq.false"
                  "&order=monto_total.desc&limit=3&select=cliente,monto_total,dias_desde_proforma")
    if pf:
        o.append("📄 <b>Proformas sin seguir</b> (por monto):")
        for p in pf:
            o.append(f"   • {crc(p['monto_total'])} — {(p['cliente'] or '?')[:28]} ({p['dias_desde_proforma']}d)")
    # Pagos por vencer en 7 días (fin_cuentas_pagar; fecha_vencimiento es texto DD/MM/YYYY)
    pg = supa_get("fin_cuentas_pagar?saldo_actual=gt.0&select=proveedor,fecha_vencimiento,saldo_actual&limit=5000")
    hoy = date.today()
    def vence_pronto(fv):
        try:
            d = datetime.strptime(fv, "%d/%m/%Y").date()
            return hoy <= d <= hoy + timedelta(days=7)
        except Exception:
            return False
    venc = [r for r in pg if vence_pronto(r.get("fecha_vencimiento", ""))]
    if venc:
        total = sum(float(r["saldo_actual"]) for r in venc)
        o.append(f"💸 <b>Pagos por vencer (7 días):</b> {crc(total)} · {len(venc)} docs")
        for r in sorted(venc, key=lambda x: -float(x["saldo_actual"]))[:3]:
            o.append(f"   • {crc(r['saldo_actual'])} — {r['proveedor'].strip()[:28]} (vence {r['fecha_vencimiento']})")
    if len(o) == 1:
        o.append("   Nada urgente hoy. 👍")
    return "\n".join(o)

# ── BLOQUE 4: Vendedores ─────────────────────────────────────────────────────
def bloque_vendedores():
    per = supa_get("neo_informe_ventas_vendedor?select=periodo_reporte&order=periodo_reporte.desc&limit=1")
    if not per:
        return "🏆 <b>Vendedores</b>\n   (sin datos)"
    p = per[0]["periodo_reporte"]
    rows = supa_get(f"neo_informe_ventas_vendedor?periodo_reporte=eq.{p}"
                    "&order=ventas_netas.desc&limit=4&select=vendedor,ventas_netas")
    medals = ["🥇", "🥈", "🥉", "4️⃣"]
    o = [f"🏆 <b>Vendedores</b> (mes en curso)"]
    for i, r in enumerate(rows):
        o.append(f"   {medals[i]} {r['vendedor'].strip()} — {crc(r['ventas_netas'])}")
    return "\n".join(o)

# ── BLOQUE 5: Algo raro (anomalías por regla fija) ───────────────────────────
def bloque_anomalia():
    data = supa_rpc("sol_anomalia_categorias") or []
    if not data:
        return "👀 <b>Algo raro</b>\n   Sin movimientos fuertes hoy."
    for d in data:
        d["_delta"] = abs(float(d["reciente"]) - float(d["previo"]))
    top = sorted(data, key=lambda x: -x["_delta"])[:3]   # mayor impacto en ₡
    o = ["👀 <b>Algo raro</b> (ventas últimos 7d vs 7d previos):"]
    for d in top:
        fl = "📈" if d["cambio_pct"] >= 0 else "📉"
        o.append(f"   {fl} {d['categoria'][:30]}: {d['cambio_pct']:+.0f}% ({crc(d['reciente'])} vs {crc(d['previo'])})")
    return "\n".join(o)

# ── Render ───────────────────────────────────────────────────────────────────
def render():
    ayer = fecha_ayer()
    hoy = date.today()
    cab = f"☀️ <b>Buenos días, Luis</b> · {DIAS[hoy.weekday()].capitalize()} {hoy.day} de {MESES[hoy.month]}"
    bloques = []
    for fn, args in [(bloque_ventas, (ayer,)), (bloque_tareas, ()), (bloque_para_hoy, ()),
                     (bloque_vendedores, ()), (bloque_anomalia, ())]:
        try:
            bloques.append(fn(*args))
        except Exception as e:
            bloques.append(f"⚠️ (bloque {fn.__name__} no disponible hoy)")
    foot = f"🕘 Datos al cierre del {ayer.day}/{ayer.month}. Escribí <b>/detalle</b> para profundizar."
    return pulir_redaccion(cab + "\n\n" + "\n\n".join(bloques) + "\n\n" + foot)

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
    mensaje = render()
    if "--send" in sys.argv:
        res = enviar(mensaje)
        print("Enviado:", res.get("ok"))
    else:
        print(mensaje)
