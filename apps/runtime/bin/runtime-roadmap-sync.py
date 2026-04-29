#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path


def expand(path: str) -> Path:
    return Path(os.path.expanduser(path)).resolve()


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp_path.replace(path)


def extract_first_json_object(text: str) -> dict | None:
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        ch = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            continue

        if ch == '"':
            in_string = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    candidate = json.loads(text[start : index + 1])
                except Exception:
                    return None
                return candidate if isinstance(candidate, dict) else None
    return None


def read_task_queue_summary(path: Path) -> dict:
    data = read_json(path, {"version": "wechat-task-queue-v1", "tasks": []})
    tasks = data.get("tasks", [])
    if not isinstance(tasks, list):
        tasks = []
    pending = [item for item in tasks if item.get("status") == "pending"]
    running = [item for item in tasks if item.get("status") == "running"]
    completed = [item for item in tasks if item.get("status") == "completed"]
    failed = [item for item in tasks if item.get("status") == "failed"]
    recent = sorted(
        completed + failed,
        key=lambda item: item.get("completed_at") or item.get("started_at") or item.get("enqueued_at") or "",
        reverse=True,
    )
    return {
        "queue_file": str(path),
        "status": "active" if tasks else "idle",
        "counts": {
            "pending": len(pending),
            "running": len(running),
            "completed": len(completed),
            "failed": len(failed),
            "total": len(tasks),
        },
        "pending": pending[:3],
        "running": running[:1],
        "recent": recent[:3],
        "updated_at": data.get("updated_at"),
    }


def read_wechat_notification_summary(path: Path) -> dict:
    data = read_json(path, {})
    return {
        "state_file": str(path),
        "mode": data.get("mode", "every_round_summary"),
        "target_user_id": data.get("target_user_id"),
        "last_sent_at": data.get("last_sent_at"),
        "last_send_status": data.get("last_send_status", "unknown"),
        "last_cycle_signature": data.get("last_cycle_signature"),
        "last_most_worth_watching": data.get("last_most_worth_watching"),
        "last_error": data.get("last_error"),
        "last_delivery_mode": data.get("last_delivery_mode"),
        "last_attempted_at": data.get("last_attempted_at"),
    }


def safe_mtime_iso(path: Path) -> str | None:
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).astimezone().isoformat()
    except Exception:
        return None


def newest_mtime_iso(paths: list[Path]) -> str | None:
    candidates = []
    for path in paths:
        try:
            candidates.append(path.stat().st_mtime)
        except Exception:
            continue
    if not candidates:
        return None
    return datetime.fromtimestamp(max(candidates), tz=timezone.utc).astimezone().isoformat()


def extract_section_bullets(text: str, heading: str) -> list[str]:
    lines = text.splitlines()
    in_section = False
    bullets: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped == heading:
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section and stripped.startswith("- "):
            bullets.append(stripped[2:].strip())
    return bullets


def extract_phase_title(text: str, phase_heading: str) -> str:
    lines = text.splitlines()
    in_section = False
    for line in lines:
        stripped = line.strip()
        if stripped == phase_heading:
            in_section = True
            continue
        if in_section and stripped.startswith("## "):
            break
        if in_section and stripped.startswith("### "):
            return stripped[4:].strip("`").strip()
    return ""


def unique(items: list[str]) -> list[str]:
    seen = set()
    ordered = []
    for item in items:
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        ordered.append(normalized)
    return ordered


def build_agent_snapshot(active_agent: dict) -> dict:
    agents = active_agent.get("agents")
    if isinstance(agents, dict) and agents:
        return agents

    snapshot = {}

    claude_healthy = bool(active_agent.get("claude_healthy", False))
    claude_status = active_agent.get("claude_status", "unknown")
    snapshot["claude"] = {
        "healthy": claude_healthy,
        "status": claude_status,
        "reason": "claude auth not logged in" if claude_status == "not_logged_in" else claude_status,
    }

    codex_available = bool(active_agent.get("codex_available", False))
    snapshot["codex"] = {
        "healthy": codex_available,
        "status": "running" if codex_available else "not_running",
        "reason": "codex service is running" if codex_available else "codex service is not running",
    }

    return snapshot


def read_workspace_scope(config_path: Path) -> dict:
    config = read_json(
        config_path,
        {
            "scan_roots": ["~/github代码仓库"],
            "explicit_workspaces": [],
            "restrict_to_explicit_workspaces": False,
            "local_loop_name": "wechat-weclaw-mac-dual-agent-knowledge",
        },
    )
    explicit_workspaces = [str(expand(path)) for path in config.get("explicit_workspaces", []) if path]
    scan_roots = [str(expand(path)) for path in config.get("scan_roots", []) if path]
    restrict = bool(config.get("restrict_to_explicit_workspaces", False))
    core_workspaces = explicit_workspaces if restrict and explicit_workspaces else (explicit_workspaces or scan_roots)
    return {
        "config_path": str(config_path),
        "scope_mode": "explicit_core_loop" if restrict else "broad_scan",
        "restrict_to_explicit_workspaces": restrict,
        "local_loop_name": config.get("local_loop_name", "wechat-weclaw-mac-dual-agent-knowledge"),
        "explicit_workspaces": explicit_workspaces,
        "scan_roots": scan_roots,
        "core_workspaces": core_workspaces,
    }


def count_seen_markers(path: Path) -> int:
    try:
        if not path.exists():
            return 0
        return len([item for item in path.iterdir() if item.is_file()])
    except Exception:
        return 0


