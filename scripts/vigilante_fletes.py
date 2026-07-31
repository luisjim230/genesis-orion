#!/usr/bin/env python3
"""
vigilante_fletes.py — Vigilante de Fletes China → Costa Rica (coro de ángeles) · HÍBRIDO con IA.

Una vez por semana investiga en internet el COSTO DE FLETE MARÍTIMO de China a Costa Rica
(contenedor FCL 20'/40' y LCL), la tendencia reciente (sube/baja) y los factores que lo
mueven (Canal de Panamá, Mar Rojo, combustible/BAF, temporada alta, Año Nuevo Chino), y le
da a Luis una lectura práctica para decidir cuándo conviene traer contenedor.

Es info VARIABLE y no hay una tarifa "oficial" pública exacta — por eso el reporte da RANGOS
y la DIRECCIÓN del mercado citando fuentes reales (índices de flete, navieras, foros de
importadores), y es honesto sobre la incertidumbre. Nunca inventa una cifra exacta como si
fuera un precio cerrado.

Mismo patrón que Gabriel: el script orquesta; Claude (Sonnet 4.6) investiga la web y redacta
en la voz de dios. SOLO informa (no ejecuta nada). Cierra con UNA pregunta. Token-eficiente
(~$0.08 por corrida, semanal).

Uso:
  python vigilante_fletes.py            -> investiga e imprime (NO envía)
  python vigilante_fletes.py --send     -> envía el reporte a Telegram
"""
import os, sys, json, urllib.request, urllib.error, time
from pathlib import Path
from datetime import datetime, timedelta

BASE = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TG_CHAT  = os.getenv("TELEGRAM_CHAT_ID")
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = "claude-sonnet-4-6"

if not ANTHROPIC_KEY:
    raise SystemExit("ERROR: falta ANTHROPIC_API_KEY en scripts/.env")

HOY_CR = (datetime.utcnow() - timedelta(hours=6))
FECHA_TXT = HOY_CR.strftime("%d/%m/%Y")
MES_ANNO = {1:"enero",2:"febrero",3:"marzo",4:"abril",5:"mayo",6:"junio",7:"julio",8:"agosto",9:"setiembre",10:"octubre",11:"noviembre",12:"diciembre"}[HOY_CR.month] + " " + str(HOY_CR.year)

WORKSPACE_REPORTE = Path("/Users/agentedepositojimenez/.openclaw/workspace/ultimo_reporte_fletes.md")

def guardar_local(reporte_html):
    try:
        texto = reporte_html.replace("<b>", "").replace("</b>", "").replace("<i>", "").replace("</i>", "")
        WORKSPACE_REPORTE.write_text(
            f"# Último reporte de Fletes China→Costa Rica (Vigilante de Fletes)\n"
            f"# Generado: {FECHA_TXT}\n\n{texto}\n", encoding="utf-8")
    except Exception:
        pass

