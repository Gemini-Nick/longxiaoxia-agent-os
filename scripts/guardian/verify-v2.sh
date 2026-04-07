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
EXPECTED_RUNTIME_MARKER="watchdog-runtime-version: workspace-v2-2026-04-06"
EXPECTED_SUMMARY_MARKER="📊 工作区总数:"
RUNTIME_SCRIPT="$RUNTIME_INSTALL_DIR/bin/repo-scheduler-service.sh"
WORKSPACE_CONFIG_FILE="$RUNTIME_INSTALL_DIR/config/workspace-watchdog.json"

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

log "checking installed runtime script signature"
if [[ -f "$RUNTIME_SCRIPT" ]] && grep -Fq "$EXPECTED_RUNTIME_MARKER" "$RUNTIME_SCRIPT" && grep -Fq "$EXPECTED_SUMMARY_MARKER" "$RUNTIME_SCRIPT"; then
  echo "OK   runtime signature"
else
  echo "FAIL runtime signature mismatch"
  status=1
fi

log "checking installed workspace config"
if [[ -f "$WORKSPACE_CONFIG_FILE" ]]; then
  echo "OK   workspace config"
else
  echo "MISS $WORKSPACE_CONFIG_FILE"
  status=1
fi

log "checking codex health endpoint"
if curl -fsS --max-time 3 http://127.0.0.1:45678/healthz >/dev/null 2>&1; then
  echo "OK   codex /healthz"
else
  echo "WARN codex /healthz unavailable"
fi

if [[ -f "$WECLAW_HOME/runtime-manifest.json" ]]; then
  log "checking weclaw runtime manifest"
  echo "OK   runtime manifest"
  sed -n '1,80p' "$WECLAW_HOME/runtime-manifest.json"
else
  echo "WARN runtime manifest missing"
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