def count_context_tokens(path: Path) -> int:
    data = read_json(path, {})
    tokens = data.get("tokens", {})
    if isinstance(tokens, dict):
        return len(tokens)
    return 0


def latest_context_token_update(path: Path) -> str | None:
    data = read_json(path, {})
    tokens = data.get("tokens", {})
    if not isinstance(tokens, dict):
        return None
    values = []
    for item in tokens.values():
        if isinstance(item, dict):
            updated_at = item.get("updated_at")
            if isinstance(updated_at, str) and updated_at:
                values.append(updated_at)
    return max(values) if values else None


def read_weclaw_config(path: Path) -> dict:
    return read_json(
        path,
        {
            "save_dir": str(expand("~/.weclaw/workspace")),
            "obsidian_vault_dir": str(expand("~/Desktop/知识库")),
        },
    )


def build_weclaw_ingress_contract(active_agent_path: Path, weclaw_config_path: Path) -> dict:
    runtime_dir = active_agent_path.parent
    config = read_weclaw_config(weclaw_config_path)
    workspace_dir = expand(config.get("save_dir", "~/.weclaw/workspace"))
    seen_dir = runtime_dir / "seen_messages"
    context_path = runtime_dir / "context_tokens.json"
    session_dir = workspace_dir / ".obsidian" / "sessions"
    sidecar_files = sorted(workspace_dir.glob("*.sidecar.md")) if workspace_dir.exists() else []
    session_files = sorted(session_dir.glob("*.json")) if session_dir.exists() else []

    session_parse_failures = []
    repaired_session_files = []
    valid_session_files: list[Path] = []
    for session_file in session_files:
        try:
            json.loads(session_file.read_text(encoding="utf-8"))
            valid_session_files.append(session_file)
        except Exception as exc:
            repaired = extract_first_json_object(read_text(session_file))
            if repaired is not None:
                try:
                    write_json(session_file, repaired)
                    repaired_session_files.append(session_file.name)
                    valid_session_files.append(session_file)
                    continue
                except Exception as repair_exc:
                    session_parse_failures.append(f"{session_file.name}: {repair_exc}")
                    continue
            session_parse_failures.append(f"{session_file.name}: {exc}")

    seen_files = []
    try:
        seen_files = [item for item in seen_dir.iterdir() if item.is_file()] if seen_dir.exists() else []
    except Exception:
        seen_files = []

    status = "active" if active_agent_path.exists() else "missing"
    archive_status = "healthy"
    if session_parse_failures:
        archive_status = "degraded"
    elif not session_files:
        archive_status = "idle"

    return {
        "generated_at": now_iso(),
        "status": status,
        "archive_status": archive_status,
        "paths": {
            "active_agent_state": str(active_agent_path),
            "context_tokens": str(context_path),
            "seen_messages_dir": str(seen_dir),
            "workspace_dir": str(workspace_dir),
            "session_windows_dir": str(session_dir),
        },
        "counts": {
            "seen_messages": len(seen_files),
            "context_tokens": count_context_tokens(context_path),
            "session_windows": len(session_files),
            "session_windows_valid": len(valid_session_files),
            "session_windows_invalid": len(session_parse_failures),
            "media_sidecars": len(sidecar_files),
        },
        "latest_activity": {
            "active_agent_updated_at": safe_mtime_iso(active_agent_path),
            "context_token_updated_at": latest_context_token_update(context_path),
            "seen_message_at": newest_mtime_iso(seen_files),
            "session_window_at": newest_mtime_iso(valid_session_files),
            "media_sidecar_at": newest_mtime_iso(sidecar_files),
        },
        "session_window_valid": not session_parse_failures,
        "session_window_repairs": repaired_session_files[:5],
        "session_window_parse_failures": session_parse_failures[:5],
    }


def is_blocking_routing_reason(reason: str | None) -> bool:
    if not reason:
        return False
    normalized = reason.strip().lower()
    if not normalized:
        return False
    healthy_markers = ("healthy", "restored", "steady", "default_primary")
    blocking_markers = ("unavailable", "not_logged_in", "not_running", "failed", "degraded", "error", "timeout")
    if any(marker in normalized for marker in healthy_markers):
        return False
    return any(marker in normalized for marker in blocking_markers)


def is_permission_boundary_error(error: str | None) -> bool:
    if not error:
        return False
    return "Operation not permitted" in error or "Permission denied" in error


def build_most_worth_watching(blocked_items: list[str], pending_reviews: list[str], task_queue: dict, headline: str) -> str:
    if blocked_items:
        return summarize_watch_item(blocked_items[0])
    if pending_reviews:
        return pending_reviews[0]
    pending = task_queue.get("pending", [])
    if pending:
        task = pending[0]
        return f"微信待执行任务：{task.get('task_text', 'unknown')}"
    running = task_queue.get("running", [])
    if running:
        task = running[0]
        return f"微信任务执行中：{task.get('task_text', 'unknown')}"
    return headline


def summarize_watch_item(item: str) -> str:
    if item.startswith("knowledge_signal_read_failed:") or item.startswith("knowledge_projection_failed:"):
        return "知识库 Desktop 权限阻止 Runtime Dashboard 投影"
    return item


