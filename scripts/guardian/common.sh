#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUNTIME_SRC_DIR="$ROOT_DIR/apps/runtime"
RUNTIME_INSTALL_DIR="$HOME/.longclaw/runtime-v2"
WECLAW_HOME="$HOME/.weclaw"
WECLAW_BIN_DIR="$WECLAW_HOME/bin"
WECLAW_REAL_BUNDLE="${WECLAW_REAL_BUNDLE:-$ROOT_DIR/bundle/weclaw-real}"
WECLAW_REPO_DIR="${WECLAW_REPO_DIR:-/Users/zhangqilong/Desktop/github代码仓库/weclaw}"
WECLAW_CONFIG_PATH="$WECLAW_HOME/services.json"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="/tmp/longclaw-guardian"

NEW_LABELS=(
  "com.zhangqilong.ai.codex.appserver"
  "com.zhangqilong.ai.claude.worker"
  "com.zhangqilong.ai.weclaw.bridge"
  "com.zhangqilong.ai.repo.scheduler"
  "com.zhangqilong.ai.guardian.monitor"
)

LEGACY_LABELS=(
  "com.weclaw.daemon"
  "com.weclaw.watchdog"
  "com.longclaw.guardian.daemon"
  "com.longclaw.guardian.scheduler"
  "com.zhangqilong.weclaw.heartbeat"
  "com.zhangqilong.weclaw.session-watchdog"
  "com.zhangqilong.longclaw.guardian-heartbeat"
  "com.zhangqilong.longclaw.guardian-scheduler"
)

log() {
  printf '==> %s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

err() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

ensure_dirs() {
  mkdir -p "$RUNTIME_INSTALL_DIR/bin" "$RUNTIME_INSTALL_DIR/launchd" "$LOG_DIR" "$WECLAW_BIN_DIR" "$LAUNCH_AGENTS_DIR"
}

render_template() {
  local template="$1"
  local out="$2"
  local uid user home runtime log_dir
  uid="$(id -u)"
  user="$(id -un)"
  home="$HOME"
  runtime="$RUNTIME_INSTALL_DIR"
  log_dir="$LOG_DIR"

  sed \
    -e "s|__UID__|$uid|g" \
    -e "s|__USER__|$user|g" \
    -e "s|__HOME__|$home|g" \
    -e "s|__RUNTIME_DIR__|$runtime|g" \
    -e "s|__LOG_DIR__|$log_dir|g" \
    "$template" >"$out"
}

bootout_gui_label() {
  local label="$1"
  launchctl bootout "gui/$(id -u)/$label" >/dev/null 2>&1 || true
}

bootstrap_gui_plist() {
  local plist="$1"
  local uid
  uid="$(id -u)"
  if launchctl bootstrap "gui/$uid" "$plist" >/tmp/launchctl.bootstrap.$$.log 2>&1; then
    return 0
  fi
  sleep 1
  launchctl bootstrap "gui/$uid" "$plist"
}

list_matching_labels() {
  launchctl list | rg -n "$(printf '%s|' "$@" | sed 's/|$//')" || true
}

launchd_has_label() {
  local label="$1"
  local uid
  uid="$(id -u)"
  launchctl print "gui/$uid/$label" >/dev/null 2>&1 && return 0
  launchctl print "user/$uid/$label" >/dev/null 2>&1 && return 0
  launchctl print "system/$label" >/dev/null 2>&1 && return 0
  return 1
}

ad_hoc_sign_binary() {
  local bin="$1"
  [[ -f "$bin" ]] || err "binary not found: $bin"
  if [[ "$(uname -s)" != "Darwin" ]]; then
    return 0
  fi
  if ! command -v codesign >/dev/null 2>&1; then
    warn "codesign not found; skip ad-hoc signing for $bin"
    return 0
  fi
  codesign --force --sign - "$bin" >/dev/null
}

build_weclaw_real_from_repo() {
  local repo="$1"
  local out="$2"

  [[ -d "$repo" ]] || return 1
  [[ -f "$repo/go.mod" ]] || return 1

  mkdir -p /tmp/weclaw-build-cache /tmp/weclaw-build-mod
  (
    cd "$repo"
    GOCACHE=/tmp/weclaw-build-cache \
    GOMODCACHE=/tmp/weclaw-build-mod \
    go build -o "$out" .
  )
}
