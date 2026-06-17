#!/usr/bin/env bash
# Pide la contraseña de agente_ro y la guarda en .env.agente (fuera de git).
# La contraseña nunca se muestra ni viaja por el chat.
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

grep -qx ".env.agente" .gitignore 2>/dev/null || echo ".env.agente" >> .gitignore

read -rsp "Contraseña de agente_ro: " P
echo
if [ -z "$P" ]; then
  echo "Quedó vacía. Volvé a correr el comando y tipeá la contraseña antes de Enter."
  exit 1
fi

{
  echo "AGENTE_RO_HOST=aws-1-us-east-1.pooler.supabase.com"
  echo "AGENTE_RO_PORT=5432"
  echo "AGENTE_RO_USER=agente_ro.xeeieqjqmtoiutfnltqu"
  echo "AGENTE_RO_DB=postgres"
  printf "AGENTE_RO_PASSWORD=%s\n" "$P"
} > .env.agente
unset P

echo "LISTO ✅  (.env.agente creado con $(wc -l < .env.agente | tr -d ' ') líneas)"