def build_delivery_policy(
    *, weclaw_ingress: dict, wechat_notifications: dict, generated_at: str, context_window_minutes: int
) -> dict:
    latest_activity = weclaw_ingress.get("latest_activity", {})
    last_context_token_at = latest_activity.get("context_token_updated_at")
    last_inbound_at = latest_activity.get("seen_message_at") or last_context_token_at
    window_open = False
    reference_dt = parse_iso_datetime(last_context_token_at) or parse_iso_datetime(last_inbound_at)
    generated_dt = parse_iso_datetime(generated_at)
    if reference_dt and generated_dt:
        window_open = generated_dt - reference_dt <= timedelta(minutes=context_window_minutes)

    if window_open:
        conversation_delivery_mode = "windowed_proactive"
    elif last_inbound_at or last_context_token_at:
        conversation_delivery_mode = "reply"
    else:
        conversation_delivery_mode = "unavailable"

    target_user_id = wechat_notifications.get("target_user_id")
    if target_user_id and weclaw_ingress.get("status") == "active":
        summary_delivery_mode = "background_summary"
    else:
        summary_delivery_mode = "unavailable"

    last_send_status = wechat_notifications.get("last_send_status", "unknown")
    if summary_delivery_mode == "unavailable":
        summary_status = "unavailable"
    elif last_send_status == "sent":
        summary_status = "sent"
    elif last_send_status == "failed":
        summary_status = "failed"
    else:
        summary_status = "ready"

    if conversation_delivery_mode == "windowed_proactive":
        conversation_status = "ready"
    elif conversation_delivery_mode == "reply":
        conversation_status = "waiting_for_inbound"
    else:
        conversation_status = "unavailable"

    return {
        "reliable_local": True,
        "wechat_delivery_mode": conversation_delivery_mode,
        "conversation_delivery_mode": conversation_delivery_mode,
        "summary_delivery_mode": summary_delivery_mode,
        "window_open": window_open,
        "context_window_minutes": context_window_minutes,
        "last_inbound_at": last_inbound_at,
        "last_context_token_at": last_context_token_at,
        "conversation_delivery_result": {
            "state_generated": True,
            "channel": "wechat",
            "mode": conversation_delivery_mode,
            "status": conversation_status,
        },
        "summary_delivery_result": {
            "state_generated": True,
            "channel": "wechat",
            "mode": summary_delivery_mode,
            "status": summary_status,
            "last_send_status": last_send_status,
            "last_attempted_at": wechat_notifications.get("last_attempted_at"),
            "last_sent_at": wechat_notifications.get("last_sent_at"),
            "last_error": wechat_notifications.get("last_error"),
        },
    }


def build_local_loop(
    *,
    workspace_scope: dict,
    runtime_dir: Path,
    agent_snapshot: dict,
    routing: dict,
    weclaw_ingress: dict,
    knowledge_projection: dict,
    delivery_policy: dict,
    hermes_repo: Path,
    bridge_health: dict,
) -> dict:
    effective_agent = routing.get("effective_agent", "codex")
    primary_agent = routing.get("preferred_primary", "codex")
    backup_agent = routing.get("preferred_backup", "claude")
    effective_health = agent_snapshot.get(effective_agent, {})
    execution_status = "healthy" if effective_health.get("healthy") else "degraded"
    knowledge_status = knowledge_projection.get("status", "unknown")
    ingress_counts = weclaw_ingress.get("counts", {})
    ingress_activity = weclaw_ingress.get("latest_activity", {})
    projection_paths = knowledge_projection.get("paths", {})

    return {
        "name": workspace_scope.get("local_loop_name", "wechat-weclaw-mac-dual-agent-knowledge"),
        "scope_mode": workspace_scope.get("scope_mode", "broad_scan"),
        "core_workspaces": workspace_scope.get("core_workspaces", []),
        "trace": [
            {
                "stage": "wechat_ingress",
                "owner": "WeChat",
                "status": weclaw_ingress.get("archive_status", weclaw_ingress.get("status", "unknown")),
                "summary": (
                    f"seen_markers={ingress_counts.get('seen_messages', 0)}, "
                    f"context_tokens={ingress_counts.get('context_tokens', 0)}, "
                    f"session_windows={ingress_counts.get('session_windows', 0)}, "
                    f"last_session_window={ingress_activity.get('session_window_at') or 'unknown'}"
                ),
            },
            {
                "stage": "weclaw_adapter",
                "owner": "weclaw",
                "status": "healthy" if bridge_health.get("upstream_reachable") else weclaw_ingress.get("status", "unknown"),
                "summary": (
                    f"routing_state={weclaw_ingress.get('paths', {}).get('active_agent_state', 'unknown')}, "
                    f"workspace={weclaw_ingress.get('paths', {}).get('workspace_dir', 'unknown')}, "
                    f"listener_up={bridge_health.get('listener_up', False)}, upstream_reachable={bridge_health.get('upstream_reachable', False)}"
                ),
            },
            {
                "stage": "mac_runtime",
                "owner": "longclaw-agent-os",
                "status": "active" if runtime_dir.exists() else "missing",
                "summary": "host=Mac, scheduler=repo.scheduler, harness=one-shot",
            },
            {
                "stage": "dual_agent_execution",
                "owner": "routing_controller",
                "status": execution_status,
                "summary": f"primary={primary_agent}, backup={backup_agent}, effective={effective_agent}",
            },
            {
                "stage": "knowledge_projection",
                "owner": "Reviewed Knowledge Plane",
                "status": knowledge_status,
                "summary": (
                    f"vault={knowledge_projection.get('vault_dir', 'unknown')}, "
                    f"inbox_count={knowledge_projection.get('inbox_count', 0)}, "
                    f"dashboard={Path(projection_paths.get('dashboard_file', 'Longclaw Runtime.md')).name}"
                ),
            },
            {
                "stage": "delivery_policy",
                "owner": "Client Runtime（端侧）",
                "status": "active" if delivery_policy.get("reliable_local") else "unknown",
                "summary": (
                    f"conversation_mode={delivery_policy.get('conversation_delivery_mode', 'unknown')}, "
                    f"summary_mode={delivery_policy.get('summary_delivery_mode', 'unknown')}, "
                    f"last_inbound_at={delivery_policy.get('last_inbound_at') or 'unknown'}, "
                    f"delivery_status={delivery_policy.get('summary_delivery_result', {}).get('status', 'unknown')}"
                ),
            },
            {
                "stage": "product_sync",
                "owner": "hermes-agent",
                "status": "active",
                "summary": f"roadmap_sync_target={hermes_repo}",
            },
        ],
    }


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(path.suffix + ".tmp")
    tmp_path.write_text(content, encoding="utf-8")
    tmp_path.replace(path)


