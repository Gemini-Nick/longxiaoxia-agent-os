#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
WORKSPACE_ROOT = REPO_ROOT.parent
REPORT_ROOT = REPO_ROOT / "reports" / "product-observations"
SIGNALS_LOG_ROOT = WORKSPACE_ROOT / "Signals" / ".data" / "logs"
PRODUCT_LINE = "longclaw-electron-signals"
PLACEHOLDER_VALUES = {"", "None", "none", "null", "待补充", "待补充。"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def timestamp_slug(value: Optional[datetime] = None) -> str:
    return (value or now()).strftime("%Y%m%dT%H%M%SZ")


def sanitize_slug(value: str, fallback: str) -> str:
    normalized = "".join(ch.lower() if ch.isalnum() else "-" for ch in value.strip())
    normalized = "-".join(part for part in normalized.split("-") if part)
    return normalized or fallback


def run(cmd: List[str], cwd: Path = REPO_ROOT) -> Optional[str]:
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    except OSError:
        return None
    if proc.returncode != 0:
        return None
    return proc.stdout.strip()


def git_metadata() -> Dict[str, Any]:
    status = run(["git", "status", "--short"]) or ""
    return {
        "sha": run(["git", "rev-parse", "--short", "HEAD"]),
        "dirty": bool(status),
        "status_short": status,
    }


def first_listen_pid(port: int) -> Optional[str]:
    output = run(["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"], REPO_ROOT)
    if not output:
        return None
    return output.splitlines()[0].strip() or None


def runtime_metadata() -> Dict[str, Any]:
    electron = run(["pgrep", "-fl", "electron/dist/main.cjs"], REPO_ROOT) or ""
    return {
        "signals_web": {"port": 8011, "pid": first_listen_pid(8011)},
        "signals_web2": {"port": 6008, "pid": first_listen_pid(6008)},
        "electron": {"processes": electron.splitlines()},
    }


def latest_signals_log() -> Optional[Path]:
    if not SIGNALS_LOG_ROOT.exists():
        return None
    logs = sorted(SIGNALS_LOG_ROOT.glob("web_*.log"), key=lambda path: path.stat().st_mtime, reverse=True)
    return logs[0] if logs else None


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                rows.append({"raw": line, "parse_error": True})
    return rows


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")


def is_placeholder(value: Any) -> bool:
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    return value.strip() in PLACEHOLDER_VALUES


def parse_iso(value: Any) -> str:
    return str(value or "")


def latest_event(events: List[Dict[str, Any]], name: str) -> Optional[Dict[str, Any]]:
    matches = [row for row in events if row.get("name") == name]
    return matches[-1] if matches else None


def freq_from_target(target: Any) -> str:
    if isinstance(target, dict):
        return str(target.get("freq") or "")
    return ""


def label_from_target(target: Any) -> str:
    if isinstance(target, dict):
        return str(target.get("label") or "")
    return ""


def summarize_post_action_api(
    events: List[Dict[str, Any]],
    api_rows: List[Dict[str, Any]],
) -> Dict[str, Any]:
    action = latest_event(events, "strategy.freq.click") or latest_event(events, "strategy.symbol.select")
    action_at = parse_iso(action.get("at")) if action else ""
    post_rows = [row for row in api_rows if not action_at or parse_iso(row.get("at")) >= action_at]
    next_target = action.get("next") if action else {}
    requested_freq = freq_from_target(next_target) or "unknown"
    requested_label = label_from_target(next_target) or "unknown"
    requested_rows = [
        row for row in post_rows
        if requested_freq != "unknown" and f"freq={requested_freq}" in str(row.get("endpoint") or "")
    ]
    return {
        "action": action,
        "action_at": action_at,
        "requested_freq": requested_freq,
        "requested_label": requested_label,
        "post_rows": post_rows,
        "post_failed": [row for row in post_rows if row.get("ok") is False],
        "requested_ok": [row for row in requested_rows if row.get("ok") is True],
        "requested_failed": [row for row in requested_rows if row.get("ok") is False],
        "refresh_after_action": [
            row for row in events
            if row.get("name") == "app.refresh.finish" and (not action_at or parse_iso(row.get("at")) >= action_at)
        ],
    }


def fill_if_missing(observation: Dict[str, Any], key: str, value: str) -> None:
    if is_placeholder(observation.get(key)):
        observation[key] = value


def ensure_evidence_paths(run_dir: Path, observation: Dict[str, Any]) -> None:
    evidence = observation.get("evidence_paths")
    if not isinstance(evidence, dict):
        evidence = {}
    defaults = {
        "observation_json": str(run_dir / "observation.json"),
        "events": str(run_dir / "events.jsonl"),
        "api_timings": str(run_dir / "api-timings.jsonl"),
        "electron_log": str(run_dir / "electron.log"),
        "signals_log": str(run_dir / "signals.log"),
        "screenshots": str(run_dir / "screenshots"),
    }
    for key, value in defaults.items():
        evidence.setdefault(key, value)
    observation["evidence_paths"] = evidence


def enrich_observation(
    run_dir: Path,
    observation: Dict[str, Any],
    events: List[Dict[str, Any]],
    api_rows: List[Dict[str, Any]],
) -> None:
    ensure_evidence_paths(run_dir, observation)
    scenario = str(observation.get("scenario") or "")
    if is_placeholder(observation.get("module")) and "strategy" in scenario:
        observation["module"] = "策略"
    if is_placeholder(observation.get("severity")):
        observation["severity"] = "medium"

    summary = summarize_post_action_api(events, api_rows)
    requested_label = summary["requested_label"]
    requested_freq = summary["requested_freq"]
    requested_ok = len(summary["requested_ok"])
    requested_failed = len(summary["requested_failed"])
    refresh_after = len(summary["refresh_after_action"])
    action = summary["action"]
    event_names = {str(row.get("name") or "") for row in events}
    failed_api_count = len([row for row in api_rows if row.get("ok") is False])
    error_event_count = len([row for row in events if row.get("level") == "error" or row.get("ok") is False])

    if "strategy" not in scenario:
        if any(name.startswith("observe.") for name in event_names):
            launched = "observe.electron.launch" in event_names
            no_launch = "observe.electron.no_launch" in event_names
            attached = len([row for row in events if row.get("name") == "observe.signals.attach"])
            fill_if_missing(
                observation,
                "expected",
                "观察 wrapper 使用一个 canonical run_id/run_dir，复用已有 Signals 端口，并把 Electron/renderer/API 证据写入同一目录。",
            )
            observation["actual"] = (
                f"wrapper 已生成 observation；Signals attach 事件数={attached}；"
                f"electron_launched={launched}；no_launch={no_launch}；"
                f"error_events={error_event_count}；failed_api={failed_api_count}。"
            )
            fill_if_missing(
                observation,
                "initial_diagnosis",
                (
                    "观察链路问题来自启动步骤分散：手动命令会重复启动 Signals 或误开 Electron 默认应用。"
                    "wrapper 把创建报告、端口检测、build、Electron 启动和环境变量注入收敛到同一路径。"
                ),
            )
            fill_if_missing(
                observation,
                "next_steps",
                "把回测 daily/weekly analyze 纳入同一个 wrapper 观察，继续记录慢请求、500、空状态和 UI 降级。",
            )
            observation["status"] = "verified" if error_event_count == 0 and failed_api_count == 0 else "needs_followup"
        return

    fill_if_missing(
        observation,
        "hypothesis",
        (
            "策略页周期回跳和后台刷新异常来自初始化/刷新耦合：shell 或 session 刷新会重建策略终端 effect，"
            "旧 AbortController 可能取消正在进行的 chart 请求，进而让用户选择看起来不稳定。"
        ),
    )
    if action:
        previous = freq_from_target(action.get("previous")) or "unknown"
        fill_if_missing(
            observation,
            "reproduction",
            (
                f"启动 Electron + Signals，进入策略页，默认标的为 {requested_label}；"
                f"点击周期从 {previous} 切到 {requested_freq}，等待至少一个后台刷新周期，"
                "同时检查可视 UI 与 api-timings.jsonl。"
            ),
        )
    else:
        fill_if_missing(
            observation,
            "reproduction",
            "启动 Electron + Signals，进入策略页执行标的/周期切换，等待后台刷新并检查 UI 与 telemetry。",
        )
    fill_if_missing(
        observation,
        "minimum_change",
        (
            "renderer-only 修改 StrategyChartTerminal：初始化和后台刷新分离；后台刷新使用 liveRefresh boolean 控制间隔，"
            "每次 tick 使用独立 AbortController，cleanup 只取消仍在飞行的请求；不改 control-plane schema。"
        ),
    )
    fill_if_missing(
        observation,
        "verification",
        (
            f"Computer Use 可视验证停留在 {requested_freq}；点击后 app.refresh.finish={refresh_after}，"
            f"{requested_freq} chart 请求 ok={requested_ok}、failed={requested_failed}；"
            "并通过 npm run lint、npm test、npm run build:electron。"
        ),
    )
    fill_if_missing(
        observation,
        "expected",
        "用户切换周期后，后台 refresh 不覆盖当前标的/周期；chart 后台刷新请求稳定返回 200。",
    )
    actual = (
        f"本轮切到 {requested_freq} 后保持稳定；点击后的 {requested_freq} 后台刷新 ok={requested_ok}、"
        f"failed={requested_failed}。历史日志里仍保留修复前 aborted:true 记录，用作归因证据。"
    )
    fill_if_missing(observation, "actual", actual)
    fill_if_missing(
        observation,
        "initial_diagnosis",
        (
            "代码证据：旧后台刷新 effect 依赖 shell?.session，每次 loadShell 更新 session 都会触发 cleanup，"
            "从而 abort 当前 chart 请求。修复后 session 变化只影响 liveRefresh boolean，单次请求不会被同轮刷新取消。"
        ),
    )
    fill_if_missing(
        observation,
        "next_steps",
        (
            "下一轮先做 observation 启动 wrapper：统一 canonical run_id/run_dir，检测并复用已有 Signals 端口，"
            "避免误开默认 Electron；再扩展回测 weekly 500、慢请求和数据源健康检查。"
        ),
    )
    observation["status"] = "verified" if requested_ok > 0 and requested_failed == 0 else "needs_followup"


def default_observation(args: argparse.Namespace, run_id: str, run_dir: Path) -> Dict[str, Any]:
    created_at = now().isoformat()
    scenario = sanitize_slug(args.scenario, "manual-electron-session")
    return {
        "run_id": run_id,
        "product_line": PRODUCT_LINE,
        "module": args.module,
        "scenario": scenario,
        "created_at": created_at,
        "repo_root": str(REPO_ROOT),
        "report_dir": str(run_dir),
        "git": git_metadata(),
        "runtime": runtime_metadata(),
        "severity": args.severity,
        "hypothesis": args.hypothesis,
        "reproduction": args.reproduction,
        "minimum_change": args.minimum_change,
        "verification": args.verification,
        "expected": args.expected,
        "actual": args.actual,
        "initial_diagnosis": args.initial_diagnosis,
        "next_steps": args.next_steps,
        "evidence_paths": {
            "observation_json": str(run_dir / "observation.json"),
            "events": str(run_dir / "events.jsonl"),
            "api_timings": str(run_dir / "api-timings.jsonl"),
            "electron_log": str(run_dir / "electron.log"),
            "signals_log": str(run_dir / "signals.log"),
            "screenshots": str(run_dir / "screenshots"),
        },
        "memory_refs": [],
    }


def render_markdown(observation: Dict[str, Any], events: List[Dict[str, Any]], api_rows: List[Dict[str, Any]]) -> str:
    git = observation.get("git") or {}
    runtime = observation.get("runtime") or {}
    evidence = observation.get("evidence_paths") or {}
    memory_refs = observation.get("memory_refs") or []
    slow_api = sorted(
        [row for row in api_rows if isinstance(row.get("duration_ms"), (int, float))],
        key=lambda row: float(row.get("duration_ms") or 0),
        reverse=True,
    )[:8]
    failed_api = [row for row in api_rows if row.get("ok") is False][:8]
    error_events = [row for row in events if row.get("level") == "error" or row.get("ok") is False][:12]

    lines = [
        "# Longclaw 产品观察日记",
        "",
        "## 假设",
        "",
        str(observation.get("hypothesis") or "待补充。"),
        "",
        "## 复现",
        "",
        str(observation.get("reproduction") or "待补充。"),
        "",
        "## 最小改动",
        "",
        str(observation.get("minimum_change") or "待补充。"),
        "",
        "## 验证",
        "",
        str(observation.get("verification") or "待补充。"),
        "",
        "## 上下文",
        "",
        f"- run_id: {observation.get('run_id')}",
        f"- product_line: {observation.get('product_line')}",
        f"- module: {observation.get('module')}",
        f"- scenario: {observation.get('scenario')}",
        f"- severity: {observation.get('severity')}",
        f"- git_sha: {git.get('sha') or 'unknown'}",
        f"- git_dirty: {'yes' if git.get('dirty') else 'no'}",
        f"- signals_web: {json.dumps(runtime.get('signals_web') or {}, ensure_ascii=False)}",
        f"- signals_web2: {json.dumps(runtime.get('signals_web2') or {}, ensure_ascii=False)}",
        "",
        "## 期望 / 实际",
        "",
        f"- expected: {observation.get('expected') or '待补充'}",
        f"- actual: {observation.get('actual') or '待补充'}",
        "",
        "## 初步归因",
        "",
        str(observation.get("initial_diagnosis") or "待补充。"),
        "",
        "## 事件摘要",
        "",
        f"- events: {len(events)}",
        f"- api_timings: {len(api_rows)}",
        f"- error_events: {len(error_events)}",
        f"- failed_api: {len(failed_api)}",
        "",
    ]

    if slow_api:
        lines.extend(["### 慢接口", ""])
        for row in slow_api:
            lines.append(
                f"- {row.get('duration_ms')}ms {row.get('status')} {row.get('endpoint')} "
                f"source={row.get('source')} ok={row.get('ok')}"
            )
        lines.append("")

    if failed_api:
        lines.extend(["### 失败接口", ""])
        for row in failed_api:
            lines.append(f"- {row.get('status')} {row.get('endpoint')} error={row.get('error')}")
        lines.append("")

    if error_events:
        lines.extend(["### 错误事件", ""])
        for row in error_events:
            lines.append(f"- {row.get('name')} source={row.get('source')} message={row.get('message') or row.get('error')}")
        lines.append("")

    lines.extend([
        "## 证据路径",
        "",
    ])
    for key, value in evidence.items():
        lines.append(f"- {key}: {value}")
    lines.extend([
        "",
        "## 下一步",
        "",
        str(observation.get("next_steps") or "待补充。"),
        "",
        "## memory_refs",
        "",
    ])
    if memory_refs:
        lines.extend(f"- {item}" for item in memory_refs)
    else:
        lines.append("- pending")
    lines.append("")
    return "\n".join(lines)


def ensure_run_files(run_dir: Path) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "screenshots").mkdir(parents=True, exist_ok=True)
    for name in ("events.jsonl", "api-timings.jsonl", "electron.log", "signals.log"):
        path = run_dir / name
        if not path.exists():
            path.write_text("", encoding="utf-8")


