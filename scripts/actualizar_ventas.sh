#!/usr/bin/env bash
# actualizar_ventas.sh — disparo manual de la descarga de ventas (Comando 2 de dios).
# Es lo ÚNICO que se agrega a la allowlist de exec ("manos de dios"): un script acotado
# que solo encola la descarga de ventas que YA existe. La lógica vive en el .py de al lado.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/.venv/bin/python"
[ -x "$PY" ] || PY="$(command -v python3)"
exec "$PY" "$ROOT/scripts/actualizar_ventas_impl.py" "$@"