def build_service_health(
    *, bridge_health: dict, queue_generated_at: str, wechat_notifications: dict, weclaw_ingress: dict
) -> dict:
    return {
        "bridge": {
            "state_file": bridge_health.get("state_file"),
            "generated_at": bridge_health.get("generated_at"),
            "listener_up": bridge_health.get("listener_up", False),
            "upstream_reachable": bridge_health.get("upstream_reachable", False),
            "dns_addresses": bridge_health.get("dns_addresses", []),
            "consecutive_failures": bridge_health.get("consecutive_failures", 0),
            "last_success_at": bridge_health.get("last_success_at"),
            "last_error": bridge_health.get("last_error"),
        },
        "scheduler": {
            "last_summary_generated_at": queue_generated_at,
            "last_summary_send_attempt_at": wechat_notifications.get("last_attempted_at"),
            "last_summary_send_result": wechat_notifications.get("last_send_status", "unknown"),
            "last_summary_sent_at": wechat_notifications.get("last_sent_at"),
        },
        "ingress": {
            "last_seen_message_at": weclaw_ingress.get("latest_activity", {}).get("seen_message_at"),
            "last_context_token_at": weclaw_ingress.get("latest_activity", {}).get("context_token_updated_at"),
            "session_window_valid": weclaw_ingress.get("session_window_valid", True),
        },
    }


