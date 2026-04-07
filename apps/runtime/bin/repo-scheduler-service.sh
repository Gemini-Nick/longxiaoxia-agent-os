#!/usr/bin/env bash
# watchdog-runtime-version: workspace-v2-2026-04-06
set -euo pipefail

LOG_DIR="${LONGCLAW_LOG_DIR:-/tmp/longclaw-guardian}"
LOG_FILE="$LOG_DIR/scheduler.task.log"
STATE_FILE="$LOG_DIR/repo-scheduler.state"
LOCK_DIR="$LOG_DIR/repo-scheduler.lock"
BOOTSTRAP="${LONGCLAW_BOOTSTRAP:-$HOME/.longclaw/bootstrap-longclaw-repos.sh}"
REPO_ROOT="${REPO_ROOT:-$HOME/github代码仓库}"
WECLAW_BIN="${WECLAW_BIN:-$HOME/.weclaw/bin/weclaw}"
WECLAW_ACCOUNTS_DIR="${WECLAW_ACCOUNTS_DIR:-$HOME/.weclaw/accounts}"
WECLAW_LOG_FILE="${WECLAW_LOG_FILE:-$HOME/.weclaw/weclaw.log}"
WECLAW_PORT="${WECLAW_PORT:-18011}"
WORKSPACE_CONFIG="${LONGCLAW_WORKSPACE_CONFIG:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/config/workspace-watchdog.json}"
AUTO_COMMIT_MESSAGE="${LONGCLAW_AUTO_COMMIT_MESSAGE:-chore(watchdog): auto-commit tracked workspace changes}"
DRY_RUN="${LONGCLAW_DRY_RUN:-0}"
RUNTIME_VERSION="workspace-v2-2026-04-06"
mkdir -p "$LOG_DIR"

CURRENT_DISCOVERY_FILE=""

ts() {
  date '+%F %T'
}

log() {
  printf '[%s] %s\n' "$(ts)" "$*" >>"$LOG_FILE"
}

cleanup() {
  if [[ -n "$CURRENT_DISCOVERY_FILE" && -f "$CURRENT_DISCOVERY_FILE" ]]; then
    rm -f "$CURRENT_DISCOVERY_FILE"
  fi
  if [[ -d "$LOCK_DIR" ]]; then
    rmdir "$LOCK_DIR" 2>/dev/null || true
  fi
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
  local workspace_total="$1"
  local dep_updates="$2"
  local auto_commits="$3"
  local cloud_syncs="$4"
  local cloud_pushes="$5"
  local run_result="$6"

  cat <<EOF
🔄 Watchdog 自动化报告
━━━━━━━━━━━━━━━━━━━━
📊 工作区总数: $workspace_total
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

  if ! lsof -nP -iTCP:"$WECLAW_PORT" -sTCP:LISTEN 2>/dev/null | grep -q 'weclaw'; then
    log "weclaw listener not ready on port $WECLAW_PORT; attempting background start"
    "$WECLAW_BIN" start >/dev/null 2>&1 || true
    sleep 2
  fi

  if "$WECLAW_BIN" send --to "$user_id" --text "$msg" >/dev/null 2>&1; then
    log "summary sent to $user_id"
    return 0
  fi

  if [[ -f "$WECLAW_LOG_FILE" ]] && tail -n 30 "$WECLAW_LOG_FILE" | grep -q 'WeChat session expired'; then
    log "summary skipped: notify_skipped_session_expired"
    return 0
  fi

  log "summary skipped: weclaw send failed"
  return 0
}

has_origin_remote() {
  local repo="$1"
  git -C "$repo" remote get-url origin >/dev/null 2>&1
}

repo_has_tracked_changes() {
  local repo="$1"
  if ! git -C "$repo" diff --quiet --ignore-submodules --; then
    return 0
  fi
  if ! git -C "$repo" diff --cached --quiet --ignore-submodules --; then
    return 0
  fi
  return 1
}

