#!/bin/bash
# sol_ops.sh — "manos operativas" del agente AgenteDJ (rol main / Luis).
#
# Mismo patrón seguro que sol_sql.sh: un solo script allowlisteado, con
# SUBCOMANDOS de argumento simple (sin metacaracteres), para que pase el
# parser de permisos de openclaw sin pedir aprobación. Acciones acotadas y
# NO destructivas: diagnóstico, ver logs, reiniciar servicios y correr un
# reporte a demanda. NO borra nada, no toca la base, no ejecuta rutas libres.
#
# Uso (el agente lo llama por exec):
#   sol_ops.sh estado                 -> salud de daemons, latido, últimas corridas
#   sol_ops.sh logs <nombre>          -> últimas líneas del log del daemon para ese agente
#   sol_ops.sh correr <reporte>       -> corre un reporte YA (desprendido, se manda solo)
#   sol_ops.sh reiniciar-daemon       -> reinicia el sync-daemon
#   sol_ops.sh reiniciar-gateway      -> reinicia el gateway de openclaw (bot Telegram)
#   sol_ops.sh ayuda                  -> lista de comandos
#
set -uo pipefail

REPO="/Users/agentedepositojimenez/genesis-orion"
SCRIPTS="$REPO/scripts"
PY="$REPO/.venv/bin/python"
LOG="$SCRIPTS/sync-daemon.log"
HEARTBEAT="/Users/agentedepositojimenez/sol-logs/daemon_heartbeat.txt"
RUNS="/Users/agentedepositojimenez/sol-logs/agent_runs.jsonl"
WS="/Users/agentedepositojimenez/.openclaw/workspace"

UID_NUM="$(id -u)"

# Nombres amigables -> (script, término de búsqueda en el log)
map_script() {
  case "$1" in
    fletes)    echo "vigilante_fletes.py" ;;
    matutino)  echo "reporte_matutino.py" ;;
    gabriel)   echo "gabriel_tendencias.py" ;;
    proformas) echo "vigilante_proformas.py" ;;
    pauta)     echo "reportero_performance.py" ;;
    guardian)  echo "guardian_presupuesto.py" ;;
    auditor)   echo "auditor_pauta.py" ;;
    ezequiel)  echo "ezequiel_profeta.py" ;;
    mateo)     echo "mateo_financiero.py" ;;
    latido)    echo "latido.py" ;;
    *)         echo "" ;;
  esac
}

reportes_validos="fletes matutino gabriel proformas pauta guardian auditor ezequiel mateo latido"

cmd_estado() {
  echo "🩺 ESTADO DEL SISTEMA — $(date '+%d/%m/%Y %H:%M')"
  echo
  echo "▸ Servicios (launchd):"
  launchctl list | grep -Ei 'sol|openclaw' | awk '{printf "   %-28s pid=%s exit=%s\n", $3, $1, $2}' || echo "   (sin servicios sol/openclaw)"
  echo
  echo "▸ Latido del daemon:"
  if [ -f "$HEARTBEAT" ]; then
    hb="$(cat "$HEARTBEAT" 2>/dev/null)"
    age=$(( ( $(date +%s) - $(stat -f %m "$HEARTBEAT") ) / 60 ))
    echo "   último: $hb  (hace ${age} min)"
    [ "$age" -gt 90 ] && echo "   ⚠️  El latido está viejo (>90 min): el daemon podría estar caído."
  else
    echo "   (no hay archivo de latido)"
  fi
  echo
  echo "▸ Últimas corridas de agentes:"
  if [ -f "$RUNS" ]; then
    tail -n 8 "$RUNS" 2>/dev/null | "$PY" "$SCRIPTS/_ops_fmt_runs.py" 2>/dev/null || tail -n 8 "$RUNS"
  else
    echo "   (sin registro de corridas)"
  fi
  echo
  echo "▸ Frescura de reportes guardados:"
  for f in ultimo_reporte_fletes.md ultimo_reporte_gabriel.md; do
    if [ -f "$WS/$f" ]; then
      d=$(( ( $(date +%s) - $(stat -f %m "$WS/$f") ) / 3600 ))
      echo "   $f — hace ${d} h"
    fi
  done
  echo
  echo "▸ Disco: $(df -h / | awk 'NR==2{print $4" libres de "$2" ("$5" usado)"}')"
}