def enviar(msg):
    if not TG_TOKEN or not TG_CHAT:
        raise SystemExit("Para --send faltan TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID en scripts/.env")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
        data=json.dumps({"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML",
                         "disable_web_page_preview": True}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

SYSTEM = (
    "Sos el VIGILANTE DE FLETES de Depósito Jiménez (Corporación Rojimo), importador de "
    "materiales de acabados de construcción en Costa Rica que trae contenedores desde China "
    "(puertos típicos de salida: Shenzhen/Yantian, Ningbo, Shanghai; entrada por Caldera o "
    "Limón/Moín; mayormente contenedor completo FCL 40', a veces 20' o consolidado LCL).\n\n"
    "Tu trabajo: una vez por semana, decirle a Luis CÓMO ESTÁ y HACIA DÓNDE VA el costo del "
    "flete marítimo China→Costa Rica, para que decida cuándo conviene cerrar un contenedor.\n\n"
    "Hablás español tico informal y directo, con opinión franca. Sos HONESTO con la "
    "incertidumbre: el flete es variable y no hay tarifa pública exacta, así que das RANGOS "
    "y la DIRECCIÓN del mercado (subiendo/bajando/estable) citando lo que viste (índices como "
    "Drewry WCI / Freightos FBX / SCFI, navieras, foros de importadores). NUNCA te inventás una "
    "cifra exacta como si fuera un precio cerrado, ni una fuente. Si los datos puntuales de CR "
    "escasean, lo decís y usás la ruta Asia→Costa Este/Latam como referencia, aclarándolo.\n\n"
    "FORMATO (importante): tu ÚLTIMO mensaje debe ser SOLO el reporte para Telegram, sin "
    "preámbulos. HTML de Telegram (<b>negrita</b>, <i>itálica</i>), NUNCA markdown con **. "
    "Máx ~12 líneas. Estructura:\n"
    "🚢 <b>Vigilante de Fletes — China→Costa Rica</b>\n"
    "Luego: rango estimado actual del 40' (y 20'/LCL si lo encontrás), la TENDENCIA vs semanas "
    "previas (📈/📉/➡️ con el porqué), y 1-2 factores que lo están moviendo (Canal de Panamá, "
    "Mar Rojo, combustible, temporada). Cerrá con '💡 <b>Lo que yo haría</b>:' (¿conviene "
    "adelantar o esperar el contenedor?), UNA pregunta concreta ('❓ ...'), y AL FINAL una sección "
    "'🔗 <b>Fuentes:</b>' con 2-4 links REALES (URLs completas) que consultaste, uno por línea, para "
    "que Luis verifique. Solo links que de verdad usaste; nunca inventes uno."
)

def investigar():
    user = (
        f"HOY es {FECHA_TXT} ({MES_ANNO}). Investigá en la web (varias búsquedas reales) el "
        "estado ACTUAL del flete marítimo de contenedores de China a Costa Rica / Centroamérica / "
        "costa oeste de Latinoamérica: rango de precio del contenedor 40' (y 20' o LCL si hay "
        "dato), si está subiendo o bajando vs las últimas semanas, y los factores que lo mueven "
        "ahora (Canal de Panamá, situación del Mar Rojo/Suez, recargos de combustible, temporada "
        "alta, Año Nuevo Chino, capacidad de navieras). Buscá índices de flete recientes (Drewry "
        "WCI, Freightos FBX, SCFI) y noticias del mes. Armá el reporte para Telegram según tu "
        "formato, con la lectura práctica para alguien que trae contenedores de acabados."
    )
    messages = [{"role": "user", "content": user}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 4}]
    last_text = ""
    max_loops = 4
    for loop_num in range(max_loops):
        try:
            body = {"model": MODEL, "max_tokens": 2000, "system": SYSTEM,
                    "tools": tools, "messages": messages}
            req = urllib.request.Request(
                "https://api.anthropic.com/v1/messages",
                data=json.dumps(body).encode(),
                headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"})
            with urllib.request.urlopen(req, timeout=120) as r:
                resp = json.loads(r.read())
            if resp.get("stop_reason") == "refusal":
                return None
            txt = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
            if txt.strip():
                last_text = txt.strip()
            if resp.get("stop_reason") == "pause_turn":
                messages.append({"role": "assistant", "content": resp["content"]})
                continue
            break
        except urllib.error.URLError as e:
            print(f"ERROR en loop {loop_num}: {e}")
            if loop_num < max_loops - 1:
                time.sleep(10)
                continue
            return None
        except Exception as e:
            print(f"ERROR inesperado en loop {loop_num}: {e}")
            return None
    return last_text or None

def render():
    reporte = investigar()
    if not reporte:
        return ("🚢 <b>Vigilante de Fletes — China→Costa Rica</b>\nNo pude completar la "
                "investigación del flete esta vez. ¿Lo reintento?"), True
    if "🚢" in reporte:
        reporte = reporte[reporte.index("🚢"):]
    reporte = reporte.replace("**", "").strip()
    return reporte, True

if __name__ == "__main__":
    msg, hay = render()
    if "--send" in sys.argv:
        if hay:
            guardar_local(msg)
            print("Enviado:", enviar(msg).get("ok"))
        else:
            print("Sin datos; no se envía.")
    else:
        print(msg)
