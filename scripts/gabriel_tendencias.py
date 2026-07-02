#!/usr/bin/env python3
"""
gabriel_tendencias.py — Gabriel, Radar de Tendencias (coro de ángeles) · HÍBRIDO con IA.

El primer agente que mira PARA AFUERA. Investiga proactivamente qué está pasando en el
mundo de los acabados de construcción (Costa Rica / Latinoamérica / global) y lo CRUZA con
lo que Depósito Jiménez vende, para sugerir oportunidades: qué traer, qué empujar, qué
está pegando que la competencia ya tiene acceso.

A diferencia de los otros agentes (scripts sin IA que leen Supabase), Gabriel necesita
investigar texto suelto de la web, así que usa la API de Claude (Sonnet 4.6) con la
herramienta de BÚSQUEDA WEB. El script junta el contexto del negocio; Claude hace la
investigación y redacta el reporte en la voz de dios.

Reglas de oro respetadas: SOLO LEE de Supabase (read-only). Anti-fatiga (cierra con UNA
pregunta). Honestidad (si no encuentra nada relevante, lo dice; no inventa). Token-eficiente
(corre semanal, ~$0.08 por corrida).

Uso:
  python gabriel_tendencias.py            -> investiga e imprime (NO envía)
  python gabriel_tendencias.py --send     -> envía el reporte a Telegram
"""
import os, sys, json, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, timedelta

# Fecha de hoy en hora Costa Rica (UTC-6, sin horario de verano)
HOY_CR = (datetime.utcnow() - timedelta(hours=6))
FECHA_TXT = HOY_CR.strftime("%d/%m/%Y")
MES_ANNO = {1:"enero",2:"febrero",3:"marzo",4:"abril",5:"mayo",6:"junio",7:"julio",8:"agosto",9:"setiembre",10:"octubre",11:"noviembre",12:"diciembre"}[HOY_CR.month] + " " + str(HOY_CR.year)

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
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = "claude-sonnet-4-6"

if not SUPA_URL or not SUPA_KEY:
    raise SystemExit("ERROR: faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en scripts/.env")
if not ANTHROPIC_KEY:
    raise SystemExit("ERROR: falta ANTHROPIC_API_KEY en scripts/.env")

# ── Helpers de I/O ────────────────────────────────────────────────────────────
def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
                 "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

WORKSPACE_REPORTE = Path("/Users/agentedepositojimenez/.openclaw/workspace/ultimo_reporte_gabriel.md")

def guardar_local(reporte_html):
    # Deja el reporte en el workspace del agente interactivo, para que cuando Luis
    # pregunte sobre las tendencias, AgenteDJ lea el reporte EXACTO en vez de adivinar.
    try:
        texto = reporte_html.replace("<b>", "").replace("</b>", "").replace("<i>", "").replace("</i>", "")
        WORKSPACE_REPORTE.write_text(
            f"# Último reporte de Gabriel (Radar de Tendencias)\n"
            f"# Generado: {FECHA_TXT}\n\n{texto}\n", encoding="utf-8")
    except Exception:
        pass  # nunca bloquear el envío por esto

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

# ── Contexto del negocio: qué categorías vende Depósito Jiménez ───────────────
def categorias_del_negocio():
    # Lista de categorías activas (para que Claude enfoque la investigación en lo que vendés).
    try:
        rows = supa_get("neo_minimos_maximos?select=categoria&activo=eq.S%C3%AD&limit=4000")
    except Exception:
        rows = supa_get("neo_lista_items?select=categoria&limit=4000")
    cats = sorted({(r.get("categoria") or "").strip() for r in rows if (r.get("categoria") or "").strip()})
    # Quitamos categorías que no son de producto/tendencia (servicios)
    cats = [c for c in cats if c.upper() not in ("TRANSPORTE", "VARIOS", "SERVICIOS")]
    return cats