def build_markdown(queue: dict) -> str:
    routing = queue.get("routing", {})
    harness = queue.get("harness", {})
    local_loop = queue.get("local_loop", {})
    weclaw_ingress = queue.get("weclaw_ingress", {})
    knowledge_projection = queue.get("knowledge_projection", {})
    task_queue = queue.get("task_queue", {})
    wechat_notifications = queue.get("wechat_notifications", {})
    delivery_policy = queue.get("delivery_policy", {})
    service_health = queue.get("service_health", {})
    pending_sync = queue.get("pending_sync", {})
    local_loop_lines = [
        f"- loop_name: {local_loop.get('name', 'unknown')}",
        f"- scope_mode: {local_loop.get('scope_mode', 'unknown')}",
    ]
    for workspace in local_loop.get("core_workspaces", []):
        local_loop_lines.append(f"- core_workspace: {workspace}")
    for stage in local_loop.get("trace", []):
        local_loop_lines.append(
            f"- {stage.get('stage', 'stage')}: {stage.get('status', 'unknown')} | {stage.get('summary', '')}"
        )
    return "\n".join(
        [
            "# Longclaw Runtime Status",
            "",
            f"- 生成时间：{queue.get('generated_at', '')}",
            f"- 当前里程碑：{queue.get('milestone', {}).get('current', '')}",
            f"- 下一里程碑：{queue.get('milestone', {}).get('next', '')}",
            "",
            "## Routing",
            "",
            f"- routing_mode: {routing.get('routing_mode', 'unknown')}",
            f"- preferred_primary: {routing.get('preferred_primary', 'unknown')}",
            f"- preferred_backup: {routing.get('preferred_backup', 'unknown')}",
            f"- effective_agent: {routing.get('effective_agent', 'unknown')}",
            f"- reason: {routing.get('reason', 'unknown')}",
            "",
            "## Harness",
            "",
            f"- brief_status: {harness.get('brief_status', 'unknown')}",
            f"- tick_status: {harness.get('tick_status', 'unknown')}",
            f"- headline: {harness.get('headline', 'unknown')}",
            "",
            "## WeClaw Companion",
            "",
            f"- status: {weclaw_ingress.get('status', 'unknown')}",
            f"- reviewed_handoff_status: {weclaw_ingress.get('archive_status', 'unknown')}",
            f"- seen_messages: {weclaw_ingress.get('counts', {}).get('seen_messages', 0)}",
            f"- context_tokens: {weclaw_ingress.get('counts', {}).get('context_tokens', 0)}",
            f"- session_windows: {weclaw_ingress.get('counts', {}).get('session_windows', 0)}",
            f"- session_windows_valid: {weclaw_ingress.get('counts', {}).get('session_windows_valid', 0)}",
            f"- session_windows_invalid: {weclaw_ingress.get('counts', {}).get('session_windows_invalid', 0)}",
            f"- session_window_valid: {weclaw_ingress.get('session_window_valid', True)}",
            f"- media_sidecars: {weclaw_ingress.get('counts', {}).get('media_sidecars', 0)}",
            "",
            "## Reviewed Knowledge Plane",
            "",
            f"- status: {knowledge_projection.get('status', 'unknown')}",
            f"- inbox_count: {knowledge_projection.get('inbox_count', 0)}",
            f"- dashboard_file: {knowledge_projection.get('paths', {}).get('dashboard_file', 'unknown')}",
            "",
            "## Remote Companion Runtime",
            "",
            f"- most_worth_watching: {queue.get('most_worth_watching', 'unknown')}",
            f"- conversation_delivery_mode: {delivery_policy.get('conversation_delivery_mode', 'unknown')}",
            f"- summary_delivery_mode: {delivery_policy.get('summary_delivery_mode', 'unknown')}",
            f"- reliable_local: {delivery_policy.get('reliable_local', False)}",
            f"- last_inbound_at: {delivery_policy.get('last_inbound_at', 'unknown')}",
            f"- last_context_token_at: {delivery_policy.get('last_context_token_at', 'unknown')}",
            f"- pending_tasks: {task_queue.get('counts', {}).get('pending', 0)}",
            f"- running_tasks: {task_queue.get('counts', {}).get('running', 0)}",
            f"- notification_mode: {wechat_notifications.get('mode', 'unknown')}",
            f"- last_send_status: {wechat_notifications.get('last_send_status', 'unknown')}",
            f"- last_sent_at: {wechat_notifications.get('last_sent_at', 'unknown')}",
            f"- summary_delivery_status: {delivery_policy.get('summary_delivery_result', {}).get('status', 'unknown')}",
            "",
            "## Service Health",
            "",
            f"- bridge_listener_up: {service_health.get('bridge', {}).get('listener_up', False)}",
            f"- bridge_upstream_reachable: {service_health.get('bridge', {}).get('upstream_reachable', False)}",
            f"- bridge_consecutive_failures: {service_health.get('bridge', {}).get('consecutive_failures', 0)}",
            f"- bridge_last_success_at: {service_health.get('bridge', {}).get('last_success_at', 'unknown')}",
            f"- scheduler_last_summary_generated_at: {service_health.get('scheduler', {}).get('last_summary_generated_at', 'unknown')}",
            f"- scheduler_last_summary_send_attempt_at: {service_health.get('scheduler', {}).get('last_summary_send_attempt_at', 'unknown')}",
            f"- scheduler_last_summary_send_result: {service_health.get('scheduler', {}).get('last_summary_send_result', 'unknown')}",
            "",
            "## Local Loop",
            "",
            *local_loop_lines,
            "",
            "## Next Steps",
            "",
            *([f"- {item}" for item in queue.get("next_steps", [])] or ["- 当前无待执行动作"]),
            "",
            "## Blocked Items",
            "",
            *([f"- {item}" for item in queue.get("blocked_items", [])] or ["- 无阻塞项"]),
            "",
            "## Pending Reviews",
            "",
            *([f"- {item}" for item in queue.get("pending_reviews", [])] or ["- 无待审阅项"]),
            "",
            "## Sync State",
            "",
            f"- knowledge_projection_pending: {pending_sync.get('knowledge_projection', False)}",
            f"- hermes_status_pending: {pending_sync.get('hermes_status', False)}",
            "",
        ]
    ) + "\n"


def build_runtime_review_markdown(queue: dict) -> str:
    local_loop = queue.get("local_loop", {})
    weclaw_ingress = queue.get("weclaw_ingress", {})
    task_queue = queue.get("task_queue", {})
    wechat_notifications = queue.get("wechat_notifications", {})
    delivery_policy = queue.get("delivery_policy", {})
    service_health = queue.get("service_health", {})
    return "\n".join(
        [
            "# Longclaw Runtime Review",
            "",
            f"- 生成时间：{queue.get('generated_at', '')}",
            f"- loop_name：{local_loop.get('name', 'unknown')}",
            "",
            "## Pending Reviews",
            "",
            *([f"- {item}" for item in queue.get("pending_reviews", [])] or ["- 无待审阅项"]),
            "",
            "## Blocked Items",
            "",
            *([f"- {item}" for item in queue.get("blocked_items", [])] or ["- 无阻塞项"]),
            "",
            "## Reviewed Handoff Contract",
            "",
            f"- reviewed_handoff_status: {weclaw_ingress.get('archive_status', 'unknown')}",
            f"- seen_messages: {weclaw_ingress.get('counts', {}).get('seen_messages', 0)}",
            f"- context_tokens: {weclaw_ingress.get('counts', {}).get('context_tokens', 0)}",
            f"- session_windows: {weclaw_ingress.get('counts', {}).get('session_windows', 0)}",
            f"- session_window_valid: {weclaw_ingress.get('session_window_valid', True)}",
            f"- media_sidecars: {weclaw_ingress.get('counts', {}).get('media_sidecars', 0)}",
            "",
            "## Delivery Policy",
            "",
            f"- conversation_delivery_mode: {delivery_policy.get('conversation_delivery_mode', 'unknown')}",
            f"- summary_delivery_mode: {delivery_policy.get('summary_delivery_mode', 'unknown')}",
            f"- last_inbound_at: {delivery_policy.get('last_inbound_at', 'unknown')}",
            f"- last_context_token_at: {delivery_policy.get('last_context_token_at', 'unknown')}",
            f"- summary_delivery_status: {delivery_policy.get('summary_delivery_result', {}).get('status', 'unknown')}",
            "",
            "## Bridge Health",
            "",
            f"- listener_up: {service_health.get('bridge', {}).get('listener_up', False)}",
            f"- upstream_reachable: {service_health.get('bridge', {}).get('upstream_reachable', False)}",
            f"- consecutive_failures: {service_health.get('bridge', {}).get('consecutive_failures', 0)}",
            f"- last_success_at: {service_health.get('bridge', {}).get('last_success_at', 'unknown')}",
            "",
            "## Task Queue",
            "",
            f"- pending: {task_queue.get('counts', {}).get('pending', 0)}",
            f"- running: {task_queue.get('counts', {}).get('running', 0)}",
            f"- failed: {task_queue.get('counts', {}).get('failed', 0)}",
            f"- last_send_status: {wechat_notifications.get('last_send_status', 'unknown')}",
            "",
            "## Next Steps",
            "",
            *([f"- {item}" for item in queue.get("next_steps", [])] or ["- 当前无待执行动作"]),
            "",
        ]
    ) + "\n"


