#!/usr/bin/env bash
set -euo pipefail

LISTEN_URL="${CODEX_LISTEN_URL:-ws://127.0.0.1:45678}"
LOG_DIR="${LONGCLAW_LOG_DIR:-/tmp/longclaw-guardian}"
LOG_FILE="$LOG_DIR/codex-appserver.log"
mkdir -p "$LOG_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex binary not found in PATH" >>"$LOG_FILE"
  exit 1
fi

{
  echo "[$(date '+%F %T')] codex app-server starting on $LISTEN_URL"
} >>"$LOG_FILE"

exec codex app-server --listen "$LISTEN_URL" >>"$LOG_FILE" 2>&1