# ── Investigación con Claude + búsqueda web ───────────────────────────────────
SYSTEM = (
    "Sos GABRIEL, el radar de innovación y tendencias de Depósito Jiménez (Corporación Rojimo), "
    "importador y detallista de materiales de ACABADOS de construcción en Costa Rica (compite por "
    "variedad y exclusividad, importa mucho de China bajo el TLC). Tu trabajo: detectar qué está "
    "PEGANDO en el mundo de los acabados (pisos, paneles, revestimientos, siding, techos, grifería, "
    "cerámica, molduras, madera, etc.) y cruzarlo con lo que el negocio YA vende, para recomendarle "
    "a Luis qué traer o empujar antes que la competencia.\n\n"
    "Hablás en español tico informal y directo, con opiniones francas (no listas neutrales). "
    "Sos honesto: si la web no muestra nada realmente nuevo esta semana, lo decís — no inventás "
    "tendencias para llenar. Nunca te inventás datos ni fuentes.\n\n"
    "FORMATO DE SALIDA (importante): tu ÚLTIMO mensaje debe ser SOLO el reporte listo para Telegram, "
    "sin preámbulos. Usá HTML de Telegram (<b>negrita</b>, <i>itálica</i>), NUNCA markdown con **. "
    "Máximo ~12 líneas. Estructura:\n"
    "🧭 <b>Gabriel — Radar de Tendencias</b>\n"
    "Luego 2 a 4 viñetas '📈' de cosas que están pegando afuera (con el porqué/dónde lo viste, breve). "
    "En cada una, cruzá con el negocio: decí si es una categoría que YA vende, en la que está corto, o "
    "que NO tiene. Cerrá con '💡 <b>Lo que yo haría</b>:' (1-2 frases accionables), UNA pregunta concreta "
    "('❓ ...'), y AL FINAL una sección '🔗 <b>Fuentes:</b>' con 2-4 links REALES (URLs completas) que "
    "usaste, uno por línea, para que Luis verifique. Solo links que de verdad consultaste; nunca inventes uno. "
    "Si no hay nada relevante, mandá 2 líneas honestas y una pregunta."
)

def investigar(cats):
    cat_txt = ", ".join(cats[:60])
    user = (
        f"HOY es {FECHA_TXT} (usá '{MES_ANNO}' si ponés fecha en el título; NUNCA inventes otro año).\n\n"
        "Investigá en la web (buscá de verdad, varias consultas) qué tendencias, productos nuevos o "
        "materiales están creciendo AHORA en ACABADOS de construcción, con foco en Costa Rica y "
        "Latinoamérica (y señales globales que suelen llegar acá). Priorizá lo que se pueda IMPORTAR de "
        "China y lo que cruce con las categorías que este negocio ya maneja.\n\n"
        f"Categorías que Depósito Jiménez vende hoy: {cat_txt}.\n\n"
        "Cruzá lo que encuentres afuera con esa lista y armá el reporte para Telegram según tu formato. "
        "Enfocate en oportunidades de QUÉ TRAER o EMPUJAR, no en noticias genéricas."
    )
    messages = [{"role": "user", "content": user}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 6}]
    last_text = ""
    for _ in range(6):  # tolera pause_turn del bucle de herramientas del servidor
        body = {"model": MODEL, "max_tokens": 2000, "system": SYSTEM,
                "tools": tools, "messages": messages}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(body).encode(),
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=300) as r:
            resp = json.loads(r.read())
        if resp.get("stop_reason") == "refusal":
            return None, "refusal"
        txt = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
        if txt.strip():
            last_text = txt.strip()
        if resp.get("stop_reason") == "pause_turn":
            messages.append({"role": "assistant", "content": resp["content"]})
            continue
        break
    return last_text or None, "ok"

# ── Main ──────────────────────────────────────────────────────────────────────
def render():
    cats = categorias_del_negocio()
    if not cats:
        return "🧭 <b>Gabriel — Radar de Tendencias</b>\nNo pude leer las categorías del negocio para investigar. Reviso la conexión a datos.", False
    reporte, estado = investigar(cats)
    if estado == "refusal" or not reporte:
        return ("🧭 <b>Gabriel — Radar de Tendencias</b>\nNo pude completar la investigación de tendencias esta vez. "
                "¿Querés que lo reintente o que enfoque alguna categoría puntual?"), True
    # Quedarnos SOLO con el reporte final (cortar narración intermedia antes del título 🧭)
    if "🧭" in reporte:
        reporte = reporte[reporte.index("🧭"):]
    reporte = reporte.replace("**", "").strip()  # por si coló markdown
    return reporte, True

if __name__ == "__main__":
    msg, hay = render()
    if "--send" in sys.argv:
        if hay:
            guardar_local(msg)  # el archivo refleja EXACTAMENTE lo que se le envió a Luis
            print("Enviado:", enviar(msg).get("ok"))
        else:
            print("Sin tendencias relevantes; no se envía (anti-fatiga).")
    else:
        print(msg)