def main() -> int:
    runtime_dir = expand(os.getenv("LONGCLAW_RUNTIME_DIR", "~/.longclaw/runtime-v2"))
    state_dir = expand(os.getenv("LONGCLAW_RUNTIME_STATE_DIR", str(runtime_dir / "state")))
    harness_root = expand(os.getenv("LONGCLAW_HARNESS_STATE_DIR", str(state_dir / "harness")))
    queue_file = expand(os.getenv("LONGCLAW_ROADMAP_QUEUE_FILE", str(state_dir / "roadmap-queue.json")))
    weclaw_ingress_file = expand(os.getenv("LONGCLAW_WECLAW_INGRESS_FILE", str(state_dir / "weclaw-ingress.json")))
    knowledge_projection_file = expand(
        os.getenv("LONGCLAW_KNOWLEDGE_PROJECTION_FILE", str(state_dir / "knowledge-projection.json"))
    )
    task_queue_file = expand(os.getenv("LONGCLAW_WECHAT_TASK_QUEUE_FILE", str(state_dir / "wechat-task-queue.json")))
    notification_state_file = expand(
        os.getenv("LONGCLAW_WECHAT_NOTIFICATION_STATE_FILE", str(state_dir / "wechat-notification-state.json"))
    )
    bridge_health_file = expand(
        os.getenv("LONGCLAW_WECLAW_BRIDGE_HEALTH_FILE", str(state_dir / "weclaw-bridge-health.json"))
    )
    context_window_minutes = int(os.getenv("LONGCLAW_WECHAT_CONTEXT_WINDOW_MINUTES", "15"))
    workspace_config_path = expand(
        os.getenv("LONGCLAW_WORKSPACE_CONFIG", str(runtime_dir / "config" / "workspace-watchdog.json"))
    )
    active_agent_path = expand(os.getenv("WECLAW_ACTIVE_AGENT_STATE", "~/.weclaw/runtime/active-agent.json"))
    weclaw_config_path = expand(os.getenv("WECLAW_APP_CONFIG", "~/.weclaw/config.json"))
    knowledge_vault = expand(os.getenv("LONGCLAW_KNOWLEDGE_VAULT", "~/Desktop/知识库"))
    dashboard_file = knowledge_vault / "00 Dashboard" / "Longclaw Runtime.md"
    inbox_dir = knowledge_vault / "10 Inbox" / "WeChat"
    runtime_review_file = knowledge_vault / "10 Inbox" / "Runtime" / "Longclaw Runtime Review.md"
    knowledge_projection_dir = expand(
        os.getenv("LONGCLAW_KNOWLEDGE_PROJECTION_DIR", str(state_dir / "knowledge-dashboard"))
    )
    dashboard_write_file = expand(
        os.getenv("LONGCLAW_KNOWLEDGE_DASHBOARD_WRITE_FILE", str(knowledge_projection_dir / "Longclaw Runtime.md"))
    )
    runtime_review_write_file = expand(
        os.getenv(
            "LONGCLAW_KNOWLEDGE_REVIEW_WRITE_FILE",
            str(knowledge_projection_dir / "Longclaw Runtime Review.md"),
        )
    )
    hermes_repo = expand(os.getenv("LONGCLAW_HERMES_REPO", "~/github代码仓库/hermes-agent"))
    plan_path = hermes_repo / "docs" / "longclaw" / "PLAN.md"
    roadmap_path = hermes_repo / "docs" / "longclaw" / "ROADMAP.md"
    hermes_status_dir = expand(
        os.getenv("LONGCLAW_HERMES_STATUS_DIR", str(hermes_repo / "docs" / "longclaw" / "status"))
    )
    hermes_status_json = hermes_status_dir / "runtime-status-latest.json"
    hermes_status_md = hermes_status_dir / "runtime-status-latest.md"

    brief = read_json(harness_root / "generated" / "system" / "brief-latest.json", {})
    tick = read_json(harness_root / "generated" / "system" / "tick-latest.json", {})
    active_agent = read_json(active_agent_path, {})
    agent_snapshot = build_agent_snapshot(active_agent)
    weclaw_ingress = build_weclaw_ingress_contract(active_agent_path, weclaw_config_path)
    task_queue = read_task_queue_summary(task_queue_file)
    wechat_notifications = read_wechat_notification_summary(notification_state_file)
    bridge_health = read_json(bridge_health_file, {})
    if bridge_health:
        bridge_health["state_file"] = str(bridge_health_file)
    workspace_scope = read_workspace_scope(workspace_config_path)
    roadmap_text = read_text(roadmap_path)
    plan_text = read_text(plan_path)

    inbox_count = 0
    knowledge_signal_error = None
    try:
        if inbox_dir.exists():
            inbox_count = len([item for item in inbox_dir.iterdir() if item.is_file()])
    except Exception as exc:
        knowledge_signal_error = str(exc)
    knowledge_signal_permission_limited = bool(
        knowledge_signal_error and is_permission_boundary_error(knowledge_signal_error)
    )

    roadmap_priorities = extract_section_bullets(roadmap_text, "## Near-term Priorities")
    plan_directions = extract_section_bullets(plan_text, "## Recommended Direction")

    blocked_items = unique(
        list(tick.get("failures", [])[:6])
        + (
            []
            if not is_blocking_routing_reason(active_agent.get("reason"))
            else [f"routing: {active_agent.get('reason')}"]
        )
        + (
            []
            if not bridge_health or bridge_health.get("upstream_reachable", False)
            else [f"weclaw_bridge_unreachable: {bridge_health.get('last_error') or 'upstream probe failed'}"]
        )
        + (
            []
            if not knowledge_signal_error or knowledge_signal_permission_limited
            else [f"knowledge_signal_read_failed: {knowledge_signal_error}"]
        )
    )
    pending_reviews = []
    if inbox_count > 0:
        pending_reviews.append(f"知识库 Inbox 待整理 {inbox_count} 条")
    if blocked_items:
        pending_reviews.append("检查 Longclaw Runtime Dashboard 中的阻塞项")
    if knowledge_signal_error and not knowledge_signal_permission_limited:
        pending_reviews.append("检查知识库 Inbox 读取错误")
    if active_agent.get("manual_override"):
        pending_reviews.append("当前处于 manual override，确认是否继续保持人工指定路由")
    if weclaw_ingress.get("session_window_parse_failures"):
        pending_reviews.append("weclaw session window 存在损坏尾部，需评估 reviewed handoff compatibility 清理策略")
    if bridge_health and not bridge_health.get("upstream_reachable", False):
        pending_reviews.append("weclaw bridge 上游不可达，检查 TUN 出口策略或代理链健康度")
    if task_queue.get("counts", {}).get("pending", 0) > 0:
        pending_reviews.append(f"微信任务队列待执行 {task_queue['counts']['pending']} 条")

    next_steps = unique(
        list(brief.get("details", {}).get("next_steps_effective", []))
        + list(brief.get("nextActions", []))
        + roadmap_priorities[:4]
        + plan_directions[:4]
    )
    if not next_steps:
        next_steps = ["当前无待执行动作"]

    headline = brief.get("details", {}).get("headline") or brief.get("headline") or "Longclaw runtime summary unavailable"
    summary_signature = brief.get("details", {}).get("summary_signature")
    if not summary_signature:
        summary_signature = hashlib.sha256(
            json.dumps(
                {
            "headline": headline,
            "next_steps": next_steps,
            "blocked_items": blocked_items,
            "task_queue_pending": task_queue.get("counts", {}).get("pending", 0),
        },
        ensure_ascii=False,
        sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()

    routing = {
        "routing_mode": active_agent.get("routing_mode", "primary_backup_failover"),
        "preferred_primary": active_agent.get("preferred_primary", "codex"),
        "preferred_backup": active_agent.get("preferred_backup", "claude"),
        "effective_agent": active_agent.get("effective_agent") or active_agent.get("active_agent", "codex"),
        "reason": active_agent.get("reason", "unknown"),
        "manual_override": bool(active_agent.get("manual_override", False)),
        "agents": agent_snapshot,
    }
    most_worth_watching = build_most_worth_watching(blocked_items, pending_reviews, task_queue, headline)
    delivery_policy = build_delivery_policy(
        weclaw_ingress=weclaw_ingress,
        wechat_notifications=wechat_notifications,
        generated_at=now_iso(),
        context_window_minutes=context_window_minutes,
    )
    service_health = build_service_health(
        bridge_health=bridge_health,
        queue_generated_at=now_iso(),
        wechat_notifications=wechat_notifications,
        weclaw_ingress=weclaw_ingress,
    )

    initial_knowledge_projection = {
        "generated_at": now_iso(),
        "status": "active" if dashboard_write_file.exists() or dashboard_file.exists() else "unknown",
        "vault_dir": str(knowledge_vault),
        "inbox_count": inbox_count,
        "signal_status": (
            "permission_limited"
            if knowledge_signal_permission_limited
            else ("error" if knowledge_signal_error else "ok")
        ),
        "signal_error": knowledge_signal_error,
        "projection_error": None,
        "paths": {
            "dashboard_file": str(dashboard_file),
            "dashboard_write_file": str(dashboard_write_file),
            "review_file": str(runtime_review_file),
            "review_write_file": str(runtime_review_write_file),
            "projection_state_file": str(knowledge_projection_file),
        },
    }

    queue = {
        "version": "roadmap-queue-v1",
        "generated_at": now_iso(),
        "milestone": {
            "current": extract_phase_title(roadmap_text, "## Phase 0") or "Local-first Reference System",
            "next": extract_phase_title(roadmap_text, "## Phase 1") or "Umbrella Repo Consolidation",
            "roadmap_path": str(roadmap_path),
            "plan_path": str(plan_path),
        },
        "routing": routing,
        "harness": {
            "brief_status": brief.get("status", "unknown"),
            "tick_status": tick.get("status", "unknown"),
            "headline": headline,
            "summary_signature": summary_signature,
            "current_failure_count": brief.get("details", {}).get("current_failure_count", 0),
            "manual_review_count": brief.get("details", {}).get("manual_review_count", 0),
            "open_failure_count": brief.get("details", {}).get("open_failure_count", 0),
            "report_paths": {
                "brief_json": str(harness_root / "generated" / "system" / "brief-latest.json"),
                "tick_json": str(harness_root / "generated" / "system" / "tick-latest.json"),
            },
        },
        "knowledge": {
            "vault_dir": str(knowledge_vault),
            "dashboard_file": str(dashboard_file),
            "inbox_count": inbox_count,
            "signal_status": (
                "permission_limited"
                if knowledge_signal_permission_limited
                else ("error" if knowledge_signal_error else "ok")
            ),
            "signal_error": knowledge_signal_error,
        },
        "weclaw_ingress": weclaw_ingress,
        "task_queue": task_queue,
        "wechat_notifications": wechat_notifications,
        "delivery_policy": delivery_policy,
        "service_health": service_health,
        "most_worth_watching": most_worth_watching,
        "knowledge_projection": initial_knowledge_projection,
        "workspace_scope": workspace_scope,
        "local_loop": build_local_loop(
            workspace_scope=workspace_scope,
            runtime_dir=runtime_dir,
            agent_snapshot=agent_snapshot,
            routing=routing,
            weclaw_ingress=weclaw_ingress,
            knowledge_projection=initial_knowledge_projection,
            delivery_policy=delivery_policy,
            hermes_repo=hermes_repo,
            bridge_health=bridge_health,
        ),
        "next_steps": next_steps,
        "blocked_items": blocked_items,
        "pending_reviews": unique(pending_reviews),
        "pending_sync": {
            "knowledge_projection": False,
            "hermes_status": False,
        },
        "outputs": {
            "queue_file": str(queue_file),
            "weclaw_ingress_file": str(weclaw_ingress_file),
            "knowledge_projection_file": str(knowledge_projection_file),
            "task_queue_file": str(task_queue_file),
            "wechat_notification_state_file": str(notification_state_file),
            "weclaw_bridge_health_file": str(bridge_health_file),
            "dashboard_file": str(dashboard_file),
            "dashboard_write_file": str(dashboard_write_file),
            "hermes_status_json": str(hermes_status_json),
            "hermes_status_md": str(hermes_status_md),
        },
    }

    markdown = build_markdown(queue)
    runtime_review_markdown = build_runtime_review_markdown(queue)

    knowledge_error = None
    try:
        write_text(dashboard_write_file, markdown.replace("# Longclaw Runtime Status", "# Longclaw Runtime"))
        if queue["pending_reviews"] or queue["blocked_items"]:
            write_text(runtime_review_write_file, runtime_review_markdown)
    except Exception as exc:
        knowledge_error = str(exc)
        queue["pending_sync"]["knowledge_projection"] = True
        if is_permission_boundary_error(knowledge_error):
            queue["pending_reviews"] = unique(
                queue["pending_reviews"] + ["授权 Longclaw Runtime 写入知识库 Dashboard"]
            )
        else:
            queue["blocked_items"] = unique(queue["blocked_items"] + [f"knowledge_projection_failed: {exc}"])
        queue["knowledge_projection"]["projection_error"] = knowledge_error
        queue["knowledge_projection"]["status"] = "pending"
        queue["most_worth_watching"] = build_most_worth_watching(
            queue["blocked_items"], queue["pending_reviews"], task_queue, headline
        )
        for stage in queue["local_loop"]["trace"]:
            if stage.get("stage") == "knowledge_projection":
                stage["status"] = "pending"
                break
    else:
        queue["knowledge_projection"]["status"] = "active"
        for stage in queue["local_loop"]["trace"]:
            if stage.get("stage") == "knowledge_projection":
                stage["status"] = "active"
                break

    hermes_error = None
    try:
        write_text(hermes_status_json, json.dumps(queue, ensure_ascii=False, indent=2) + "\n")
        write_text(hermes_status_md, markdown)
    except Exception as exc:
        hermes_error = str(exc)
        queue["pending_sync"]["hermes_status"] = True
        queue["blocked_items"] = unique(queue["blocked_items"] + [f"hermes_status_sync_failed: {exc}"])
        for stage in queue["local_loop"]["trace"]:
            if stage.get("stage") == "product_sync":
                stage["status"] = "pending"
                break

    queue_file.parent.mkdir(parents=True, exist_ok=True)
    weclaw_ingress_file.parent.mkdir(parents=True, exist_ok=True)
    knowledge_projection_file.parent.mkdir(parents=True, exist_ok=True)
    write_json(weclaw_ingress_file, queue["weclaw_ingress"])
    write_json(knowledge_projection_file, queue["knowledge_projection"])
    write_json(queue_file, queue)

    output = {
        "queue_file": str(queue_file),
        "knowledge_projection": "pending" if knowledge_error else "ok",
        "hermes_status": "pending" if hermes_error else "ok",
        "most_worth_watching": queue.get("most_worth_watching"),
        "next_steps": queue["next_steps"][:3],
        "blocked_items": queue["blocked_items"][:3],
    }
    print(json.dumps(output, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
