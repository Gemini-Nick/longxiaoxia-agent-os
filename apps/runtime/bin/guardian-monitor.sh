#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="${WECLAW_CONFIG:-$HOME/.weclaw/services.json}"
GUARDIAN_BIN="${GUARDIAN_BIN:-$SCRIPT_DIR/weclaw-guardian}"
GUI_UID="${GUARDIAN_GUI_UID:-$(id -u)}"

if [[ ! -x "$GUARDIAN_BIN" ]]; then
  echo "guardian binary not found: $GUARDIAN_BIN" >&2
  exit 1
fi

exec "$GUARDIAN_BIN" monitor --config "$CONFIG_PATH" --uid "$GUI_UID"
