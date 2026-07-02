#!/usr/bin/env bash
# investigar.sh — el agente AgenteDJ investiga en la web on-demand (Claude + búsqueda web).
# Devuelve una respuesta con FUENTES. Igual que sol_sql: SIEMPRE por archivo, para que el
# sistema de permisos no choque con signos de la pregunta.
#
# Uso (recomendado):  investigar.sh --file /ruta/pregunta.txt
#   o directo:        investigar.sh "cuánto está el flete de china a costa rica"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="${PYTHON_BIN:-$ROOT/.venv/bin/python}"
[ -x "$PYTHON" ] || PYTHON="/opt/homebrew/bin/python3"
exec "$PYTHON" "$ROOT/scripts/investigar_web.py" "$@"
