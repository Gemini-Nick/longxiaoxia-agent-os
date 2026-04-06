#!/usr/bin/env bash
set -euo pipefail

LOG_DIR="${LONGCLAW_LOG_DIR:-/tmp/longclaw-guardian}"
LOG_FILE="$LOG_DIR/scheduler.task.log"
STATE_FILE="$LOG_DIR/repo-scheduler.state"
BOOTSTRAP="${LONGCLAW_BOOTSTRAP:-$HOME/.longclaw/bootstrap-longclaw-repos.sh}"
REPO_ROOT="${REPO_ROOT:-$HOME/github代码仓库}"
WECLAW_BIN="${WECLAW_BIN:-$HOME/.weclaw/bin/weclaw}"
WECLAW_ACCOUNTS_DIR="${WECLAW_ACCOUNTS_DIR:-$HOME/.weclaw/accounts}"
WECLAW_LOG_FILE="${WECLAW_LOG_FILE:-$HOME/.weclaw/weclaw.log}"
WECLAW_PORT="${WECLAW_PORT:-18011}"
mkdir -p "$LOG_DIR"

ts() {
  date '+%F %T'
}

log() {
  printf '[%s] %s\n' "$(ts)" "$*" >>"$LOG_FILE"
}

find_repo_count() {
  if [[ ! -d "$REPO_ROOT" ]]; then
    echo 0
    return 0
  fi
  find "$REPO_ROOT" -type d -name .git 2>/dev/null | wc -l | tr -d ' '
}

find_weclaw_user_id() {
  local account
  account="$(find "$WECLAW_ACCOUNTS_DIR" -maxdepth 1 -type f -name '*-im-bot.json' 2>/dev/null | head -n 1 || true)"
  if [[ -z "$account" ]]; then
    return 0
  fi
  python3 - "$account" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    print(json.load(f).get('ilink_user_id', ''))
PY
}

detect_trigger() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "run_at_load"
  else
    echo "interval"
  fi
}

write_state() {
  cat >"$STATE_FILE" <<EOF
last_run_at=$(date '+%FT%T%z')
last_trigger=$1
EOF
}

build_summary_message() {
  local repo_total="$1"
  local dep_updates="$2"
  local auto_commits="$3"
  local cloud_syncs="$4"
  local cloud_pushes="$5"
  local run_result="$6"

  cat <<EOF
🔄 Watchdog 自动化报告
━━━━━━━━━━━━━━━━━━━━
📊 仓库总数: $repo_total
📦 依赖更新: $dep_updates
📝 自动提交: $auto_commits
☁️ 云端同步: $cloud_syncs
🚀 云端推送: $cloud_pushes

$run_result
EOF
}

send_summary() {
  local msg="$1"
  local user_id
  user_id="$(find_weclaw_user_id)"
  if [[ -z "$user_id" ]]; then
    log "summary skipped: no weclaw user id found in $WECLAW_ACCOUNTS_DIR"
    return 0
  fi

  if [[ ! -x "$WECLAW_BIN" ]]; then
    log "summary skipped: weclaw binary not found at $WECLAW_BIN"
    return 0
  fi

  if ! lsof -nP -iTCP:"$WECLAW_PORT" -sTCP:LISTEN 2>/dev/null | rg -q 'weclaw'; then
    log "weclaw listener not ready on port $WECLAW_PORT; attempting background start"
    "$WECLAW_BIN" start >/dev/null 2>&1 || true
    sleep 2
  fi

  if "$WECLAW_BIN" send --to "$user_id" --text "$msg" >/dev/null 2>&1; then
    log "summary sent to $user_id"
    return 0
  fi

  if [[ -f "$WECLAW_LOG_FILE" ]] && tail -n 30 "$WECLAW_LOG_FILE" | rg -q 'WeChat session expired'; then
    log "summary skipped: notify_skipped_session_expired"
    return 0
  fi

  log "summary skipped: weclaw send failed"
  return 0
}

main() {
  local trigger repo_total dep_updates auto_commits cloud_syncs cloud_pushes rc tmp_output result_text attempted
  trigger="$(detect_trigger)"
  repo_total="$(find_repo_count)"
  dep_updates=0
  auto_commits=0
  cloud_pushes=0
  cloud_syncs=0

  log "scheduler tick trigger=$trigger repo_root=$REPO_ROOT bootstrap=$BOOTSTRAP"

  if [[ ! -f "$BOOTSTRAP" ]]; then
    log "bootstrap not found: $BOOTSTRAP"
    result_text="⚠️  本次仅完成调度检查，未找到同步脚本"
    send_summary "$(build_summary_message "$repo_total" "$dep_updates" "$auto_commits" "$cloud_syncs" "$cloud_pushes" "$result_text")"
    write_state "$trigger"
    return 0
  fi

  tmp_output="$(mktemp "$LOG_DIR/scheduler.XXXXXX.log")"
  set +e
  REPO_ROOT="$REPO_ROOT" bash "$BOOTSTRAP" pull >"$tmp_output" 2>&1
  rc=$?
  set -e

  cat "$tmp_output" >>"$LOG_FILE"
  attempted="$(rg -c '^\[pull\] ' "$tmp_output" 2>/dev/null || true)"
  attempted="${attempted:-0}"
  if [[ "$rc" -eq 0 ]]; then
    cloud_syncs="$attempted"
    result_text="👌 全流程执行完成，无需手动处理"
  else
    cloud_syncs="$attempted"
    result_text="⚠️  本次同步存在异常，请查看 scheduler.task.log"
    log "scheduler run failed rc=$rc attempted=$attempted"
  fi

  send_summary "$(build_summary_message "$repo_total" "$dep_updates" "$auto_commits" "$cloud_syncs" "$cloud_pushes" "$result_text")"
  rm -f "$tmp_output"
  write_state "$trigger"
}

main "$@"
