#!/usr/bin/env bash
set -euo pipefail

MODE="user-only"
if [[ "${1:-}" == "--mixed" ]]; then
  MODE="mixed"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

ensure_dirs

log "installing runtime marker workspace-v2-2026-04-06"

log "remove legacy watchdog residue"
rm -f \
  "$WECLAW_HOME/session-watchdog.sh" \
  "$WECLAW_HOME/watchdog.log" \
  "$WECLAW_HOME/watchdog.launchd.out.log" \
  "$WECLAW_HOME/watchdog.launchd.err.log" \
  "$WECLAW_HOME/weclaw.pid"

log "sync runtime scripts"
cp "$RUNTIME_SRC_DIR/bin/weclaw" "$RUNTIME_INSTALL_DIR/bin/weclaw"
cp "$RUNTIME_SRC_DIR/bin/weguard" "$RUNTIME_INSTALL_DIR/bin/weguard"
cp "$RUNTIME_SRC_DIR/bin/codex-appserver.sh" "$RUNTIME_INSTALL_DIR/bin/codex-appserver.sh"
cp "$RUNTIME_SRC_DIR/bin/claude-worker.sh" "$RUNTIME_INSTALL_DIR/bin/claude-worker.sh"
cp "$RUNTIME_SRC_DIR/bin/weclaw-bridge.sh" "$RUNTIME_INSTALL_DIR/bin/weclaw-bridge.sh"
cp "$RUNTIME_SRC_DIR/bin/repo-scheduler-service.sh" "$RUNTIME_INSTALL_DIR/bin/repo-scheduler-service.sh"
cp "$RUNTIME_SRC_DIR/bin/guardian-monitor.sh" "$RUNTIME_INSTALL_DIR/bin/guardian-monitor.sh"
cp "$RUNTIME_SRC_DIR/config/workspace-watchdog.json" "$RUNTIME_INSTALL_DIR/config/workspace-watchdog.json"
chmod +x "$RUNTIME_INSTALL_DIR/bin/"*

log "install weclaw core binary"
if [[ -x "$WECLAW_REAL_BUNDLE" ]]; then
  cp "$WECLAW_REAL_BUNDLE" "$WECLAW_BIN_DIR/weclaw-real"
  chmod +x "$WECLAW_BIN_DIR/weclaw-real"
  ad_hoc_sign_binary "$WECLAW_BIN_DIR/weclaw-real"
elif build_weclaw_real_from_repo "$WECLAW_REPO_DIR" /tmp/weclaw-real.from-repo; then
  log "built weclaw-real from repo $WECLAW_REPO_DIR"
  cp /tmp/weclaw-real.from-repo "$WECLAW_BIN_DIR/weclaw-real"
  chmod +x "$WECLAW_BIN_DIR/weclaw-real"
  ad_hoc_sign_binary "$WECLAW_BIN_DIR/weclaw-real"
elif [[ -x "$WECLAW_BIN_DIR/weclaw-real" ]]; then
  log "reuse existing weclaw-real at $WECLAW_BIN_DIR/weclaw-real"
elif [[ -x "$WECLAW_BIN_DIR/weclaw" ]]; then
  mv "$WECLAW_BIN_DIR/weclaw" "$WECLAW_BIN_DIR/weclaw-real"
  chmod +x "$WECLAW_BIN_DIR/weclaw-real"
  ad_hoc_sign_binary "$WECLAW_BIN_DIR/weclaw-real"
else
  err "weclaw core binary missing. Expected bundle at $WECLAW_REAL_BUNDLE, repo at $WECLAW_REPO_DIR, existing $WECLAW_BIN_DIR/weclaw-real, or fallback $WECLAW_BIN_DIR/weclaw"
fi

HAS_GUARDIAN_BIN=0
GUARDIAN_BIN_SRC=""
for candidate in \
  "$ROOT_DIR/apps/runtime/guardian/weclaw-guardian" \
  "$RUNTIME_SRC_DIR/bin/weclaw-guardian"
do
  if [[ -x "$candidate" ]]; then
    GUARDIAN_BIN_SRC="$candidate"
    break
  fi
done

if [[ -n "$GUARDIAN_BIN_SRC" ]]; then
  HAS_GUARDIAN_BIN=1
  cp "$GUARDIAN_BIN_SRC" "$RUNTIME_INSTALL_DIR/bin/weclaw-guardian"
  chmod +x "$RUNTIME_INSTALL_DIR/bin/weclaw-guardian"
  ad_hoc_sign_binary "$RUNTIME_INSTALL_DIR/bin/weclaw-guardian"
  cp "$GUARDIAN_BIN_SRC" "$WECLAW_BIN_DIR/weclaw-guardian"
  chmod +x "$WECLAW_BIN_DIR/weclaw-guardian"
  ad_hoc_sign_binary "$WECLAW_BIN_DIR/weclaw-guardian"
else
  warn "weclaw-guardian binary not found. Run scripts/guardian/build-core.sh after installing Go."
fi

log "install weclaw wrapper"
cp "$RUNTIME_SRC_DIR/bin/weclaw" "$WECLAW_BIN_DIR/weclaw"
chmod +x "$WECLAW_BIN_DIR/weclaw"