run_dependency_updates() {
  local repo="$1"
  local changed=1
  local attempted=0
  local before_status after_status

  before_status="$(git -C "$repo" status --porcelain --untracked-files=all 2>/dev/null || true)"

  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ -f "$repo/package.json" ]] || [[ -f "$repo/pyproject.toml" ]] || [[ -f "$repo/go.mod" ]]; then
      log "workspace=$repo dependency_update skipped=dry_run"
    else
      log "workspace=$repo dependency_update skipped=no_supported_ecosystem"
    fi
    return 1
  fi

  if [[ -f "$repo/package.json" ]] && command -v npm >/dev/null 2>&1; then
    attempted=1
    log "workspace=$repo dependency_update ecosystem=node command=npm update --package-lock-only --ignore-scripts"
    (
      cd "$repo"
      npm update --package-lock-only --ignore-scripts
    ) >>"$LOG_FILE" 2>&1 || log "workspace=$repo dependency_update_failed ecosystem=node"
  fi

  if [[ -f "$repo/pyproject.toml" ]] && [[ -f "$repo/uv.lock" ]] && command -v uv >/dev/null 2>&1; then
    attempted=1
    log "workspace=$repo dependency_update ecosystem=uv command=uv lock --upgrade"
    (
      cd "$repo"
      uv lock --upgrade
    ) >>"$LOG_FILE" 2>&1 || log "workspace=$repo dependency_update_failed ecosystem=uv"
  fi

  if [[ -f "$repo/go.mod" ]] && command -v go >/dev/null 2>&1; then
    attempted=1
    log "workspace=$repo dependency_update ecosystem=go command=go get -u ./... && go mod tidy"
    (
      cd "$repo"
      go get -u ./...
      go mod tidy
    ) >>"$LOG_FILE" 2>&1 || log "workspace=$repo dependency_update_failed ecosystem=go"
  fi

  if [[ "$attempted" -eq 0 ]]; then
    log "workspace=$repo dependency_update skipped=no_supported_ecosystem"
    return 1
  fi

  after_status="$(git -C "$repo" status --porcelain --untracked-files=all 2>/dev/null || true)"
  if [[ "$after_status" != "$before_status" ]]; then
    changed=0
  fi
  return "$changed"
}

build_obsidian_summary() {
  local summary="$1"
  python3 - "$summary" <<'PY'
import re
import sys

summary = sys.argv[1].strip()
if not summary:
    sys.exit(0)

pairs = {}
for key, value in re.findall(r'([A-Za-z_]+)=([0-9]+)', summary):
    pairs[key] = int(value)

failed = sum(value for key, value in pairs.items() if "failed" in key)
actions = sum(
    value
    for key, value in pairs.items()
    if ("archived" in key or "cleaned" in key) and "retained" not in key and "failed" not in key
)

if failed > 0:
    print(f"🧠 Obsidian: 失败 {failed} 项，请看日志")
elif actions > 0:
    print(f"🧠 Obsidian: 清理 {actions} 项")
PY
}

