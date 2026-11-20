#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prueba de humo local: arranca el servidor real de DSH con un DSH_HOME
# temporal, comprueba el flujo de autenticación (401 sin token, 303 con token,
# 200 con cookie) y lo detiene.
#
#   npm run smoke
#
# Necesita Node 24.9+, npx, curl y red o el paquete de DSH ya cacheado. No abre
# ninguna ventana. No toca tu ~/.dsh.
# ---------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER="$ROOT/dsh-desktop"

for command in node npx curl setsid; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Falta el comando requerido: %s\n' "$command" >&2
    exit 1
  fi
done

if [ ! -x "$LAUNCHER" ]; then
  printf 'No existe %s; ejecuta primero: npm run build\n' "$LAUNCHER" >&2
  exit 1
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/dsh-desktop-smoke.XXXXXX")"
SERVER_PID=""
cleanup() {
  set +e
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill -TERM -- "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null
    for _ in $(seq 1 50); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL -- "-$SERVER_PID" 2>/dev/null || kill -KILL "$SERVER_PID" 2>/dev/null
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

mkdir -p "$TMP/workspace" "$TMP/run"
chmod 700 "$TMP/run"

export HOME="${HOME:?HOME no está definido}"
export XDG_CONFIG_HOME="$TMP/config"
export XDG_DATA_HOME="$TMP/data"
export XDG_STATE_HOME="$TMP/state"
export XDG_RUNTIME_DIR="$TMP/run"
export DSH_HOME="$TMP/dsh-home"
export DSH_DESKTOP_WORKSPACE="$TMP/workspace"
export DSH_DESKTOP_PORT="0"
export DSH_DESKTOP_START_TIMEOUT="180"
export DSH_DESKTOP_NODE="${DSH_DESKTOP_NODE:-$(command -v node)}"

LOG="$TMP/server.log"
printf 'Arrancando el servidor de prueba (DSH_HOME temporal)…\n'
setsid "$LAUNCHER" --no-window >"$LOG" 2>&1 &
SERVER_PID=$!

printf 'Esperando la URL de arranque'
for _ in $(seq 1 180); do
  if grep -q '^dsh web: http' "$LOG" 2>/dev/null; then
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    printf '\nEl servidor terminó antes de estar listo:\n' >&2
    tail -n 40 "$LOG" >&2
    exit 1
  fi
  printf '.'
  sleep 1
done
printf '\n'

URL="$(sed -n 's/^dsh web: \(http[^[:space:]]*\)$/\1/p' "$LOG" | head -n 1)"
if [ -z "$URL" ]; then
  printf 'No se encontró la URL de arranque en el registro:\n' >&2
  tail -n 40 "$LOG" >&2
  exit 1
fi

ORIGIN="${URL%%/\?*}"
COOKIES="$TMP/cookies"

status() {
  curl --max-time 10 -s -o /dev/null -w '%{http_code}' "$@"
}

CODE="$(status "$ORIGIN/")"
[ "$CODE" = "401" ] || { printf 'Se esperaba 401 sin token, se obtuvo %s\n' "$CODE" >&2; exit 1; }
printf '  ok  401 sin token\n'

CODE="$(status -c "$COOKIES" "$URL")"
[ "$CODE" = "303" ] || { printf 'Se esperaba 303 con token, se obtuvo %s\n' "$CODE" >&2; exit 1; }
printf '  ok  303 con token (cookie emitida)\n'

CODE="$(status -b "$COOKIES" "$ORIGIN/")"
[ "$CODE" = "200" ] || { printf 'Se esperaba 200 con cookie, se obtuvo %s\n' "$CODE" >&2; exit 1; }
printf '  ok  200 con cookie\n'

printf '\nPrueba de humo correcta.\n'