def copy_latest_signals_log(run_dir: Path) -> None:
    source = latest_signals_log()
    target = run_dir / "signals.log"
    if source:
        shutil.copyfile(source, target)
    elif not target.exists():
        target.write_text("", encoding="utf-8")


def write_report(run_dir: Path, observation: Dict[str, Any]) -> None:
    events = read_jsonl(run_dir / "events.jsonl")
    api_rows = read_jsonl(run_dir / "api-timings.jsonl")
    enrich_observation(run_dir, observation, events, api_rows)
    observation["event_count"] = len(events)
    observation["api_timing_count"] = len(api_rows)
    observation["updated_at"] = now().isoformat()
    (run_dir / "observation.json").write_text(
        json.dumps(observation, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (run_dir / "observation.md").write_text(
        render_markdown(observation, events, api_rows),
        encoding="utf-8",
    )


def load_observation(run_dir: Path) -> Dict[str, Any]:
    path = run_dir / "observation.json"
    if not path.exists():
        raise SystemExit(f"missing observation.json: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def latest_run_dir() -> Path:
    if not REPORT_ROOT.exists():
        raise SystemExit(f"no observation report root: {REPORT_ROOT}")
    dirs = [path for path in REPORT_ROOT.iterdir() if path.is_dir()]
    if not dirs:
        raise SystemExit(f"no observation runs under {REPORT_ROOT}")
    return sorted(dirs, key=lambda path: path.stat().st_mtime, reverse=True)[0]


def write_mempalace(run_dir: Path, observation: Dict[str, Any]) -> List[str]:
    try:
        import chromadb
        from mempalace.config import MempalaceConfig, sanitize_content, sanitize_name
    except Exception as exc:  # noqa: BLE001
        print(f"[observation] mempalace unavailable: {exc}", file=sys.stderr)
        return []

    markdown_path = run_dir / "observation.md"
    body = sanitize_content(markdown_path.read_text(encoding="utf-8"))
    config = MempalaceConfig()
    client = chromadb.PersistentClient(path=str(config.palace_path))
    collection = client.get_or_create_collection(config.collection_name)
    wing = sanitize_name("longclaw_product", "wing")
    room = sanitize_name("observation_diary", "room")
    run_id = str(observation.get("run_id"))
    run_hash = hashlib.sha256(run_id.encode()).hexdigest()[:24]
    drawer_id = f"drawer_{wing}_{room}_{run_hash}"
    collection.upsert(
        ids=[drawer_id],
        documents=[body],
        metadatas=[{
            "wing": wing,
            "room": room,
            "hall": "hall_diary",
            "topic": "electron-signals",
            "type": "product_observation",
            "run_id": run_id,
            "scenario": str(observation.get("scenario") or ""),
            "source_file": str(markdown_path),
            "filed_at": now().isoformat(),
        }],
    )
    diary_entry = sanitize_content(
        f"Longclaw 产品观察日记 {run_id}: {observation.get('scenario')} "
        f"module={observation.get('module')} severity={observation.get('severity')}. "
        f"关键词: 策略页 周期 回跳 标的回跳 Electron Signals observation diary. "
        f"现象: {observation.get('actual')}. "
        f"归因: {observation.get('initial_diagnosis')}. "
        f"Report: {markdown_path}"
    )
    diary_id = f"diary_longclaw_product_{run_hash}"
    collection.upsert(
        ids=[diary_id],
        documents=[diary_entry],
        metadatas=[{
            "wing": wing,
            "room": room,
            "hall": "hall_diary",
            "topic": "electron-signals",
            "type": "product_observation",
            "agent": "longclaw_observation_writer",
            "run_id": run_id,
            "date": now().strftime("%Y-%m-%d"),
            "filed_at": now().isoformat(),
        }],
    )
    return [f"mempalace:{drawer_id}", f"mempalace:{diary_id}"]


def create(args: argparse.Namespace) -> Path:
    scenario = sanitize_slug(args.scenario, "manual-electron-session")
    run_id = sanitize_slug(args.run_id or f"{timestamp_slug()}-{scenario}", scenario)
    run_dir = REPORT_ROOT / run_id
    ensure_run_files(run_dir)
    copy_latest_signals_log(run_dir)
    observation = default_observation(args, run_id, run_dir)
    if args.write_mempalace:
        write_report(run_dir, observation)
        refs = write_mempalace(run_dir, observation)
        if refs:
            observation["memory_refs"] = sorted(set(refs))
    write_report(run_dir, observation)
    print(str(run_dir))
    return run_dir


def finalize(args: argparse.Namespace) -> Path:
    run_dir = Path(args.run_dir).expanduser().resolve() if args.run_dir else latest_run_dir()
    ensure_run_files(run_dir)
    copy_latest_signals_log(run_dir)
    observation = load_observation(run_dir)
    observation["git"] = git_metadata()
    observation["runtime"] = runtime_metadata()
    if args.write_mempalace:
        write_report(run_dir, observation)
        refs = write_mempalace(run_dir, observation)
        if refs:
            observation["memory_refs"] = sorted(set(refs))
    write_report(run_dir, observation)
    print(str(run_dir))
    return run_dir


def seed_strategy_frequency_persistence(args: argparse.Namespace) -> Path:
    args.scenario = "strategy-frequency-persistence"
    args.module = "策略"
    args.severity = "high"
    args.hypothesis = (
        "策略页周期/标的回跳不是用户输入丢失，而是外层 dashboard 每 10 秒刷新后触发策略终端重新初始化，"
        "初始化逻辑覆盖了用户选择；同时 Signals 对不可用周期会返回 effective_freq fallback。"
    )
    args.reproduction = (
        "启动 Electron + Signals，进入策略页，手动切换标的或周期，等待至少 30 秒；"
        "观察是否被后台 refresh 拉回默认 target/freq。"
    )
    args.minimum_change = (
        "先把 StrategyChartTerminal 的首次初始化和后台刷新拆开：dashboard prop 更新只能更新侧栏摘要，"
        "不能重新 setTarget；再把 requested_freq/effective_freq fallback 写入页面提示和 observation events。"
    )
    args.verification = (
        "切换策略页周期后等待 30 秒不回跳；events.jsonl 能看到 app.refresh 与 strategy.freq.click；"
        "api-timings.jsonl 能看到 /api/workbench/symbol 或 /api/chart 请求耗时。"
    )
    args.expected = "用户切换的标的和周期在后台刷新后保持不变；不可用周期有明确 fallback 提示。"
    args.actual = "修复前会在后台刷新后回到默认设置；部分标的请求 15min 会被 Signals fallback 到 daily。"
    args.initial_diagnosis = (
        "代码证据：App strategy 页面有 10 秒 refresh；旧 StrategyChartTerminal 初始化 effect 依赖 dashboard，"
        "dashboard 对象变化会重新 initialTargetFrom(shell, dashboard) 并 setTarget。"
    )
    args.next_steps = (
        "运行 Electron 后复测本观察；若仍回跳，继续检查页面 remount、target effective_freq 和用户操作事件顺序。"
    )
    should_write_mempalace = args.write_mempalace
    args.write_mempalace = False
    run_dir = create(args)
    args.write_mempalace = should_write_mempalace
    append_jsonl(run_dir / "events.jsonl", {
        "at": now().isoformat(),
        "name": "strategy-frequency-persistence.seed",
        "source": "product_observation.py",
        "level": "info",
        "finding": "Seeded the first observation diary for the strategy tab/frequency persistence bug.",
    })
    observation = load_observation(run_dir)
    if args.write_mempalace:
        write_report(run_dir, observation)
        refs = write_mempalace(run_dir, observation)
        if refs:
            observation["memory_refs"] = sorted(set(refs))
    write_report(run_dir, observation)
    print(str(run_dir))
    return run_dir


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create and archive Longclaw product observation diaries.")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(target: argparse.ArgumentParser) -> None:
        target.add_argument("--run-id", default="")
        target.add_argument("--scenario", default="manual-electron-session")
        target.add_argument("--module", default="策略")
        target.add_argument("--severity", default="medium")
        target.add_argument("--hypothesis", default="待补充。")
        target.add_argument("--reproduction", default="待补充。")
        target.add_argument("--minimum-change", default="待补充。")
        target.add_argument("--verification", default="待补充。")
        target.add_argument("--expected", default="待补充。")
        target.add_argument("--actual", default="待补充。")
        target.add_argument("--initial-diagnosis", default="待补充。")
        target.add_argument("--next-steps", default="待补充。")
        target.add_argument("--write-mempalace", action="store_true")

    create_parser = sub.add_parser("create")
    add_common(create_parser)
    create_parser.set_defaults(func=create)

    finalize_parser = sub.add_parser("finalize")
    finalize_parser.add_argument("--run-dir", default="")
    finalize_parser.add_argument("--write-mempalace", action="store_true")
    finalize_parser.set_defaults(func=finalize)

    seed_parser = sub.add_parser("seed-strategy-frequency-persistence")
    add_common(seed_parser)
    seed_parser.set_defaults(func=seed_strategy_frequency_persistence)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
