#!/usr/bin/env python3
"""
investigar_web.py — Motor de INVESTIGACIÓN WEB on-demand para el agente AgenteDJ.

Cuando Luis (o quien sea) le pregunta al agente algo que necesita información ACTUAL o EXTERNA
(verificar un dato del reporte de Gabriel/fletes, precios de mercado, tendencias, noticias,
"¿es cierto que...?", "buscá más sobre X"), el agente escribe la pregunta en un archivo y llama
a este motor. Usa la API de Claude (Sonnet 4.6) con BÚSQUEDA WEB y devuelve una respuesta
concisa CON FUENTES (links verificables). El agente solo relata lo que devuelve.

Uso (el agente lo llama por archivo, como sol_sql):
  investigar_web.py --file <ruta_con_la_pregunta.txt>
  investigar_web.py "pregunta directa"

Devuelve texto plano listo para relatar (respuesta + '🔗 Fuentes:' con URLs).
"""
import os, sys, json, urllib.request, urllib.error
from pathlib import Path

BASE = Path(__file__).parent
try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
MODEL = "claude-sonnet-4-6"
if not ANTHROPIC_KEY:
    print("ERROR: falta ANTHROPIC_API_KEY en scripts/.env"); sys.exit(2)

# Pregunta: desde --file <ruta>, o argumento directo
if len(sys.argv) >= 3 and sys.argv[1] == "--file":
    p = Path(sys.argv[2])
    if not p.exists():
        print("ERROR: no existe el archivo de pregunta:", sys.argv[2]); sys.exit(2)
    PREGUNTA = p.read_text(encoding="utf-8").strip()
elif len(sys.argv) >= 2:
    PREGUNTA = " ".join(sys.argv[1:]).strip()
else:
    print("uso: investigar_web.py --file <archivo>  |  investigar_web.py \"pregunta\""); sys.exit(2)

if not PREGUNTA:
    print("ERROR: la pregunta está vacía."); sys.exit(2)

SYSTEM = (
    "Sos el investigador de mercado de Depósito Jiménez (importador de acabados de construcción "
    "en Costa Rica, trae mucho de China). Te pasan una pregunta y tenés que INVESTIGAR EN LA WEB "
    "(buscá de verdad, varias consultas) y responder en español tico, claro y al grano.\n\n"
    "Reglas: nunca inventés datos ni fuentes; si algo es variable o incierto, decilo y dá rangos. "
    "Si la web no tiene el dato exacto, decilo honestamente y ofrecé lo más cercano. Sé conciso "
    "(la respuesta la va a leer alguien en el celular): 4-8 líneas máximo.\n\n"
    "AL FINAL, SIEMPRE agregá una sección '🔗 Fuentes:' con los 2-4 links REALES (URLs completas) "
    "que usaste, uno por línea, para que Luis pueda verificar. Solo links que de verdad consultaste."
)

def investigar():
    messages = [{"role": "user", "content": PREGUNTA}]
    tools = [{"type": "web_search_20260209", "name": "web_search", "max_uses": 6}]
    last_text = ""
    for _ in range(6):
        body = {"model": MODEL, "max_tokens": 1500, "system": SYSTEM,
                "tools": tools, "messages": messages}
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(body).encode(),
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                resp = json.loads(r.read())
        except urllib.error.HTTPError as e:
            return "No pude investigar ahora (error de la API: %s). Reintentá en un momento." % e.code
        if resp.get("stop_reason") == "refusal":
            return "No puedo responder esa consulta puntual."
        txt = "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")
        if txt.strip():
            last_text = txt.strip()
        if resp.get("stop_reason") == "pause_turn":
            messages.append({"role": "assistant", "content": resp["content"]})
            continue
        break
    return last_text or "No encontré información suficiente para responder eso."

if __name__ == "__main__":
    print(investigar())
