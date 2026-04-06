#!/usr/bin/env bash
set -euo pipefail

HOME_DIR="${HOME}"
WECLAW_HOME="${WECLAW_HOME:-$HOME_DIR/.weclaw}"
LAUNCH_AGENTS_DIR="${HOME_DIR}/Library/LaunchAgents"

for label in \
  com.weclaw.daemon \
  com.weclaw.watchdog \
  com.longclaw.guardian.daemon \
  com.longclaw.guardian.scheduler \
  com.zhangqilong.weclaw.heartbeat \
  com.zhangqilong.weclaw.session-watchdog \
  com.zhangqilong.longclaw.guardian-heartbeat \
  com.zhangqilong.longclaw.guardian-scheduler
do
  launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
  rm -f "$LAUNCH_AGENTS_DIR/$label.plist"
done

if lsof -nP -iTCP:18011 -sTCP:LISTEN 2>/dev/null | rg -q 'weclaw'; then
  pid="$(lsof -tiTCP:18011 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${pid:-}" ]]; then
    kill "$pid" >/dev/null 2>&1 || true
    sleep 1
  fi
fi

rm -f \
  "$WECLAW_HOME/session-watchdog.sh" \
  "$WECLAW_HOME/watchdog.log" \
  "$WECLAW_HOME/watchdog.launchd.out.log" \
  "$WECLAW_HOME/watchdog.launchd.err.log" \
  "$WECLAW_HOME/weclaw.pid"

echo "legacy runtime residue removed"
