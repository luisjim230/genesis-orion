#!/usr/bin/env bash
# enviar_imagen.sh — AgenteDJ envía una imagen (cuadro/análisis) a Telegram.
#
# Toma un HTML local, lo renderiza a PNG con altura automática (Chrome headless)
# y lo manda al chat de Telegram vía el bot interactivo (sendPhoto). El token sale
# de ~/.openclaw/openclaw.json (no se hardcodea ni se le pide a nadie).
#
# Uso típico (RECOMENDADO, el agente arma el HTML y luego llama así):
#   enviar_imagen.sh --html /ruta/cuadro.html --caption "Comparativo de ventanas"
#
# Opciones:
#   --html <archivo>    HTML a renderizar y enviar.            (o --png para enviar una imagen ya hecha)
#   --png  <archivo>    PNG/JPG ya listo, se envía tal cual.
#   --caption "texto"   Texto corto al pie de la imagen.       (opcional, máx ~1000 chars)
#   --chat <id>         Chat de Telegram destino.              (opcional; default: Luis 8781175035)
#   --width <px>        Ancho lógico del render.               (opcional; default 820)
#
# Devuelve "ENVIADO ok (msg <id>)" si todo salió bien, o "ERROR: ..." si no.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RENDER="$ROOT/scripts/render_html.mjs"
OC_JSON="${OPENCLAW_CONFIG_PATH:-$HOME/.openclaw/openclaw.json}"
NODE="${NODE_BIN:-/opt/homebrew/bin/node}"

HTML=""; PNG=""; CAPTION=""; CHAT="8781175035"; WIDTH="820"
while [ $# -gt 0 ]; do
  case "$1" in
    --html)    HTML="${2:-}"; shift 2;;
    --png)     PNG="${2:-}"; shift 2;;
    --caption) CAPTION="${2:-}"; shift 2;;
    --chat)    CHAT="${2:-}"; shift 2;;
    --width)   WIDTH="${2:-}"; shift 2;;
    *) echo "ERROR: opción desconocida: $1"; exit 2;;
  esac
done

[ -f "$OC_JSON" ] || { echo "ERROR: no encuentro openclaw.json en $OC_JSON"; exit 2; }
TOKEN="$(/usr/bin/python3 -c "import json,sys; print(json.load(open('$OC_JSON'))['channels']['telegram']['botToken'])" 2>/dev/null || true)"
[ -n "$TOKEN" ] || { echo "ERROR: no pude leer el botToken de Telegram desde $OC_JSON"; exit 2; }

# Resolver la imagen a enviar
if [ -n "$PNG" ]; then
  [ -f "$PNG" ] || { echo "ERROR: no existe el PNG: $PNG"; exit 2; }
  IMG="$PNG"
elif [ -n "$HTML" ]; then
  [ -f "$HTML" ] || { echo "ERROR: no existe el HTML: $HTML"; exit 2; }
  IMG="$(/usr/bin/mktemp /tmp/oc-img-XXXXXX).png"
  # Limpiar Chrome de renders previos colgados
  pkill -f "oc-chrome-measure\|oc-chrome-shot" 2>/dev/null || true
  rm -rf /tmp/oc-chrome-measure /tmp/oc-chrome-shot
  RENDER_OUT="$("$NODE" "$RENDER" "$HTML" "$IMG" "$WIDTH" 2>&1)" || { echo "ERROR: falló el render: $RENDER_OUT"; exit 3; }
else
  echo "ERROR: indicá --html <archivo> o --png <archivo>"; exit 2
fi

# Enviar a Telegram
RESP="$(/usr/bin/curl -s -F chat_id="$CHAT" -F caption="$CAPTION" -F photo=@"$IMG" \
  "https://api.telegram.org/bot${TOKEN}/sendPhoto")"
OK="$(printf '%s' "$RESP" | /usr/bin/python3 -c "import json,sys; d=json.load(sys.stdin); print('ok' if d.get('ok') else 'err'); print(d.get('result',{}).get('message_id','') if d.get('ok') else d.get('description',''))" 2>/dev/null || printf 'err\nrespuesta ilegible')"
STATUS="$(printf '%s' "$OK" | sed -n 1p)"
DETAIL="$(printf '%s' "$OK" | sed -n 2p)"

if [ "$STATUS" = "ok" ]; then
  echo "ENVIADO ok (msg $DETAIL)"
else
  echo "ERROR: Telegram rechazó el envío: $DETAIL"
  exit 4
fi