discover_workspaces() {
  python3 - "$WORKSPACE_CONFIG" "$BOOTSTRAP" "$REPO_ROOT" <<'PY'
import json
import os
import subprocess
import sys
from pathlib import Path

config_path = Path(os.path.expanduser(sys.argv[1]))
bootstrap = Path(os.path.expanduser(sys.argv[2]))
repo_root = Path(os.path.expanduser(sys.argv[3]))
home = Path.home()

def expand(path_str: str) -> Path:
    return Path(os.path.expanduser(path_str)).resolve()

def git_toplevel(path: Path):
    try:
        out = subprocess.check_output(
            ["git", "-C", str(path), "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        return None
    return Path(out).resolve() if out else None

config = {
    "scan_roots": ["~/Desktop", "~/Documents", "~/github代码仓库"],
    "explicit_workspaces": ["~/Documents/Playground"],
    "ignored_path_patterns": [],
    "tool_mappings": {},
}
if config_path.exists():
    with config_path.open("r", encoding="utf-8") as fh:
        loaded = json.load(fh)
    if isinstance(loaded, dict):
        config.update(loaded)

scan_roots = [expand(p) for p in config.get("scan_roots", [])]
explicit_workspaces = [expand(p) for p in config.get("explicit_workspaces", [])]
tool_mappings = config.get("tool_mappings", {}) or {}
scan_root_set = {str(path) for path in scan_roots}
explicit_workspace_set = {str(path) for path in explicit_workspaces}

workspaces = {}
tool_mapping_count = 0
tool_only_logs = []

def add_workspace(path: Path, source: str, category_hint: str):
    real = path.resolve()
    git_root = git_toplevel(real)
    if git_root is not None:
        canonical = git_root
        category = "git_repo"
    else:
        canonical = real
        category = category_hint or "non_git_workspace"
    entry = workspaces.get(str(canonical))
    if entry is None:
        entry = {
            "path": str(canonical),
            "category": category,
            "sources": [],
        }
        workspaces[str(canonical)] = entry
    if source not in entry["sources"]:
        entry["sources"].append(source)
    if entry["category"] != "git_repo" and category == "git_repo":
        entry["category"] = category

def should_skip_root(path: Path) -> bool:
    parts = set(path.parts)
    if any(part in {".git", ".codex", ".claude", ".weclaw", "node_modules"} for part in parts):
        return True
    if str(path).startswith(str(home / "Library")):
        return True
    return False

def is_broad_non_git_path(path: Path) -> bool:
    path_str = str(path)
    if path_str in explicit_workspace_set:
        return False
    if path_str == str(home):
        return True
    if path_str in scan_root_set:
        return True
    return False

for root in scan_roots:
    if not root.exists():
        continue
    if root.is_dir() and root.joinpath(".git").exists():
        add_workspace(root, f"scan_root:{root}", "git_repo")
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        dirs[:] = [
            d for d in dirs
            if d not in {".git", "node_modules", ".cache", ".Trash", ".claude", ".codex", ".weclaw", "Library"}
        ]
        if current_path.name in {".git", "node_modules", ".cache", ".Trash", ".claude", ".codex", ".weclaw"}:
            continue
        if current_path.joinpath(".git").exists():
            add_workspace(current_path, f"scan_root:{root}", "git_repo")
            dirs[:] = []

for workspace in explicit_workspaces:
    if workspace.exists():
        add_workspace(workspace, "explicit_workspace", "non_git_workspace")

if bootstrap.exists():
    try:
        output = subprocess.check_output(
            ["bash", str(bootstrap), "status"],
            env={**os.environ, "REPO_ROOT": str(repo_root)},
            stderr=subprocess.DEVNULL,
            text=True,
        )
        for line in output.splitlines():
            if not line.startswith("[ok] "):
                continue
            rel = line[5:].split("\t", 1)[0].strip()
            if not rel:
                continue
            candidate = (repo_root / rel).resolve()
            if candidate.exists():
                add_workspace(candidate, "bootstrap", "git_repo")
    except Exception:
        pass

codex_dir_raw = tool_mappings.get("codex_worktrees_dir")
if codex_dir_raw:
    codex_dir = expand(codex_dir_raw)
    if codex_dir.exists():
        for gitfile in codex_dir.glob("*/*/.git"):
            try:
                first = gitfile.read_text(encoding="utf-8").splitlines()[0]
            except Exception:
                tool_only_logs.append(f"tool_mapping_only source=codex_worktree path={gitfile.parent} reason=unreadable_gitfile")
                continue
            if not first.startswith("gitdir: "):
                tool_only_logs.append(f"tool_mapping_only source=codex_worktree path={gitfile.parent} reason=unsupported_gitfile")
                continue
            gitdir = Path(first[8:].strip()).expanduser()
            gitdir_str = str(gitdir)
            marker = "/.git/worktrees/"
            if marker not in gitdir_str:
                tool_only_logs.append(f"tool_mapping_only source=codex_worktree path={gitfile.parent} reason=no_worktree_marker")
                continue
            real = Path(gitdir_str.split(marker, 1)[0]).resolve()
            if real.exists():
                tool_mapping_count += 1
                add_workspace(real, f"codex_worktree:{gitfile.parent}", "tool_mapping_only")
            else:
                tool_only_logs.append(f"tool_mapping_only source=codex_worktree path={gitfile.parent} reason=resolved_path_missing")

def decode_claude_project(name: str):
    candidates = []
    if name.startswith("-"):
        candidates.append("/" + name[1:].replace("-", "/"))
        placeholder = "\0"
        candidates.append("/" + name[1:].replace("--", placeholder).replace("-", "/").replace(placeholder, "-"))
    return candidates

claude_dir_raw = tool_mappings.get("claude_projects_dir")
if claude_dir_raw:
    claude_dir = expand(claude_dir_raw)
    if claude_dir.exists():
        for project_dir in claude_dir.iterdir():
            if not project_dir.is_dir():
                continue
            resolved = None
            for candidate in decode_claude_project(project_dir.name):
                candidate_path = Path(candidate).expanduser()
                if candidate_path.exists() and not should_skip_root(candidate_path):
                    resolved = candidate_path.resolve()
                    break
            if resolved is None:
                tool_only_logs.append(f"tool_mapping_only source=claude_project path={project_dir} reason=unresolved_project_dir")
                continue
            if git_toplevel(resolved) is None and is_broad_non_git_path(resolved):
                tool_only_logs.append(f"tool_mapping_only source=claude_project path={project_dir} reason=broad_non_git_path resolved={resolved}")
                continue
            tool_mapping_count += 1
            add_workspace(resolved, f"claude_project:{project_dir.name}", "tool_mapping_only")

weclaw_dir_raw = tool_mappings.get("weclaw_workspace_dir")
if weclaw_dir_raw:
    weclaw_dir = expand(weclaw_dir_raw)
    if weclaw_dir.exists():
        tool_only_logs.append(f"tool_mapping_only source=weclaw_workspace path={weclaw_dir} reason=no_real_workspace_mapping")

print(f"SUMMARY\t{len(workspaces)}\t{tool_mapping_count}")
for workspace in sorted(workspaces.values(), key=lambda item: item["path"]):
    print(
        "WORKSPACE\t{path}\t{category}\t{sources}".format(
            path=workspace["path"],
            category=workspace["category"],
            sources=",".join(workspace["sources"]),
        )
    )
for line in tool_only_logs:
    print(f"TOOL_ONLY\t{line}")
PY
}

main() {
  local trigger dep_updates auto_commits cloud_syncs cloud_pushes workspace_total tool_mappings
  local result_text commit_made discovery_file line path category sources source_display
  local tool_only_count obsidian_raw obsidian_line

  trap cleanup EXIT

  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "scheduler skipped: lock_active path=$LOCK_DIR"
    return 0
  fi

  trigger="$(detect_trigger)"
  dep_updates=0
  auto_commits=0
  cloud_syncs=0
  cloud_pushes=0
  workspace_total=0
  tool_mappings=0
  tool_only_count=0

  log "scheduler tick version=$RUNTIME_VERSION trigger=$trigger repo_root=$REPO_ROOT bootstrap=$BOOTSTRAP workspace_config=$WORKSPACE_CONFIG"

  discovery_file="$(mktemp "$LOG_DIR/workspaces.XXXXXX")"
  CURRENT_DISCOVERY_FILE="$discovery_file"
  if ! discover_workspaces >"$discovery_file"; then
    log "workspace discovery failed"
    result_text="⚠️  工作区发现失败，请查看 scheduler.task.log"
    send_summary "$(build_summary_message "$workspace_total" "$dep_updates" "$auto_commits" "$cloud_syncs" "$cloud_pushes" "$result_text")"
    CURRENT_DISCOVERY_FILE=""
    write_state "$trigger"
    return 0
  fi

  while IFS=$'\t' read -r line path category sources; do
    case "$line" in
      SUMMARY)
        workspace_total="${path:-0}"
        tool_mappings="${category:-0}"
        ;;
      WORKSPACE)
        source_display="${sources:-scan}"
        log "workspace category=$category path=$path sources=$source_display"

        if [[ "$category" != "git_repo" ]]; then
          log "workspace path=$path skipped=non_git_workspace"
          continue
        fi

        if has_origin_remote "$path"; then
          cloud_syncs=$((cloud_syncs + 1))
          if [[ "$DRY_RUN" == "1" ]]; then
            log "workspace=$path cloud_sync skipped=dry_run"
          else
            log "workspace=$path cloud_sync action=pull"
            if ! git -C "$path" pull --ff-only >>"$LOG_FILE" 2>&1; then
              log "workspace=$path cloud_sync_failed action=pull"
            fi
          fi
        else
          log "workspace=$path cloud_sync skipped=no_origin_remote"
        fi

        if run_dependency_updates "$path"; then
          dep_updates=$((dep_updates + 1))
          log "workspace=$path dependency_update_result=changed"
        else
          log "workspace=$path dependency_update_result=unchanged"
        fi

        commit_made=0
        if [[ "$DRY_RUN" == "1" ]]; then
          log "workspace=$path auto_commit skipped=dry_run"
        elif repo_has_tracked_changes "$path"; then
          log "workspace=$path auto_commit action=git_add_u"
          git -C "$path" add -u >>"$LOG_FILE" 2>&1 || true
          if ! git -C "$path" diff --cached --quiet --ignore-submodules --; then
            if git -C "$path" commit -m "$AUTO_COMMIT_MESSAGE" >>"$LOG_FILE" 2>&1; then
              auto_commits=$((auto_commits + 1))
              commit_made=1
              log "workspace=$path auto_commit_result=committed"
            else
              log "workspace=$path auto_commit_result=failed"
            fi
          else
            log "workspace=$path auto_commit skipped=no_staged_tracked_changes"
          fi
        else
          log "workspace=$path auto_commit skipped=clean_or_untracked_only"
        fi

        if [[ "$commit_made" -eq 1 ]]; then
          if has_origin_remote "$path"; then
            if [[ "$DRY_RUN" == "1" ]]; then
              log "workspace=$path cloud_push skipped=dry_run"
            else
              if git -C "$path" push >>"$LOG_FILE" 2>&1; then
                cloud_pushes=$((cloud_pushes + 1))
                log "workspace=$path cloud_push_result=pushed"
              else
                log "workspace=$path cloud_push_result=failed"
              fi
            fi
          else
            log "workspace=$path cloud_push skipped=no_origin_remote"
          fi
        fi
        ;;
      TOOL_ONLY)
        tool_only_count=$((tool_only_count + 1))
        log "$path"
        ;;
    esac
  done <"$discovery_file"

  result_text="👌 工作区巡检完成"

  if [[ -x "$WECLAW_BIN" ]]; then
    obsidian_raw="$("$WECLAW_BIN" obsidian maintain --formal 2>>"$LOG_FILE" || true)"
    obsidian_raw="$(printf '%s' "$obsidian_raw" | tail -n 1)"
    if [[ -n "$obsidian_raw" ]]; then
      log "obsidian maintain: $obsidian_raw"
      obsidian_line="$(build_obsidian_summary "$obsidian_raw")"
      if [[ -n "$obsidian_line" ]]; then
        result_text="$result_text"$'\n'"$obsidian_line"
      fi
    fi
  fi

  if [[ "$tool_only_count" -ge 5 ]]; then
    result_text="$result_text"$'\n'"⚠️ 部分工具目录未映射到真实工作区，请看日志"
  fi

  log "summary counters workspaces=$workspace_total dependency_updates=$dep_updates auto_commits=$auto_commits cloud_syncs=$cloud_syncs cloud_pushes=$cloud_pushes tool_mapping_only=$tool_only_count"
  send_summary "$(build_summary_message "$workspace_total" "$dep_updates" "$auto_commits" "$cloud_syncs" "$cloud_pushes" "$result_text")"
  CURRENT_DISCOVERY_FILE=""
  write_state "$trigger"
}

main "$@"
