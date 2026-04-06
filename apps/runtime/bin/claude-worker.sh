#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GUARDIAN_BIN="${GUARDIAN_BIN:-$SCRIPT_DIR/weclaw-guardian}"

if [[ -x "$GUARDIAN_BIN" ]]; then
  exec "$GUARDIAN_BIN" claude-worker
fi

# Fallback: run legacy shell loop when guardian binary is unavailable.
LOG_DIR="${LONGCLAW_LOG_DIR:-/tmp/longclaw-guardian}"
LOG_FILE="$LOG_DIR/claude-worker.log"
mkdir -p "$LOG_DIR"

INTERVAL="${CLAUDE_CHECK_INTERVAL_SECONDS:-120}"
MAX_FAILS="${CLAUDE_MAX_CONSECUTIVE_FAILS:-3}"
HEALTH_CMD="${CLAUDE_HEALTH_CMD:-claude --version}"

if ! command -v claude >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] claude binary not found in PATH" >>"$LOG_FILE"
  exit 1
fi

fails=0
while true; do
  ts="[$(date '+%F %T')]"
  if bash -lc "$HEALTH_CMD" >>"$LOG_FILE" 2>&1; then
    fails=0
    echo "$ts claude health ok" >>"$LOG_FILE"
  else
    fails=$((fails + 1))
    echo "$ts claude health failed (fails=$fails/$MAX_FAILS)" >>"$LOG_FILE"
    if (( fails >= MAX_FAILS )); then
      echo "$ts claude worker exiting for launchd restart" >>"$LOG_FILE"
      exit 1
    fi
  fi
  sleep "$INTERVAL"
done