log "install weguard command entry"
cp "$RUNTIME_SRC_DIR/bin/weguard" "$WECLAW_BIN_DIR/weguard"
chmod +x "$WECLAW_BIN_DIR/weguard"

log "install guardian config"
if [[ ! -f "$WECLAW_CONFIG_PATH" ]]; then
  cp "$RUNTIME_SRC_DIR/guardian/config/services.json" "$WECLAW_CONFIG_PATH"
fi

WECLAW_APP_CONFIG_PATH="$WECLAW_HOME/config.json"

log "inject weclaw runtime policy"
node - "$WECLAW_APP_CONFIG_PATH" "$HOME" <<'NODE'
const fs = require('fs');
const path = require('path');
const os = require('os');

const [cfgPath, homeDir] = process.argv.slice(2);

const expandHome = input => {
  if (!input) return input;
  if (input === '~') return homeDir;
  if (input.startsWith('~/')) return path.join(homeDir, input.slice(2));
  return input;
};

const readCurrentVault = () => {
  const statePath = path.join(homeDir, 'Library', 'Application Support', 'obsidian', 'obsidian.json');
  try {
    const raw = fs.readFileSync(statePath, 'utf8');
    const state = JSON.parse(raw);
    const vaults = state && state.vaults ? Object.values(state.vaults) : [];
    const opened = vaults.find(v => v && v.open && v.path);
    if (opened) {
      return {
        dir: opened.path,
        name: path.basename(opened.path),
      };
    }
  } catch (_) {}
  return {
    dir: path.join(homeDir, 'Documents', 'LongclawVault'),
    name: 'LongclawVault',
  };
};

let cfg = {};
if (fs.existsSync(cfgPath)) {
  const text = fs.readFileSync(cfgPath, 'utf8').trim();
  if (text) cfg = JSON.parse(text);
}
if (!cfg.agents || typeof cfg.agents !== 'object') cfg.agents = {};

const currentVault = readCurrentVault();
cfg.save_dir = cfg.save_dir || path.join(homeDir, '.weclaw', 'workspace');
cfg.persona_dir = cfg.persona_dir || path.join(homeDir, '.weclaw', 'personas');
cfg.voice_input_mode_default = cfg.voice_input_mode_default || 'transcript_first';
if (cfg.archive_tool_enabled === undefined) cfg.archive_tool_enabled = true;
if (cfg.obsidian_enabled === undefined) cfg.obsidian_enabled = true;
if (cfg.obsidian_formal_write_enabled === undefined) cfg.obsidian_formal_write_enabled = true;
cfg.obsidian_vault_dir = cfg.obsidian_vault_dir || currentVault.dir;
cfg.obsidian_vault_name = cfg.obsidian_vault_name || currentVault.name;
cfg.obsidian_notes_dir = cfg.obsidian_notes_dir || 'Inbox/WeChat';
cfg.obsidian_assets_dir = cfg.obsidian_assets_dir || 'Assets/WeChat';
if (cfg.obsidian_auto_archive_enabled === undefined) cfg.obsidian_auto_archive_enabled = true;
cfg.obsidian_auto_archive_mode = cfg.obsidian_auto_archive_mode || 'hybrid';
if (cfg.obsidian_archive_window_minutes === undefined) cfg.obsidian_archive_window_minutes = 30;
if (cfg.obsidian_archive_reply_enabled === undefined) cfg.obsidian_archive_reply_enabled = true;
cfg.obsidian_voice_archive_mode = cfg.obsidian_voice_archive_mode || 'audio+transcript';
cfg.obsidian_video_archive_mode = cfg.obsidian_video_archive_mode || 'asset+summary';
cfg.agent_input_policy = cfg.agent_input_policy || 'canonical';

fs.mkdirSync(path.dirname(cfgPath), { recursive: true });
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
NODE

node - "$WECLAW_CONFIG_PATH" "$MODE" "$(id -u)" <<'NODE'
const fs = require('fs');

const [cfgPath, mode, uidRaw] = process.argv.slice(2);
const uid = Number(uidRaw);

let cfg = { poll_interval_seconds: 30, log_file: '/tmp/longclaw-guardian/guardian-core.log', services: [] };
if (fs.existsSync(cfgPath)) {
  const text = fs.readFileSync(cfgPath, 'utf8').trim();
  if (text) cfg = JSON.parse(text);
}
if (!Array.isArray(cfg.services)) cfg.services = [];
if (!cfg.poll_interval_seconds) cfg.poll_interval_seconds = 30;
if (!cfg.log_file) cfg.log_file = '/tmp/longclaw-guardian/guardian-core.log';
if (!cfg.failover_state_file) cfg.failover_state_file = '~/.weclaw/runtime/active-agent.json';
if (!cfg.weclaw_config_path) cfg.weclaw_config_path = '~/.weclaw/config.json';
if (!cfg.failback_success_threshold) cfg.failback_success_threshold = 3;

