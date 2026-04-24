#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_ROOT="$(cd "${ROOT_DIR}/.." && pwd)"
SIGNALS_DIR="${LONGCLAW_SIGNALS_DIR:-${WORKSPACE_ROOT}/Signals}"
SCENARIO="${1:-${LONGCLAW_OBSERVATION_SCENARIO:-manual-electron-session}}"
MODULE="${LONGCLAW_OBSERVATION_MODULE:-策略}"
SEVERITY="${LONGCLAW_OBSERVATION_SEVERITY:-medium}"
SIGNALS_WEB_PORT="${LONGCLAW_SIGNALS_WEB_PORT:-8011}"
SIGNALS_WEB2_PORT="${LONGCLAW_SIGNALS_WEB2_PORT:-6008}"
SIGNALS_WEB_BASE_URL="${LONGCLAW_SIGNALS_WEB_BASE_URL:-http://127.0.0.1:${SIGNALS_WEB_PORT}}"
SIGNALS_WEB2_BASE_URL="${LONGCLAW_SIGNALS_WEB2_BASE_URL:-http://127.0.0.1:${SIGNALS_WEB2_PORT}}"

cd "${ROOT_DIR}"

listen_pid() {
  local port="$1"
  lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true
}

append_event() {
  local run_dir="$1"
  local level="$2"
  local name="$3"
  local message="$4"
  python3 - "$run_dir" "$level" "$name" "$message" <<'PY'
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

run_dir, level, name, message = sys.argv[1:5]
run_path = Path(run_dir)
payload = {
    "at": datetime.now(timezone.utc).isoformat(),
    "run_id": run_path.name,
    "source": "start_observed_electron.sh",
    "level": level,
    "name": name,
    "message": message,
}
with (run_path / "events.jsonl").open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
PY
}

start_signals_service() {
  local mode="$1"
  local port="$2"
  local stdout_log="$3"
  local pid_file="$4"
  local pid
  pid="$(listen_pid "${port}")"
  if [[ -n "${pid}" ]]; then
    append_event "${RUN_DIR}" "info" "observe.signals.attach" "Attached to existing Signals ${mode} on port ${port}, pid ${pid}."
    echo "[observe] Signals ${mode} already listening on ${port} (pid ${pid})"
    return 0
  fi
  if [[ ! -d "${SIGNALS_DIR}" || ! -f "${SIGNALS_DIR}/run.py" ]]; then
    append_event "${RUN_DIR}" "error" "observe.signals.missing" "Signals ${mode} not started; ${SIGNALS_DIR}/run.py is missing."
    echo "[observe] Signals repo missing at ${SIGNALS_DIR}; Electron will still start." >&2
    return 0
  fi
  local python_runner="${SIGNALS_DIR}/scripts/python.sh"
  local python_cmd=()
  if [[ ! -f "${python_runner}" ]]; then
    python_cmd=(python3)
  else
    python_cmd=(bash "${python_runner}")
  fi
  echo "[observe] Starting Signals ${mode} on ${port}"
  (
    cd "${SIGNALS_DIR}"
    nohup "${python_cmd[@]}" run.py --mode "${mode}" --port "${port}" >"${stdout_log}" 2>&1 &
    echo $! >"${pid_file}"
  )
  sleep 2
  pid="$(listen_pid "${port}")"
  if [[ -n "${pid}" ]]; then
    append_event "${RUN_DIR}" "info" "observe.signals.started" "Started Signals ${mode} on port ${port}, pid ${pid}."
    echo "[observe] Signals ${mode} listening on ${port} (pid ${pid})"
  else
    append_event "${RUN_DIR}" "error" "observe.signals.start_failed" "Signals ${mode} failed to listen on port ${port}; see ${stdout_log}."
    echo "[observe] Signals ${mode} did not bind ${port}; see ${stdout_log}" >&2
  fi
}

RUN_DIR="$(python3 scripts/product_observation.py create \
  --scenario "${SCENARIO}" \
  --module "${MODULE}" \
  --severity "${SEVERITY}" \
  --hypothesis "通过 canonical wrapper 启动 Electron，先收集 UI 事件、API 耗时和进程日志，再判断是否需要改业务逻辑。" \
  --reproduction "运行 npm run electron:observe -- ${SCENARIO}，在 Electron 内完成人工体验动作，然后 finalize 本次 observation。" \
  --minimum-change "本轮只统一 run_id/run_dir，复用已监听的 Signals 端口，并把 Electron 启动环境变量写到同一条 observation。" \
  --verification "wrapper 会打印 run_dir，导出 LONGCLAW_OBSERVATION_* 环境变量，启动 electron/dist/main.cjs，并把 events/api timings 写入同一报告目录。" \
)"
RUN_ID="$(basename "${RUN_DIR}")"

printf '%s\n' "${RUN_DIR}" >/tmp/longclaw-current-observation-dir
printf '%s\n' "${RUN_ID}" >/tmp/longclaw-current-observation-run-id
append_event "${RUN_DIR}" "info" "observe.start" "Starting observed Electron run ${RUN_ID}."

mkdir -p "${RUN_DIR}"
start_signals_service "web" "${SIGNALS_WEB_PORT}" "${RUN_DIR}/signals-web.stdout.log" "${RUN_DIR}/signals-web.pid"
start_signals_service "web2" "${SIGNALS_WEB2_PORT}" "${RUN_DIR}/signals-web2.stdout.log" "${RUN_DIR}/signals-web2.pid"

echo "[observe] Building Electron"
npm run build:electron

export LONGCLAW_OBSERVATION_RUN_ID="${RUN_ID}"
export LONGCLAW_OBSERVATION_SCENARIO="${SCENARIO}"
export LONGCLAW_OBSERVATION_DIR="${RUN_DIR}"
export LONGCLAW_SIGNALS_WEB_PORT="${SIGNALS_WEB_PORT}"
export LONGCLAW_SIGNALS_WEB2_PORT="${SIGNALS_WEB2_PORT}"
export LONGCLAW_SIGNALS_WEB_BASE_URL="${SIGNALS_WEB_BASE_URL}"
export LONGCLAW_SIGNALS_WEB2_BASE_URL="${SIGNALS_WEB2_BASE_URL}"

echo "[observe] run_id=${RUN_ID}"
echo "[observe] run_dir=${RUN_DIR}"
echo "[observe] web=${SIGNALS_WEB_BASE_URL}"
echo "[observe] web2=${SIGNALS_WEB2_BASE_URL}"

if [[ "${LONGCLAW_OBSERVE_NO_LAUNCH:-0}" == "1" ]]; then
  append_event "${RUN_DIR}" "info" "observe.electron.no_launch" "LONGCLAW_OBSERVE_NO_LAUNCH=1; Electron launch skipped after build."
  echo "[observe] LONGCLAW_OBSERVE_NO_LAUNCH=1, skipping Electron launch."
  exit 0
fi

append_event "${RUN_DIR}" "info" "observe.electron.launch" "Launching Electron from electron/dist/main.cjs."
exec npx electron electron/dist/main.cjs
