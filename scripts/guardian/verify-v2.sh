#!/usr/bin/env bash
set -euo pipefail

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then
  STRICT=1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

status=0

log "checking new labels"
for label in "${NEW_LABELS[@]}"; do
  if launchd_has_label "$label"; then
    echo "OK   $label"
  else
    echo "MISS $label"
    status=1
  fi
done

log "checking guardian status command"
if [[ -x "$WECLAW_BIN_DIR/weguard" ]]; then
  if "$WECLAW_BIN_DIR/weguard" status >/tmp/longclaw-guardian/weguard-status.out 2>&1; then
    echo "OK   weguard status"
  else
    echo "FAIL weguard status returned non-zero"
    sed -n '1,40p' /tmp/longclaw-guardian/weguard-status.out || true
    status=1
  fi
else
  echo "MISS $WECLAW_BIN_DIR/weguard"
  status=1
fi

log "checking codex health endpoint"
if curl -fsS --max-time 3 http://127.0.0.1:45678/healthz >/dev/null 2>&1; then
  echo "OK   codex /healthz"
else
  echo "WARN codex /healthz unavailable"
fi

if (( STRICT == 1 )); then
  log "strict mode: legacy labels must be absent"
  for label in "${LEGACY_LABELS[@]}"; do
    if launchd_has_label "$label"; then
      echo "LEGACY_RUNNING $label"
      status=1
    fi
  done
fi

exit "$status"