cmd_logs() {
  local nombre="${1:-}"
  if [ -z "$nombre" ]; then echo "Decime de qué agente. Ej: sol_ops.sh logs fletes"; exit 2; fi
  # sanitizar: solo letras/números/guion
  if ! [[ "$nombre" =~ ^[a-zA-Z0-9_-]+$ ]]; then echo "Nombre inválido."; exit 2; fi
  echo "📄 Últimas líneas del log para '$nombre':"
  echo
  grep -i "$nombre" "$LOG" 2>/dev/null | tail -n 25
  local rc=$?
  [ "$rc" -ne 0 ] && echo "(no encontré líneas para '$nombre' en el log del daemon)"
}

cmd_correr() {
  local rep="${1:-}"
  local script; script="$(map_script "$rep")"
  if [ -z "$script" ]; then
    echo "No conozco el reporte '$rep'. Válidos: $reportes_validos"; exit 2
  fi
  # Lanzado DESPRENDIDO: sobrevive al timeout del exec y se manda solo a Telegram.
  ( cd "$SCRIPTS" && setsid "$PY" "$SCRIPTS/$script" --send >/dev/null 2>&1 < /dev/null & )
  echo "🚀 Corriendo '$rep' ($script) en segundo plano. Los reportes con IA tardan 2–5 min; el resultado llega solo a Telegram cuando termina."
}

cmd_reiniciar_daemon() {
  launchctl kickstart -k "gui/$UID_NUM/com.sol.sync-daemon"
  sleep 2
  if pgrep -f sync_daemon.py >/dev/null; then
    echo "🔄 Daemon (com.sol.sync-daemon) reiniciado y corriendo."
  else
    echo "⚠️ Mandé a reiniciar el daemon pero no lo veo corriendo todavía. Reintentá 'estado' en unos segundos."
  fi
}

cmd_reiniciar_gateway() {
  launchctl kickstart -k "gui/$UID_NUM/ai.openclaw.gateway"
  sleep 2
  if pgrep -f 'openclaw/dist/index.js gateway' >/dev/null; then
    echo "🔄 Gateway de openclaw reiniciado. (Si estás en una sesión vieja, mandá /new para recargar.)"
  else
    echo "⚠️ Mandé a reiniciar el gateway pero no lo veo corriendo todavía. Reintentá 'estado' en unos segundos."
  fi
}

cmd_ayuda() {
  cat <<'EOF'
🛠️ sol_ops.sh — comandos disponibles:
  estado                -> salud de daemons, latido, últimas corridas, disco
  logs <nombre>         -> últimas líneas del log del daemon (ej: logs fletes)
  correr <reporte>      -> corre un reporte YA, en segundo plano (llega a Telegram solo)
  reiniciar-daemon      -> reinicia el sync-daemon
  reiniciar-gateway     -> reinicia el gateway de openclaw
  ayuda                 -> esta lista

  Reportes válidos para 'correr': fletes, matutino, gabriel, proformas,
  pauta, guardian, auditor, ezequiel, mateo, latido.
EOF
}

sub="${1:-ayuda}"; shift || true
case "$sub" in
  estado|status)            cmd_estado ;;
  logs|log)                 cmd_logs "${1:-}" ;;
  correr|run)               cmd_correr "${1:-}" ;;
  reiniciar-daemon)         cmd_reiniciar_daemon ;;
  reiniciar-gateway)        cmd_reiniciar_gateway ;;
  ayuda|help|-h|--help)     cmd_ayuda ;;
  *) echo "Comando desconocido: '$sub'"; echo; cmd_ayuda; exit 2 ;;
esac
