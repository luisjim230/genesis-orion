#!/usr/bin/env bash
# sol_sql.sh — motor de consultas SOLO LECTURA para el agente analista AgenteDJ.
# Ejecuta UN SELECT contra Supabase con el rol read-only agente_ro y devuelve el resultado.
# Defensa en profundidad: el rol ya es read-only de hierro; igual acá bloqueamos
# cualquier cosa que no sea un SELECT/WITH y cualquier multi-statement.
#
# Uso:  scripts/sol_sql.sh "select ... ;"
#   o:  echo "select ..." | scripts/sol_sql.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENVF="$ROOT/.env.agente"
PSQL="${PSQL_BIN:-/opt/homebrew/opt/libpq/bin/psql}"

[ -f "$ENVF" ] || { echo "ERROR: falta $ENVF (corré scripts/set_agente_ro_env.sh)"; exit 2; }
val(){ grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }

# SQL desde argumento o stdin
SQL="${1:-}"; [ -z "$SQL" ] && SQL="$(cat)"
SQL="$(printf '%s' "$SQL" | sed -e 's/[[:space:]]*$//')"
SQL="${SQL%;}"                                   # saca un ; final si lo hay

# 1) un solo statement (no permitir ';' interno)
case "$SQL" in
  *";"*) echo "RECHAZADO: solo se permite UNA consulta por vez."; exit 3;;
esac
# 2) tiene que empezar con select o with (ignora mayúsc/espacios)
low="$(printf '%s' "$SQL" | tr 'A-Z' 'a-z' | sed -e 's/^[[:space:]]*//')"
case "$low" in
  select\ *|select$|with\ *) : ;;
  *) echo "RECHAZADO: solo SELECT/WITH (esto es solo lectura)."; exit 3;;
esac
# 3) ninguna palabra de escritura/DDL como token
if printf '%s' "$low" | grep -Eqw 'insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|merge|vacuum|reindex|comment|call|do'; then
  echo "RECHAZADO: contiene una palabra no permitida para solo lectura."; exit 3
fi

PGPASSWORD="$(val AGENTE_RO_PASSWORD)" \
PGCONNECT_TIMEOUT=12 \
"$PSQL" -w \
  -h "$(val AGENTE_RO_HOST)" -p "$(val AGENTE_RO_PORT)" \
  -U "$(val AGENTE_RO_USER)" -d "$(val AGENTE_RO_DB)" \
  -v ON_ERROR_STOP=1 -P pager=off \
  -c "$SQL" 2>&1 | head -200