const upsert = (name, defaults) => {
  const idx = cfg.services.findIndex(s => s && (s.name === name || s.label === defaults.label));
  const cur = idx >= 0 ? cfg.services[idx] : {};
  const merged = { ...cur, ...defaults, name, label: defaults.label };
  if (idx >= 0) cfg.services[idx] = merged;
  else cfg.services.push(merged);
};

upsert('codex', {
  label: 'com.zhangqilong.ai.codex.appserver',
  domain: mode === 'user-only' ? 'gui' : 'system',
  uid,
  service_type: 'service',
  restart_base_seconds: 30,
  max_backoff_seconds: 600,
});
upsert('claude', {
  label: 'com.zhangqilong.ai.claude.worker',
  domain: 'gui',
  uid,
  service_type: 'service',
  restart_base_seconds: 30,
  max_backoff_seconds: 600,
});
upsert('weclaw', {
  label: 'com.zhangqilong.ai.weclaw.bridge',
  domain: 'gui',
  uid,
  service_type: 'service',
  restart_base_seconds: 30,
  max_backoff_seconds: 600,
});
upsert('repo-scheduler', {
  label: 'com.zhangqilong.ai.repo.scheduler',
  domain: 'gui',
  uid,
  service_type: 'scheduled',
  restart_base_seconds: 60,
  max_backoff_seconds: 600,
});

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
NODE

log "render launchd plists"
render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.claude.worker.agent.plist.tmpl" \
  "$LAUNCH_AGENTS_DIR/com.zhangqilong.ai.claude.worker.plist"
render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.weclaw.bridge.agent.plist.tmpl" \
  "$LAUNCH_AGENTS_DIR/com.zhangqilong.ai.weclaw.bridge.plist"
render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.repo.scheduler.agent.plist.tmpl" \
  "$LAUNCH_AGENTS_DIR/com.zhangqilong.ai.repo.scheduler.plist"

if [[ "$MODE" == "user-only" ]]; then
  render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.codex.appserver.agent.plist.tmpl" \
    "$LAUNCH_AGENTS_DIR/com.zhangqilong.ai.codex.appserver.plist"
  if (( HAS_GUARDIAN_BIN == 1 )); then
    render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.guardian.monitor.agent.plist.tmpl" \
      "$LAUNCH_AGENTS_DIR/com.zhangqilong.ai.guardian.monitor.plist"
  fi
else
  warn "mixed mode selected. Daemon plists rendered to $RUNTIME_INSTALL_DIR/launchd; install with sudo manually."
  render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.codex.appserver.daemon.plist.tmpl" \
    "$RUNTIME_INSTALL_DIR/launchd/com.zhangqilong.ai.codex.appserver.plist"
  if (( HAS_GUARDIAN_BIN == 1 )); then
    render_template "$RUNTIME_SRC_DIR/launchd/com.zhangqilong.ai.guardian.monitor.daemon.plist.tmpl" \
      "$RUNTIME_INSTALL_DIR/launchd/com.zhangqilong.ai.guardian.monitor.plist"
  fi
fi

log "reload new launch agents"
if lsof -nP -iTCP:18011 -sTCP:LISTEN 2>/dev/null | rg -q 'weclaw'; then
  old_pid="$(lsof -tiTCP:18011 -sTCP:LISTEN 2>/dev/null | head -n 1 || true)"
  if [[ -n "${old_pid:-}" ]]; then
    log "stop pre-existing weclaw listener on port 18011 (pid=$old_pid)"
    kill "$old_pid" >/dev/null 2>&1 || true
    sleep 1
  fi
fi

for label in \
  com.zhangqilong.ai.claude.worker \
  com.zhangqilong.ai.weclaw.bridge \
  com.zhangqilong.ai.repo.scheduler \
  com.zhangqilong.ai.codex.appserver
  do
    plist="$LAUNCH_AGENTS_DIR/$label.plist"
    if [[ -f "$plist" ]]; then
      bootout_gui_label "$label"
      bootstrap_gui_plist "$plist"
    fi
  done

if (( HAS_GUARDIAN_BIN == 1 )); then
  label="com.zhangqilong.ai.guardian.monitor"
  plist="$LAUNCH_AGENTS_DIR/$label.plist"
  if [[ -f "$plist" ]]; then
    bootout_gui_label "$label"
    bootstrap_gui_plist "$plist"
  fi
else
  warn "guardian monitor launchd job skipped because weclaw-guardian binary is not built yet."
fi

log "install complete"
if [[ "$MODE" == "mixed" ]]; then
  cat <<MSG
Manual daemon installation (requires sudo):
  sudo cp "$RUNTIME_INSTALL_DIR/launchd/com.zhangqilong.ai.codex.appserver.plist" /Library/LaunchDaemons/
  sudo cp "$RUNTIME_INSTALL_DIR/launchd/com.zhangqilong.ai.guardian.monitor.plist" /Library/LaunchDaemons/
  sudo launchctl bootstrap system /Library/LaunchDaemons/com.zhangqilong.ai.codex.appserver.plist
  sudo launchctl bootstrap system /Library/LaunchDaemons/com.zhangqilong.ai.guardian.monitor.plist
MSG
fi
