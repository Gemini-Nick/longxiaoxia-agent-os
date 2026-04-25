import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  LongclawArtifact,
  LongclawCapabilityEntry,
  LongclawCapabilitySubstrateSummary,
  LongclawControlPlaneOverview,
  LongclawLaunchIntent,
  LongclawLaunchMention,
  LongclawLaunchReceipt,
  LongclawOperatorAction,
  LongclawPackDashboard,
  LongclawRun,
  LongclawTask,
  LongclawWorkItem,
} from '../../../src/services/longclawControlPlane/models.js'
import type {
  PluginDevIssue,
  WeChatBindingStatus,
  WeChatRouteReceipt,
} from '../runtime/wechatPluginDev.js'
import {
  buttonStyleForState,
  chromeStyles,
  fontStacks,
  humanizeToken,
  navButtonStyle,
  palette,
  secondaryButtonStyle,
  segmentedButtonStyle,
  statusBadgeStyle,
  surfaceStyles,
  tradingDeskTheme,
  utilityStyles,
} from './designSystem.js'
import { type LongclawLocale, humanizeTokenLocale, localizeSystemText, t, tf } from './i18n.js'
import { createShellLayout, getViewportTier } from './layout.js'
import {
  ActionButtons,
  QueueRow,
  Section,
  StatusStrip,
} from './workspaces/shared.js'
import { PackWorkspace } from './workspaces/PackWorkspace.js'
import { ExecutionConsole } from './workspaces/TaskWorkspace.js'
import WeChatWorkspace from './workspaces/WeChatWorkspace.js'
import CapabilitiesWorkspace from './workspaces/CapabilitiesWorkspace.js'
import { recordObservationEvent } from './observation.js'

export type SurfaceId = 'strategy' | 'backtest' | 'execution' | 'wechat' | 'factory'
type Page = SurfaceId
type PackTab = 'due_diligence' | 'signals'
export type WorkMode = 'local' | 'cloud_sandbox' | 'weclaw_dispatch'
export type LocalRuntimeSeatPreference = 'auto' | 'force_acp' | 'force_local_runtime_api'
type TaskFlowFilter = 'all' | 'running' | 'pending' | 'failed' | 'completed'
type WeclawSessionVisibilityFilter = 'active' | 'hidden' | 'archived'
type WeclawSessionSourceFilter = 'all' | 'wechat' | 'weclaw'
type NavItemSpec = {
  id: Page
  label: string
  glyph: string
  title: string
  group: 'primary' | 'secondary'
}
type SkillInfo = { name: string; path: string; description: string; project?: string }
type AgentModeInfo = { mode: string; alive: boolean }
type WeclawSessionAttachment = {
  attachmentId: string
  title: string
  kind: string
  path?: string
  url?: string
  mimeType?: string
  size?: number
  text?: string
  origin: 'session' | 'message'
  messageId?: string
  metadata: Record<string, unknown>
}
type WeclawSessionMessage = {
  messageId: string
  role: string
  kind?: string
  text?: string
  agentName?: string
  createdAt?: string
  attachments: WeclawSessionAttachment[]
  metadata: Record<string, unknown>
}
type WeclawSessionSummary = {
  sessionId: string
  canonicalSessionId: string
  duplicateSessionIds: string[]
  hidden: boolean
  archived: boolean
  filePath: string
  userId?: string
  updatedAt?: string
  title: string
  preview?: string
  messageCount: number
  agentReplyCount: number
  mediaCount: number
  sourceLabel: string
  canonicalMetadata: Record<string, unknown>
}
type WeclawSessionDetail = WeclawSessionSummary & {
  messages: WeclawSessionMessage[]
  media: WeclawSessionAttachment[]
}
type WeclawSessionSourceStatus = {
  workspaceRoot: string | null
  workspaceSource: 'config' | 'env' | 'default' | 'unresolved'
  sessionsDir: string | null
  sessionsDirExists: boolean
  sessionCount: number
}
type CapabilityItem = {
  id: string
  label: string
  kind: 'pack' | 'skill' | 'plugin'
  mention: string
  hint: string
  description: string
}
type LaunchRecord = {
  id: string
  prompt: string
  status: 'running' | 'succeeded' | 'failed'
  started_at: string
  finished_at?: string
  text: string
  tool_names: string[]
  result_label?: string
  error?: string
  task_id?: string
  pack_id?: string
  source?: string
  work_mode?: string
  origin_surface?: string
  interaction_surface?: string
  runtime_profile?: string
  runtime_target?: string
  model_plane?: string
  local_runtime_seat?: string
  execution_plane?: string
  workspace_target?: string
}
type ThreadSummary = {
  id: string
  title: string
  subtitle?: string
  latestAt?: string
  status: string
  workMode?: string
  sessionId?: string
  workspaceTarget?: string
  localRuntimeSeat?: string
  itemCount: number
}
type WeclawExecutionJumpContext = {
  canonicalSessionId?: string
  canonicalUserId?: string
  contextToken?: string
  sessionTitle?: string
}
type ConversationEvent =
  | {
      id: string
      type: 'user_launch'
      timestamp: string
      status: string
      title: string
      body?: string
      meta?: string
      workMode?: string
      runtimeProfile?: string
      runtimeTarget?: string
      interactionSurface?: string
      localRuntimeSeat?: string
      launch: LaunchRecord
    }
  | {
      id: string
      type: 'task_receipt'
      timestamp: string
      status: string
      title: string
      body?: string
      meta?: string
      workMode?: string
      runtimeProfile?: string
      runtimeTarget?: string
      interactionSurface?: string
      localRuntimeSeat?: string
      task: LongclawTask
    }
  | {
      id: string
      type: 'run_receipt'
      timestamp: string
      status: string
      title: string
      body?: string
      meta?: string
      workMode?: string
      runtimeProfile?: string
      runtimeTarget?: string
      interactionSurface?: string
      localRuntimeSeat?: string
      run: LongclawRun
    }
  | {
      id: string
      type: 'work_item_receipt'
      timestamp: string
      status: string
      title: string
      body?: string
      meta?: string
      workMode?: string
      runtimeProfile?: string
      runtimeTarget?: string
      interactionSurface?: string
      localRuntimeSeat?: string
      workItem: LongclawWorkItem
    }
type SidebarStatusItem = {
  id: string
  label: string
  meta?: string
  status: string
}
export type RuntimeStatusSummary = {
  longclawCoreConnected: boolean
  longclawCoreBaseUrl?: string
  dueDiligenceConnected: boolean
  dueDiligenceBaseUrl?: string
  signalsAvailable: boolean
  signalsStateRoot?: string
  signalsWebBaseUrl?: string
  signalsWeb2BaseUrl?: string
  localRuntimeSeat?: string
  localRuntimeAvailable: boolean
  localRuntimeApiUrl?: string
  localRuntimeApiAvailable: boolean
  localAcpAvailable: boolean
  localAcpScript?: string
  localAcpSource?: string
  localRuntimeSeatPreference: LocalRuntimeSeatPreference
  localRuntimeSeatOverrideActive: boolean
  devMachineAcpTakeover: boolean
  runtimeProfile?: string
  stackEnvLoaded: boolean
  stackEnvPath?: string
}
type CapabilityManagerSettings = {
  disabled_capabilities: string[]
  capability_groups: Record<string, string>
  extra_skill_roots: string[]
  extra_plugin_roots: string[]
}
type RuntimeCapabilityRegistryEntry = {
  registry_id: string
  kind: 'skill' | 'plugin'
  label: string
  source_path: string
  managed_path: string
  source: string
  installed_at: string
  removable: boolean
  health: string
  metadata: Record<string, unknown>
}
type RuntimeCapabilityRegistry = {
  version: number
  updated_at: string
  entries: RuntimeCapabilityRegistryEntry[]
}
type TaskFlowItem = {
  id: string
  kind: 'launch' | 'task' | 'run' | 'work_item'
  title: string
  meta?: string
  description?: string
  status: string
  filter: TaskFlowFilter
  timestamp?: string
}
type DetailTarget =
  | { type: 'run'; title: string; run: LongclawRun; actions: LongclawOperatorAction[] }
  | { type: 'work_item'; title: string; workItem: LongclawWorkItem }
  | { type: 'weclaw_session'; title: string; session: WeclawSessionDetail }
  | {
      type: 'record'
      title: string
      record: Record<string, unknown>
      actions: LongclawOperatorAction[]
    }

const WORK_MODE_ORDER: WorkMode[] = ['local', 'cloud_sandbox']

const WORK_MODE_SPECS: Record<
  WorkMode,
  {
    label: string
    eyebrow: string
    summary: string
    detail: string
    runtimeTarget: string
    interactionSurface: string
    modelPlane: string
    runtimeProfile: string
    workspaceLabel: string
    workspaceHint: string
    surfaceLabel: string
    launchButtonLabel: string
    launchHint: string
    placeholder: string
    preferredChannels: string[]
    fallbackChannels: string[]
  }
> = {
  local: {
    label: 'Local Work',
    eyebrow: 'Local environment',
    summary: 'Run against this machine and workspace, while keeping model inference on the cloud provider plane.',
    detail: 'Best for coding, terminal work, and direct file manipulation when the environment should stay local but the model stays remote.',
    runtimeTarget: 'local_runtime',
    interactionSurface: 'electron_home',
    modelPlane: 'cloud_provider',
    runtimeProfile: 'dev_local_acp_bridge',
    workspaceLabel: 'Current workspace',
    workspaceHint: 'Environment stays local. The model plane stays cloud-backed.',
    surfaceLabel: 'Electron Home',
    launchButtonLabel: 'Launch local work',
    launchHint:
      'Local Work keeps execution on this machine, keeps the model in the cloud, and still lands in the same task ledger.',
    placeholder:
      'Describe the local outcome you want, then optionally steer with @pack, @skill, or @plugin.',
    preferredChannels: ['desktop'],
    fallbackChannels: ['weclaw'],
  },
  cloud_sandbox: {
    label: 'Cloud Sandbox',
    eyebrow: 'Cloud environment',
    summary: 'Run in a remote sandbox where both the environment and model access stay on the cloud side.',
    detail: 'Best for isolated, long-running, or remote execution when the local machine should not be part of the environment.',
    runtimeTarget: 'cloud_runtime',
    interactionSurface: 'electron_home',
    modelPlane: 'cloud_provider',
    runtimeProfile: 'cloud_managed_runtime',
    workspaceLabel: 'Cloud sandbox',
    workspaceHint: 'Environment and model access both stay on the cloud side.',
    surfaceLabel: 'Electron Home',
    launchButtonLabel: 'Launch in cloud sandbox',
    launchHint:
      'Cloud Sandbox keeps launch on desktop while routing environment execution to the cloud runtime.',
    placeholder:
      'Describe the cloud task, then optionally route it with @pack, @skill, or @plugin.',
    preferredChannels: ['desktop'],
    fallbackChannels: ['weclaw'],
  },
  weclaw_dispatch: {
    label: 'WeClaw Dispatch',
    eyebrow: 'WeChat-controlled local environment',
    summary: 'Launch or continue work from WeClaw while the environment stays local and the model stays on the cloud provider plane.',
    detail: 'Best for async dispatch, mobile continuity, and controlling the local environment from a WeChat thread without exposing the bridge as the product default.',
    runtimeTarget: 'local_runtime',
    interactionSurface: 'weclaw',
    modelPlane: 'cloud_provider',
    runtimeProfile: 'dev_local_acp_bridge',
    workspaceLabel: 'WeClaw thread',
    workspaceHint: 'WeChat controls the local environment. The model plane stays cloud-backed.',
    surfaceLabel: 'WeClaw + Electron',
    launchButtonLabel: 'Dispatch via WeClaw',
    launchHint:
      'WeClaw Dispatch keeps chat continuity while the canonical task ledger and governance stay in Electron.',
    placeholder:
      'Describe the dispatched task, then optionally steer with @pack, @skill, or @plugin.',
    preferredChannels: ['weclaw', 'desktop'],
    fallbackChannels: ['desktop'],
  },
}

function localizedWorkModeSpec(locale: LongclawLocale, mode: WorkMode) {
  const base = WORK_MODE_SPECS[mode]
  const prefix =
    mode === 'local'
      ? 'mode.local'
      : mode === 'cloud_sandbox'
        ? 'mode.cloud'
        : 'mode.weclaw'
  return {
    ...base,
    label: t(locale, `${prefix}.label`),
    eyebrow: t(locale, `${prefix}.eyebrow`),
    summary: t(locale, `${prefix}.summary`),
    detail: t(locale, `${prefix}.detail`),
    workspaceLabel: t(locale, `${prefix}.workspace_label`),
    workspaceHint: t(locale, `${prefix}.workspace_hint`),
    surfaceLabel: t(locale, `${prefix}.surface_label`),
    launchButtonLabel: t(locale, `${prefix}.launch_button`),
    launchHint: t(locale, `${prefix}.launch_hint`),
    placeholder: t(locale, `${prefix}.placeholder`),
  }
}

function workModeSpecFromValue(
  locale: LongclawLocale,
  value?: string | null,
): ReturnType<typeof localizedWorkModeSpec> | null {
  if (value === 'local' || value === 'cloud_sandbox' || value === 'weclaw_dispatch') {
    return localizedWorkModeSpec(locale, value)
  }
  return null
}

declare global {
  interface Window {
    agentAPI: {
      query: (message: string) => Promise<{ ok: boolean }>
      clear: () => Promise<{ ok: boolean }>
      getMode: () => Promise<AgentModeInfo>
      getCwd: () => Promise<string>
      getSkills: () => Promise<SkillInfo[]>
      onText: (cb: (text: string) => void) => () => void
      onTool: (cb: (tool: { name: string; input: unknown }) => void) => () => void
      onResult: (cb: (result: unknown) => void) => () => void
      onError: (cb: (error: string) => void) => () => void
    }
    longclawControlPlane: {
      getOverview: () => Promise<LongclawControlPlaneOverview>
      listRuns: () => Promise<LongclawRun[]>
      listWorkItems: () => Promise<LongclawWorkItem[]>
      getPackDashboard: (packId: PackTab) => Promise<LongclawPackDashboard>
      listArtifacts: (runId: string, domain: string) => Promise<LongclawArtifact[]>
      executeAction: (
        actionId: string,
        payload?: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>
      performLocalAction: (action: {
        kind: string
        payload?: Record<string, unknown>
      }) => Promise<Record<string, unknown>>
      readArtifactPreview: (uri: string) => Promise<{
        ok: boolean
        text?: string
        reason?: string
        size?: number
      }>
    }
    longclawLaunch: {
      launch: (intent: LongclawLaunchIntent) => Promise<LongclawLaunchReceipt>
      listTasks: (limit?: number) => Promise<LongclawTask[]>
      getTask: (taskId: string) => Promise<LongclawTask>
    }
    weclawSessions: {
      listWeclawSessions: () => Promise<WeclawSessionSummary[]>
      getWeclawSession: (sessionId: string) => Promise<WeclawSessionDetail | null>
      getStatus: () => Promise<WeclawSessionSourceStatus>
      updateSessionState: (
        canonicalSessionId: string,
        patch: { hidden?: boolean; archived?: boolean },
      ) => Promise<Record<string, { hidden: boolean; archived: boolean; updated_at: string }>>
    }
    longclawWechat: {
      getBindingStatus: () => Promise<WeChatBindingStatus>
      createBindingSession: () => Promise<WeChatBindingStatus>
      createLocalBindingSession: () => Promise<WeChatBindingStatus>
      completeBindingSession: () => Promise<WeChatBindingStatus>
      revokeBinding: () => Promise<WeChatBindingStatus>
      routeMessage: (text: string) => Promise<WeChatRouteReceipt>
    }
    longclawPluginDev: {
      listIssues: () => Promise<PluginDevIssue[]>
      listReceipts: () => Promise<WeChatRouteReceipt[]>
      startImplementation: (issueId: string) => Promise<PluginDevIssue>
      runCi: (issueId: string) => Promise<PluginDevIssue>
      merge: (issueId: string) => Promise<PluginDevIssue>
      registerArtifact: (issueId: string) => Promise<PluginDevIssue>
    }
    longclawCapabilitySubstrate: {
      getSummary: () => Promise<LongclawCapabilitySubstrateSummary>
    }
    longclawCapabilityManager: {
      getSettings: () => Promise<CapabilityManagerSettings>
      updateSettings: (
        patch: Partial<CapabilityManagerSettings>,
      ) => Promise<CapabilityManagerSettings>
      getRegistry: () => Promise<RuntimeCapabilityRegistry>
      registerCapability: (payload: {
        kind: 'skill' | 'plugin'
        sourcePath: string
        label?: string
      }) => Promise<RuntimeCapabilityRegistry>
      removeCapability: (registryId: string) => Promise<RuntimeCapabilityRegistry>
      rescan: () => Promise<RuntimeCapabilityRegistry>
    }
    longclawRuntime: {
      getLocalSeatPreference: () => Promise<LocalRuntimeSeatPreference>
      setLocalSeatPreference: (
        preference: LocalRuntimeSeatPreference,
      ) => Promise<{ preference: LocalRuntimeSeatPreference }>
    }
    longclawWindow: {
      setLocale: (locale: LongclawLocale) => Promise<{ ok: boolean }>
    }
  }
}

function formatTime(value?: string | null): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isTextPreviewable(uri: string): boolean {
  return (
    (uri.startsWith('/') &&
      ['.json', '.md', '.txt', '.log'].some(ext => uri.endsWith(ext))) ||
    uri.endsWith('stdout.log')
  )
}

function severityRank(value: string): number {
  if (value === 'critical') return 0
  if (value === 'warning') return 1
  if (value === 'info') return 2
  return 3
}

function pageTitle(locale: LongclawLocale, page: Page): string {
  if (page === 'wechat') return t(locale, 'page.wechat.title')
  if (page === 'factory') return t(locale, 'page.plugins.title')
  if (page === 'execution') return t(locale, 'page.execution.title')
  if (page === 'backtest') return t(locale, 'page.backtest.title')
  return t(locale, 'page.strategy.title')
}

function pageEyebrow(locale: LongclawLocale, page: Page): string {
  if (page === 'wechat') return t(locale, 'page.wechat.eyebrow')
  if (page === 'factory') return t(locale, 'page.plugins.eyebrow')
  if (page === 'execution') return t(locale, 'page.execution.eyebrow')
  if (page === 'backtest') return t(locale, 'page.backtest.eyebrow')
  return t(locale, 'page.strategy.eyebrow')
}

function pageDescription(locale: LongclawLocale, page: Page): string {
  if (page === 'wechat') return t(locale, 'page.wechat.description')
  if (page === 'factory') return t(locale, 'page.plugins.description')
  if (page === 'execution') return t(locale, 'page.execution.description')
  if (page === 'backtest') return t(locale, 'page.backtest.description')
  return t(locale, 'page.strategy.description')
}

function normalizeLocalRuntimeSeatPreference(
  value: unknown,
): LocalRuntimeSeatPreference {
  return value === 'force_acp' || value === 'force_local_runtime_api' ? value : 'auto'
}

function modeSpec(mode: WorkMode | string | undefined) {
  if (mode === 'local' || mode === 'cloud_sandbox' || mode === 'weclaw_dispatch') {
    return WORK_MODE_SPECS[mode]
  }
  return undefined
}

function humanizeWorkMode(locale: LongclawLocale, mode?: string | null): string {
  if (mode === 'local') return t(locale, 'mode.local.label')
  if (mode === 'cloud_sandbox') return t(locale, 'mode.cloud.label')
  if (mode === 'weclaw_dispatch') return t(locale, 'mode.weclaw.label')
  return humanizeTokenLocale(locale, mode ?? 'unknown')
}

function packLabel(locale: LongclawLocale, packId?: string | null): string {
  const normalized = String(packId ?? '').replace(/-/g, '_')
  if (normalized === 'due_diligence') return t(locale, 'pack.due_diligence')
  if (normalized === 'signals') return t(locale, 'pack.signals')
  return humanizeTokenLocale(locale, packId ?? 'unknown')
}

function localizePackNotice(locale: LongclawLocale, notice?: string | null): string | null {
  if (!notice?.trim()) return null
  const normalized = notice.trim().toLowerCase()
  if (normalized === 'fetch failed' || normalized === 'failed to fetch') {
    return t(locale, 'notice.pack_fetch_failed')
  }
  return localizeSystemText(locale, notice)
}

function readMetadataString(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  if (!value) return undefined
  const record = value as Record<string, unknown>
  const direct = record[key]
  if (typeof direct === 'string' && direct.trim()) return direct
  const metadata = record.metadata
  if (metadata && typeof metadata === 'object') {
    const nested = (metadata as Record<string, unknown>)[key]
    if (typeof nested === 'string' && nested.trim()) return nested
  }
  return undefined
}

function readMetadataBoolean(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
  key: string,
): boolean | undefined {
  if (!value) return undefined
  const record = value as Record<string, unknown>
  const direct = record[key]
  if (typeof direct === 'boolean') return direct
  const metadata = record.metadata
  if (metadata && typeof metadata === 'object') {
    const nested = (metadata as Record<string, unknown>)[key]
    if (typeof nested === 'boolean') return nested
  }
  return undefined
}

function readMetadataRecord(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
  key: string,
): Record<string, unknown> | undefined {
  if (!value) return undefined
  const record = value as Record<string, unknown>
  const direct = record[key]
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>
  }
  const metadata = record.metadata
  if (metadata && typeof metadata === 'object') {
    const nested = (metadata as Record<string, unknown>)[key]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>
    }
  }
  return undefined
}

function recordSessionId(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
): string | undefined {
  return (
    readMetadataString(value, 'session_id') ??
    readMetadataString(value, 'canonical_session_id') ??
    readMetadataString(value, 'sessionId')
  )
}

function weclawCanonicalSessionId(
  session:
    | Pick<WeclawSessionSummary, 'canonicalMetadata' | 'canonicalSessionId'>
    | null
    | undefined,
): string | undefined {
  return (
    stringValue(session?.canonicalSessionId) ??
    stringValue(session?.canonicalMetadata.canonical_session_id) ??
    stringValue(session?.canonicalMetadata.canonicalSessionID)
  )
}

function weclawCanonicalUserId(
  session: Pick<WeclawSessionSummary, 'canonicalMetadata'> | null | undefined,
): string | undefined {
  return (
    stringValue(session?.canonicalMetadata.canonical_user_id) ??
    stringValue(session?.canonicalMetadata.canonicalUserID)
  )
}

function weclawContextToken(
  session: Pick<WeclawSessionSummary, 'canonicalMetadata'> | null | undefined,
): string | undefined {
  return (
    stringValue(session?.canonicalMetadata.context_token) ??
    stringValue(session?.canonicalMetadata.contextToken)
  )
}

function buildWeclawJumpContext(
  session:
    | Pick<WeclawSessionSummary, 'title' | 'canonicalMetadata' | 'canonicalSessionId'>
    | null
    | undefined,
): WeclawExecutionJumpContext | null {
  if (!session) return null
  return {
    canonicalSessionId: weclawCanonicalSessionId(session),
    canonicalUserId: weclawCanonicalUserId(session),
    contextToken: weclawContextToken(session),
    sessionTitle: stringValue(session.title),
  }
}

function weclawAttachmentUri(attachment: WeclawSessionAttachment): string | undefined {
  return attachment.path ?? attachment.url ?? attachment.text
}

function workModeFromTask(task: LongclawTask): string | undefined {
  return readMetadataString(task as unknown as Record<string, unknown>, 'work_mode')
}

function workModeFromRun(run: LongclawRun): string | undefined {
  return readMetadataString(run as unknown as Record<string, unknown>, 'work_mode')
}

function workModeFromWorkItem(item: LongclawWorkItem): string | undefined {
  return readMetadataString(item as unknown as Record<string, unknown>, 'work_mode')
}

function originSurfaceFromTask(task: LongclawTask): string | undefined {
  return (
    readMetadataString(task as unknown as Record<string, unknown>, 'origin_surface') ??
    readMetadataString(task as unknown as Record<string, unknown>, 'launch_surface')
  )
}

function originSurfaceFromRun(run: LongclawRun): string | undefined {
  return (
    readMetadataString(run as unknown as Record<string, unknown>, 'origin_surface') ??
    readMetadataString(run as unknown as Record<string, unknown>, 'launch_surface')
  )
}

function originSurfaceFromWorkItem(item: LongclawWorkItem): string | undefined {
  return (
    readMetadataString(item as unknown as Record<string, unknown>, 'origin_surface') ??
    readMetadataString(item as unknown as Record<string, unknown>, 'launch_surface')
  )
}

function executionPlaneFromTask(task: LongclawTask): string | undefined {
  return readMetadataString(task as unknown as Record<string, unknown>, 'execution_plane')
}

function executionPlaneFromRun(run: LongclawRun): string | undefined {
  return readMetadataString(run as unknown as Record<string, unknown>, 'execution_plane')
}

function executionPlaneFromWorkItem(item: LongclawWorkItem): string | undefined {
  return readMetadataString(item as unknown as Record<string, unknown>, 'execution_plane')
}

function workspaceTargetFromTask(task: LongclawTask): string | undefined {
  return readMetadataString(task as unknown as Record<string, unknown>, 'workspace_target')
}

function interactionSurfaceFromTask(task: LongclawTask): string | undefined {
  return readMetadataString(task as unknown as Record<string, unknown>, 'interaction_surface')
}

function interactionSurfaceFromRun(run: LongclawRun): string | undefined {
  return readMetadataString(run as unknown as Record<string, unknown>, 'interaction_surface')
}

function interactionSurfaceFromWorkItem(item: LongclawWorkItem): string | undefined {
  return readMetadataString(item as unknown as Record<string, unknown>, 'interaction_surface')
}

function runtimeProfileFromRecord(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
): string | undefined {
  return readMetadataString(value, 'runtime_profile')
}

function runtimeTargetFromRecord(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
): string | undefined {
  return readMetadataString(value, 'runtime_target')
}

function modelPlaneFromRecord(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
): string | undefined {
  return readMetadataString(value, 'model_plane')
}

function localRuntimeSeatFromRecord(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
): string | undefined {
  return readMetadataString(value, 'local_runtime_seat')
}

function runtimeStatusFromSummary(
  summary: LongclawCapabilitySubstrateSummary | null,
): RuntimeStatusSummary {
  const runtimeStatus = readMetadataRecord(summary ?? undefined, 'runtime_status') ?? {}
  return {
    longclawCoreConnected: Boolean(runtimeStatus.longclaw_core_connected),
    longclawCoreBaseUrl:
      typeof runtimeStatus.longclaw_core_base_url === 'string'
        ? runtimeStatus.longclaw_core_base_url
        : undefined,
    dueDiligenceConnected: Boolean(runtimeStatus.due_diligence_connected),
    dueDiligenceBaseUrl:
      typeof runtimeStatus.due_diligence_base_url === 'string'
        ? runtimeStatus.due_diligence_base_url
        : undefined,
    signalsAvailable: Boolean(runtimeStatus.signals_available),
    signalsStateRoot:
      typeof runtimeStatus.signals_state_root === 'string'
        ? runtimeStatus.signals_state_root
        : undefined,
    signalsWebBaseUrl:
      typeof runtimeStatus.signals_web_base_url === 'string'
        ? runtimeStatus.signals_web_base_url
        : undefined,
    signalsWeb2BaseUrl:
      typeof runtimeStatus.signals_web2_base_url === 'string'
        ? runtimeStatus.signals_web2_base_url
        : undefined,
    localRuntimeSeat:
      typeof runtimeStatus.local_runtime_seat === 'string'
        ? runtimeStatus.local_runtime_seat
        : undefined,
    localRuntimeAvailable: Boolean(runtimeStatus.local_runtime_available),
    localRuntimeApiUrl:
      typeof runtimeStatus.local_runtime_api_url === 'string'
        ? runtimeStatus.local_runtime_api_url
        : undefined,
    localRuntimeApiAvailable: Boolean(runtimeStatus.local_runtime_api_available),
    localAcpAvailable: Boolean(runtimeStatus.local_acp_available),
    localAcpScript:
      typeof runtimeStatus.local_acp_script === 'string'
        ? runtimeStatus.local_acp_script
        : undefined,
    localAcpSource:
      typeof runtimeStatus.local_acp_source === 'string'
        ? runtimeStatus.local_acp_source
        : undefined,
    localRuntimeSeatPreference: normalizeLocalRuntimeSeatPreference(
      runtimeStatus.local_runtime_seat_preference,
    ),
    localRuntimeSeatOverrideActive: Boolean(runtimeStatus.local_runtime_seat_override_active),
    devMachineAcpTakeover: Boolean(runtimeStatus.dev_machine_acp_takeover),
    runtimeProfile:
      typeof runtimeStatus.runtime_profile === 'string'
        ? runtimeStatus.runtime_profile
        : undefined,
    stackEnvLoaded: Boolean(runtimeStatus.stack_env_loaded),
    stackEnvPath:
      typeof runtimeStatus.stack_env_path === 'string'
        ? runtimeStatus.stack_env_path
        : undefined,
  }
}

function effectiveRuntimeProfile(
  workMode: WorkMode,
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference = runtimeStatus.localRuntimeSeatPreference,
): string {
  if (workMode === 'cloud_sandbox') return 'cloud_managed_runtime'
  if (effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference) === 'local_runtime_api') {
    return 'packaged_local_runtime'
  }
  return 'dev_local_acp_bridge'
}

export function effectiveLocalRuntimeSeat(
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference,
): string {
  if (localSeatPreference === 'force_acp') {
    return runtimeStatus.localAcpAvailable ? 'acp_bridge' : 'unavailable'
  }
  if (localSeatPreference === 'force_local_runtime_api') {
    return runtimeStatus.localRuntimeApiAvailable ? 'local_runtime_api' : 'unavailable'
  }
  return runtimeStatus.localRuntimeSeat ?? 'unavailable'
}

function localSeatPreferenceLabel(
  locale: LongclawLocale,
  preference: LocalRuntimeSeatPreference,
): string {
  if (preference === 'force_acp') return t(locale, 'seat_pref.force_acp')
  if (preference === 'force_local_runtime_api') {
    return t(locale, 'seat_pref.force_local_runtime_api')
  }
  return t(locale, 'seat_pref.auto')
}

function localSeatStateMessage(
  locale: LongclawLocale,
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference,
): string | null {
  if (localSeatPreference !== 'auto') {
    return tf(locale, 'notice.local_seat_override', {
      seat: localSeatPreferenceLabel(locale, localSeatPreference),
    })
  }
  if (runtimeStatus.devMachineAcpTakeover) {
    return t(locale, 'notice.local_acp_takeover')
  }
  return null
}

function weclawEmptyStateMessage(
  locale: LongclawLocale,
  status: WeclawSessionSourceStatus | null,
): string {
  if (!status?.sessionsDirExists) return t(locale, 'empty.weclaw_sessions_dir_missing')
  if (status.sessionCount === 0) return t(locale, 'empty.weclaw_sessions_dir_empty')
  return t(locale, 'empty.no_weclaw_sessions')
}

function defaultCapabilityManagerSettings(): CapabilityManagerSettings {
  return {
    disabled_capabilities: [],
    capability_groups: {},
    extra_skill_roots: [],
    extra_plugin_roots: [],
  }
}

function capabilityManagerSettingsFromSummary(
  summary: LongclawCapabilitySubstrateSummary | null,
): CapabilityManagerSettings {
  const raw = readMetadataRecord(summary ?? undefined, 'capability_manager') ?? {}
  const disabled = Array.isArray(raw.disabled_capabilities)
    ? raw.disabled_capabilities.map(value => String(value ?? '')).filter(Boolean)
    : []
  const groups =
    raw.capability_groups && typeof raw.capability_groups === 'object'
      ? Object.fromEntries(
          Object.entries(raw.capability_groups as Record<string, unknown>)
            .map(([key, value]) => [key, String(value ?? '').trim()] as const)
            .filter(([, value]) => Boolean(value)),
        )
      : {}
  const extraSkillRoots = Array.isArray(raw.extra_skill_roots)
    ? raw.extra_skill_roots.map(value => String(value ?? '')).filter(Boolean)
    : []
  const extraPluginRoots = Array.isArray(raw.extra_plugin_roots)
    ? raw.extra_plugin_roots.map(value => String(value ?? '')).filter(Boolean)
    : []
  return {
    disabled_capabilities: disabled,
    capability_groups: groups,
    extra_skill_roots: extraSkillRoots,
    extra_plugin_roots: extraPluginRoots,
  }
}

function capabilityDisabled(entry: LongclawCapabilityEntry): boolean {
  return Boolean(readMetadataBoolean(entry, 'disabled'))
}

function capabilityGroup(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'group')
}

function capabilityPath(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'path')
}

function capabilityConfigPath(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'config_path')
}

function capabilityManaged(entry: LongclawCapabilityEntry): boolean {
  return Boolean(readMetadataBoolean(entry, 'managed'))
}

function capabilityRegistryId(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'registry_id')
}

function capabilityHealth(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'health')
}

function taskFlowFilterForLaunch(record: LaunchRecord): TaskFlowFilter {
  if (record.status === 'failed') return 'failed'
  if (record.status === 'running') return 'running'
  return 'completed'
}

function taskFlowFilterForTask(task: LongclawTask): TaskFlowFilter {
  if (['queued', 'routing', 'running', 'blocked'].includes(task.status)) return 'running'
  if (['failed', 'canceled'].includes(task.status)) return 'failed'
  if (['needs_review', 'repair_required'].includes(task.status)) return 'pending'
  return 'completed'
}

function taskFlowFilterForRun(run: LongclawRun): TaskFlowFilter {
  if (['queued', 'routing', 'running', 'blocked'].includes(run.status)) return 'running'
  if (['failed', 'canceled', 'repair_required'].includes(run.status)) return 'failed'
  if (['partial'].includes(run.status)) return 'pending'
  return 'completed'
}

function taskFlowFilterForWorkItem(item: LongclawWorkItem): TaskFlowFilter {
  if (['critical', 'warning'].includes(item.severity)) return 'pending'
  if (['resolved', 'completed', 'succeeded'].includes(item.status)) return 'completed'
  return 'pending'
}

export function workModeAvailabilityNotice(
  locale: LongclawLocale,
  workMode: WorkMode,
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference = runtimeStatus.localRuntimeSeatPreference,
): string | undefined {
  if (workMode === 'local' && effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference) === 'unavailable') {
    return t(locale, 'notice.local_unavailable')
  }
  if (workMode === 'cloud_sandbox' && !runtimeStatus.longclawCoreConnected) {
    return t(locale, 'notice.cloud_unavailable')
  }
  if (
    workMode === 'weclaw_dispatch' &&
    (!runtimeStatus.longclawCoreConnected ||
      effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference) === 'unavailable')
  ) {
    return t(locale, 'notice.weclaw_unavailable')
  }
  return undefined
}

export function launchDisabledState(
  launchBusy: boolean,
  launchInput: string,
  selectedModeNotice?: string | null,
): { disabled: boolean; disabledReason?: string } {
  const disabled = launchBusy || launchInput.trim().length === 0 || Boolean(selectedModeNotice)
  return {
    disabled,
    disabledReason: disabled && selectedModeNotice ? selectedModeNotice : undefined,
  }
}

function looksLikeTransportFailure(message: string): boolean {
  return /fetch failed|ECONNREFUSED|EHOSTUNREACH|ENOTFOUND|ETIMEDOUT|network error/i.test(message)
}

export function formatLaunchFailureMessage(
  locale: LongclawLocale,
  error: unknown,
  runtimeStatus: RuntimeStatusSummary,
  _workMode: WorkMode,
): string {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const stackEnvPath = runtimeStatus.stackEnvPath?.trim() || '~/.longclaw/runtime-v2/stack.env'
  const controlPlaneBaseUrl = runtimeStatus.longclawCoreBaseUrl?.trim()
  const missingControlPlaneConfig = /Launch requires Hermes Agent OS/i.test(rawMessage)

  if (!missingControlPlaneConfig && !looksLikeTransportFailure(rawMessage)) {
    return rawMessage
  }

  if (locale === 'zh-CN') {
    if (controlPlaneBaseUrl) {
      return `Longclaw Core 不可达：${controlPlaneBaseUrl}。启动 Hermes Agent OS，或检查 ${stackEnvPath}。`
    }
    return `Longclaw Core 未配置。检查 ${stackEnvPath}。`
  }

  if (controlPlaneBaseUrl) {
    return `Longclaw Core is unreachable at ${controlPlaneBaseUrl}. Start Hermes Agent OS, or check ${stackEnvPath}.`
  }
  return `Longclaw Core is not configured. Check ${stackEnvPath}.`
}

function workModeAvailabilityState(
  locale: LongclawLocale,
  workMode: WorkMode,
  runtimeStatus: RuntimeStatusSummary,
  selected: boolean,
  localSeatPreference: LocalRuntimeSeatPreference = runtimeStatus.localRuntimeSeatPreference,
): { tone: string; label: string } {
  const unavailable = workModeAvailabilityNotice(
    locale,
    workMode,
    runtimeStatus,
    localSeatPreference,
  )
  if (unavailable) {
    return {
      tone: 'degraded',
      label: workMode === 'local' ? t(locale, 'state.unavailable') : t(locale, 'state.degraded'),
    }
  }
  if (selected) {
    return { tone: 'running', label: t(locale, 'state.ready') }
  }
  return { tone: 'open', label: t(locale, 'state.visible') }
}

function preferredHomeWorkMode(runtimeStatus: RuntimeStatusSummary): WorkMode {
  if (runtimeStatus.localRuntimeAvailable) return 'local'
  if (runtimeStatus.longclawCoreConnected) return 'cloud_sandbox'
  return 'local'
}

function formatModeMeta(parts: Array<string | undefined>): string | undefined {
  const values = parts.filter((part): part is string => Boolean(part && part.trim()))
  return values.length > 0 ? values.join(' · ') : undefined
}

function withMention(previous: string, mention: string): string {
  if (previous.includes(mention)) return previous
  const normalized = previous.trim()
  return normalized ? `${normalized} ${mention} ` : `${mention} `
}

function summarizeAgentResult(result: unknown): string {
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>
    if (typeof record.subtype === 'string') return humanizeToken(record.subtype)
    if (typeof record.ok === 'boolean') return record.ok ? 'Completed' : 'Needs Review'
  }
  return 'Completed'
}

function patchLaunchRecord(
  launches: LaunchRecord[],
  id: string | null,
  updater: (record: LaunchRecord) => LaunchRecord,
): LaunchRecord[] {
  if (!id) return launches
  return launches.map(record => (record.id === id ? updater(record) : record))
}

function launchStatus(value?: string | null): LaunchRecord['status'] {
  if (['queued', 'routing', 'running', 'blocked'].includes(String(value))) return 'running'
  if (['failed', 'canceled'].includes(String(value))) return 'failed'
  return 'succeeded'
}

function launchPromptFromTask(task: LongclawTask): string {
  const input = task.input as Record<string, unknown>
  return String(input.requested_outcome ?? input.query ?? input.raw_text ?? task.capability)
}

function launchRecordFromTask(task: LongclawTask): LaunchRecord {
  const metadata = task.metadata as Record<string, unknown>
  return {
    id: task.task_id,
    task_id: task.task_id,
    pack_id: typeof metadata.pack_id === 'string' ? metadata.pack_id : undefined,
    source: typeof metadata.launch_source === 'string' ? metadata.launch_source : undefined,
    prompt: launchPromptFromTask(task),
    status: launchStatus(task.status),
    started_at: task.created_at ?? task.updated_at ?? new Date().toISOString(),
    finished_at:
      launchStatus(task.status) === 'running'
        ? undefined
        : task.updated_at ?? task.created_at ?? undefined,
    text: '',
    tool_names: [],
    result_label: humanizeToken(String(metadata.last_run_status ?? task.status)),
    error: typeof metadata.error === 'string' ? metadata.error : undefined,
    work_mode: workModeFromTask(task),
    origin_surface: originSurfaceFromTask(task),
    interaction_surface: interactionSurfaceFromTask(task),
    runtime_profile: runtimeProfileFromRecord(task),
    runtime_target: runtimeTargetFromRecord(task),
    model_plane: modelPlaneFromRecord(task),
    local_runtime_seat: localRuntimeSeatFromRecord(task),
    execution_plane: executionPlaneFromTask(task),
    workspace_target: workspaceTargetFromTask(task),
  }
}

function launchRecordFromReceipt(receipt: LongclawLaunchReceipt): LaunchRecord {
  const taskMode = workModeFromTask(receipt.task)
  return {
    id: receipt.task.task_id,
    task_id: receipt.task.task_id,
    pack_id: receipt.pack_id,
    source:
      typeof receipt.metadata.launch_source === 'string'
        ? receipt.metadata.launch_source
        : typeof receipt.metadata.source === 'string'
          ? receipt.metadata.source
          : undefined,
    prompt: launchPromptFromTask(receipt.task),
    status: launchStatus(receipt.task.status),
    started_at: receipt.task.created_at ?? receipt.run.created_at ?? new Date().toISOString(),
    finished_at: receipt.run.finished_at ?? receipt.task.updated_at ?? undefined,
    text: receipt.run.summary ?? '',
    tool_names: [],
    result_label: humanizeToken(receipt.run.status),
    work_mode: taskMode ?? workModeFromRun(receipt.run),
    origin_surface: originSurfaceFromTask(receipt.task) ?? originSurfaceFromRun(receipt.run),
    interaction_surface:
      interactionSurfaceFromTask(receipt.task) ?? interactionSurfaceFromRun(receipt.run),
    runtime_profile:
      runtimeProfileFromRecord(receipt.task) ?? runtimeProfileFromRecord(receipt.run),
    runtime_target:
      runtimeTargetFromRecord(receipt.task) ?? runtimeTargetFromRecord(receipt.run),
    model_plane: modelPlaneFromRecord(receipt.task) ?? modelPlaneFromRecord(receipt.run),
    local_runtime_seat:
      localRuntimeSeatFromRecord(receipt.task) ?? localRuntimeSeatFromRecord(receipt.run),
    execution_plane:
      executionPlaneFromTask(receipt.task) ?? executionPlaneFromRun(receipt.run),
    workspace_target: workspaceTargetFromTask(receipt.task),
  }
}

function mergeLaunchRecords(
  localRecords: LaunchRecord[],
  taskRecords: LaunchRecord[],
): LaunchRecord[] {
  const merged = new Map<string, LaunchRecord>()
  for (const record of taskRecords) {
    merged.set(record.id, record)
  }
  for (const record of localRecords) {
    const existing = merged.get(record.id)
    merged.set(
      record.id,
      existing
        ? {
            ...existing,
            ...record,
            text: record.text || existing.text,
            tool_names:
              record.tool_names.length > 0 ? record.tool_names : existing.tool_names,
            result_label: record.result_label ?? existing.result_label,
            error: record.error ?? existing.error,
          }
        : record,
    )
  }
  return [...merged.values()].sort((left, right) =>
    String(right.started_at ?? '').localeCompare(String(left.started_at ?? '')),
  )
}

const LAUNCH_MENTION_RE = /(^|\s)@(pack|skill|plugin)\s+([^\s]+)/gi

function parseLaunchMentions(rawText: string): LongclawLaunchMention[] {
  const mentions: LongclawLaunchMention[] = []
  for (const match of rawText.matchAll(LAUNCH_MENTION_RE)) {
    mentions.push({
      kind: match[2].toLowerCase(),
      value: match[3],
      metadata: {},
    })
  }
  return mentions
}

function stripLaunchMentions(rawText: string): string {
  return rawText.replace(LAUNCH_MENTION_RE, ' ').replace(/\s+/g, ' ').trim()
}

function buildLaunchIntent(
  rawText: string,
  workspaceRoot: string,
  workMode: WorkMode,
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference,
): LongclawLaunchIntent {
  const mentions = parseLaunchMentions(rawText)
  const requestedOutcome = stripLaunchMentions(rawText)
  const firstPackMention = mentions.find(mention => mention.kind === 'pack')
  const firstPackId =
    firstPackMention && firstPackMention.value.includes('.')
      ? firstPackMention.value.split('.')[0]
      : firstPackMention?.value
  const spec = WORK_MODE_SPECS[workMode]
  const workspaceTarget =
    workMode === 'local'
      ? workspaceRoot || undefined
      : workMode === 'cloud_sandbox'
        ? 'sandbox://longclaw/default'
        : 'weclaw://active-thread'
  const runtimeProfile = effectiveRuntimeProfile(workMode, runtimeStatus, localSeatPreference)
  const localRuntimeSeat =
    workMode === 'local'
      ? effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference)
      : 'unavailable'

  return {
    source: 'electron_cowork',
    raw_text: rawText,
    mentions,
    requested_outcome: requestedOutcome || rawText.trim(),
    work_mode: workMode,
    launch_surface: spec.interactionSurface,
    created_at: new Date().toISOString(),
    interaction_surface: spec.interactionSurface,
    runtime_profile: runtimeProfile,
    runtime_target: spec.runtimeTarget,
    model_plane: spec.modelPlane,
    local_runtime_seat: localRuntimeSeat,
    workspace_target: workspaceTarget,
    session_context: {
      channel: 'desktop',
      user_id: 'desktop_operator',
      canonical_id: 'user:desktop_operator',
      canonical_session_id: 'session:desktop_operator',
      workspace_root: workspaceRoot || undefined,
    },
    delivery_preference: {
      policy_id: 'desktop_cowork',
      preferred_channels: spec.preferredChannels,
      fallback_channels: spec.fallbackChannels,
      windowed_proactive: false,
      desktop_fallback: true,
      requires_approval: false,
      metadata: {
        work_mode: workMode,
      },
    },
    metadata: {
      work_mode: workMode,
      launch_surface: spec.interactionSurface,
      origin_surface: spec.interactionSurface,
      interaction_surface: spec.interactionSurface,
      runtime_profile: runtimeProfile,
      runtime_target: spec.runtimeTarget,
      model_plane: spec.modelPlane,
      workspace_root: workspaceRoot || undefined,
      workspace_target: workspaceTarget,
      execution_plane: spec.runtimeTarget === 'cloud_runtime' ? 'cloud_executor' : 'local_executor',
      local_runtime_seat_preference: localSeatPreference,
      local_runtime_seat: localRuntimeSeat,
      dev_machine_acp_takeover: runtimeStatus.devMachineAcpTakeover,
      pack_id: firstPackId,
    },
  } as LongclawLaunchIntent
}

function launchPreview(record: LaunchRecord | null): string {
  if (!record) return ''
  if (record.error) return record.error
  if (!record.text.trim()) {
    if (record.tool_names.length > 0) {
      return `Tools: ${record.tool_names.join(', ')}`
    }
    return record.status === 'running'
      ? 'Waiting for the selected work mode to stream output.'
      : 'Launch finished without a text preview.'
  }
  return record.text.trim().slice(-720)
}

function threadIdFromTask(task: LongclawTask): string {
  return (
    task.session_id ??
    `${interactionSurfaceFromTask(task) ?? originSurfaceFromTask(task) ?? task.channel ?? 'session'}:${workspaceTargetFromTask(task) ?? task.capability}`
  )
}

function threadIdFromLaunch(record: LaunchRecord, taskMap: Map<string, LongclawTask>): string {
  if (record.task_id) {
    const task = taskMap.get(record.task_id)
    if (task) return threadIdFromTask(task)
  }
  return `${record.interaction_surface ?? record.origin_surface ?? record.source ?? 'session'}:${record.workspace_target ?? record.pack_id ?? record.id}`
}

function sortByTimestamp<T extends { latestAt?: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftValue = left.latestAt ? new Date(left.latestAt).getTime() : 0
    const rightValue = right.latestAt ? new Date(right.latestAt).getTime() : 0
    return rightValue - leftValue
  })
}

function deriveThreadSummaries(
  locale: LongclawLocale,
  launches: LaunchRecord[],
  tasks: LongclawTask[],
): ThreadSummary[] {
  const taskMap = new Map(tasks.map(task => [task.task_id, task]))
  const grouped = new Map<
    string,
    {
      task?: LongclawTask
      launches: LaunchRecord[]
      latestAt?: string
      status: string
    }
  >()

  for (const task of tasks) {
    const id = threadIdFromTask(task)
    grouped.set(id, {
      task,
      launches: [],
      latestAt: task.updated_at ?? task.created_at ?? undefined,
      status: task.status,
    })
  }

  for (const launch of launches) {
    const id = threadIdFromLaunch(launch, taskMap)
    const bucket = grouped.get(id) ?? {
      launches: [],
      latestAt: launch.finished_at ?? launch.started_at,
      status: launch.status,
    }
    bucket.launches.push(launch)
    const launchTime = launch.finished_at ?? launch.started_at
    if (!bucket.latestAt || new Date(launchTime).getTime() >= new Date(bucket.latestAt).getTime()) {
      bucket.latestAt = launchTime
      bucket.status = launch.status
    }
    grouped.set(id, bucket)
  }

  return sortByTimestamp(
    [...grouped.entries()].map(([id, bucket]) => {
      const leadLaunch = bucket.launches[0]
      const leadTask = bucket.task
      const prompt =
        leadLaunch?.prompt ||
        stringValue(leadTask?.input.requested_outcome) ||
        stringValue(leadTask?.input.raw_text) ||
        undefined
      const title =
        prompt?.trim().slice(0, 52) ||
        (leadTask
          ? `${humanizeWorkMode(locale, workModeFromTask(leadTask) ?? 'cloud_sandbox')} · ${humanizeTokenLocale(locale, leadTask.capability)}`
          : humanizeTokenLocale(locale, leadLaunch?.pack_id ?? 'launch'))
      const workMode = leadLaunch?.work_mode ?? workModeFromTask(leadTask ?? ({} as LongclawTask))
      return {
        id,
        title,
        subtitle: formatModeMeta([
          workMode ? humanizeWorkMode(locale, workMode) : undefined,
          leadLaunch?.runtime_target
            ? humanizeTokenLocale(locale, leadLaunch.runtime_target)
            : leadTask && runtimeTargetFromRecord(leadTask)
              ? humanizeTokenLocale(locale, runtimeTargetFromRecord(leadTask))
              : undefined,
          leadLaunch?.interaction_surface
            ? humanizeTokenLocale(locale, leadLaunch.interaction_surface)
            : leadTask && interactionSurfaceFromTask(leadTask)
              ? humanizeTokenLocale(locale, interactionSurfaceFromTask(leadTask))
              : undefined,
        ]),
        latestAt: bucket.latestAt,
        status: bucket.status,
        workMode,
        sessionId: leadTask?.session_id ?? undefined,
        workspaceTarget:
          leadLaunch?.workspace_target ?? (leadTask ? workspaceTargetFromTask(leadTask) : undefined),
        localRuntimeSeat:
          leadLaunch?.local_runtime_seat ??
          (leadTask ? localRuntimeSeatFromRecord(leadTask) : undefined),
        itemCount: bucket.launches.length + (leadTask ? 1 : 0),
      }
    }),
  )
}

function deriveConversationEvents(
  locale: LongclawLocale,
  threadId: string | null,
  threads: ThreadSummary[],
  launches: LaunchRecord[],
  tasks: LongclawTask[],
  runs: LongclawRun[],
  workItems: LongclawWorkItem[],
): ConversationEvent[] {
  if (!threadId) return []
  const taskMap = new Map(tasks.map(task => [task.task_id, task]))
  const runMap = new Map(runs.map(run => [run.run_id, run]))

  const threadTaskIds = tasks.filter(task => threadIdFromTask(task) === threadId).map(task => task.task_id)
  const taskIdSet = new Set(threadTaskIds)
  const launchesInThread = launches.filter(record => threadIdFromLaunch(record, taskMap) === threadId)
  for (const launch of launchesInThread) {
    if (launch.task_id) taskIdSet.add(launch.task_id)
  }

  const tasksInThread = tasks.filter(task => taskIdSet.has(task.task_id))
  const runIdSet = new Set<string>()
  for (const task of tasksInThread) {
    task.run_ids.forEach(runId => runIdSet.add(runId))
    if (task.last_run_id) runIdSet.add(task.last_run_id)
  }
  const runsInThread = runs.filter(run => (run.task_id ? taskIdSet.has(run.task_id) : runIdSet.has(run.run_id)))
  runsInThread.forEach(run => runIdSet.add(run.run_id))
  const workItemsInThread = workItems.filter(item => (item.run_id ? runIdSet.has(item.run_id) : false))

  const events: ConversationEvent[] = []

  for (const launch of launchesInThread) {
    const spec = workModeSpecFromValue(locale, launch.work_mode)
    events.push({
      id: `launch:${launch.id}`,
      type: 'user_launch',
      timestamp: launch.started_at,
      status: launch.status,
      title: launch.prompt,
      body: launch.text?.trim() ? launch.text.trim().slice(-240) : undefined,
      meta: formatModeMeta([
        spec?.label,
        launch.runtime_target ? humanizeTokenLocale(locale, launch.runtime_target) : undefined,
        launch.local_runtime_seat
          ? humanizeTokenLocale(locale, launch.local_runtime_seat)
          : undefined,
      ]),
      workMode: launch.work_mode,
      runtimeProfile: launch.runtime_profile,
      runtimeTarget: launch.runtime_target,
      interactionSurface: launch.interaction_surface,
      localRuntimeSeat: launch.local_runtime_seat,
      launch,
    })
  }

  for (const task of tasksInThread) {
    const workMode = workModeFromTask(task)
    const spec = workMode ? localizedWorkModeSpec(locale, workMode as WorkMode) : null
    events.push({
      id: `task:${task.task_id}`,
      type: 'task_receipt',
      timestamp: task.updated_at ?? task.created_at ?? new Date().toISOString(),
      status: task.status,
      title: spec ? `${spec.label} receipt` : `Task ${task.task_id}`,
      body:
        stringValue(task.input.requested_outcome) ||
        stringValue(task.input.raw_text) ||
        humanizeTokenLocale(locale, task.capability),
      meta: formatModeMeta([
        humanizeTokenLocale(locale, task.capability),
        runtimeTargetFromRecord(task)
          ? humanizeTokenLocale(locale, runtimeTargetFromRecord(task))
          : undefined,
        localRuntimeSeatFromRecord(task)
          ? humanizeTokenLocale(locale, localRuntimeSeatFromRecord(task))
          : undefined,
      ]),
      workMode,
      runtimeProfile: runtimeProfileFromRecord(task),
      runtimeTarget: runtimeTargetFromRecord(task),
      interactionSurface: interactionSurfaceFromTask(task),
      localRuntimeSeat: localRuntimeSeatFromRecord(task),
      task,
    })
  }

  for (const run of runsInThread) {
    events.push({
      id: `run:${run.run_id}`,
      type: 'run_receipt',
      timestamp: run.started_at ?? run.created_at,
      status: run.status,
      title: run.summary || `Run ${run.run_id}`,
      body: humanizeTokenLocale(locale, run.capability),
      meta: formatModeMeta([
        humanizeTokenLocale(locale, run.pack_id ?? run.domain),
        runtimeTargetFromRecord(run)
          ? humanizeTokenLocale(locale, runtimeTargetFromRecord(run))
          : undefined,
        localRuntimeSeatFromRecord(run)
          ? humanizeTokenLocale(locale, localRuntimeSeatFromRecord(run))
          : undefined,
      ]),
      workMode: workModeFromRun(run),
      runtimeProfile: runtimeProfileFromRecord(run),
      runtimeTarget: runtimeTargetFromRecord(run),
      interactionSurface: interactionSurfaceFromRun(run),
      localRuntimeSeat: localRuntimeSeatFromRecord(run),
      run,
    })
  }

  for (const item of workItemsInThread) {
    events.push({
      id: `work-item:${item.work_item_id}`,
      type: 'work_item_receipt',
      timestamp: item.updated_at ?? item.created_at ?? new Date().toISOString(),
      status: item.severity,
      title: item.title,
      body: item.summary,
      meta: formatModeMeta([
        humanizeTokenLocale(locale, item.pack_id),
        runtimeTargetFromRecord(item)
          ? humanizeTokenLocale(locale, runtimeTargetFromRecord(item))
          : undefined,
        localRuntimeSeatFromRecord(item)
          ? humanizeTokenLocale(locale, localRuntimeSeatFromRecord(item))
          : undefined,
      ]),
      workMode: workModeFromWorkItem(item),
      runtimeProfile: runtimeProfileFromRecord(item),
      runtimeTarget: runtimeTargetFromRecord(item),
      interactionSurface: interactionSurfaceFromWorkItem(item),
      localRuntimeSeat: localRuntimeSeatFromRecord(item),
      workItem: item,
    })
  }

  return [...events].sort((left, right) => {
    const leftValue = new Date(left.timestamp).getTime()
    const rightValue = new Date(right.timestamp).getTime()
    return leftValue - rightValue
  })
}

function ArtifactList({
  locale,
  artifacts,
  onOpen,
  onPreview,
}: {
  locale: LongclawLocale
  artifacts: LongclawArtifact[]
  onOpen: (uri: string) => Promise<void>
  onPreview: (uri: string) => Promise<void>
}) {
  if (artifacts.length === 0) {
    return <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_artifacts')}</div>
  }

  return (
    <div style={utilityStyles.stackedList}>
      {artifacts.map(artifact => (
        <div key={artifact.artifact_id} style={surfaceStyles.listRow}>
          <div style={queueRowLeadStyle}>
            <div style={queueRowTitleStyle}>
              {artifact.title || humanizeTokenLocale(locale, artifact.kind)}
            </div>
            <div style={chromeStyles.monoMeta}>{artifact.uri}</div>
          </div>
          <div style={utilityStyles.buttonCluster}>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                void onOpen(artifact.uri)
              }}
            >
              {t(locale, 'action.open')}
            </button>
            {isTextPreviewable(artifact.uri) && (
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  void onPreview(artifact.uri)
                }}
              >
                {t(locale, 'action.preview')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ArtifactRefList({
  locale,
  items,
  onOpen,
  onPreview,
}: {
  locale: LongclawLocale
  items: Array<{ kind: string; uri: string; title: string }>
  onOpen: (uri: string) => Promise<void>
  onPreview: (uri: string) => Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <div style={utilityStyles.stackedList}>
      {items.map(item => (
        <div key={`${item.kind}-${item.uri}`} style={surfaceStyles.listRow}>
          <div style={queueRowLeadStyle}>
            <div style={queueRowTitleStyle}>{item.title}</div>
            <div style={chromeStyles.monoMeta}>{item.uri}</div>
          </div>
          <div style={utilityStyles.buttonCluster}>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                void onOpen(item.uri)
              }}
            >
              {t(locale, 'action.open')}
            </button>
            {isTextPreviewable(item.uri) && (
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  void onPreview(item.uri)
                }}
              >
                {t(locale, 'action.preview')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function WeclawAttachmentList({
  locale,
  attachments,
  onOpen,
}: {
  locale: LongclawLocale
  attachments: WeclawSessionAttachment[]
  onOpen: (uri: string) => Promise<void>
}) {
  if (attachments.length === 0) return null

  return (
    <div style={utilityStyles.stackedList}>
      {attachments.map(attachment => {
        const uri = weclawAttachmentUri(attachment)
        return (
          <div key={attachment.attachmentId} style={surfaceStyles.listRow}>
            <div style={queueRowLeadStyle}>
              <div style={queueRowTitleStyle}>{attachment.title}</div>
              <div style={chromeStyles.quietMeta}>
                {formatModeMeta([
                  humanizeTokenLocale(locale, attachment.kind),
                  attachment.mimeType,
                  attachment.messageId ? `#${attachment.messageId}` : undefined,
                ])}
              </div>
              {uri && <div style={chromeStyles.monoMeta}>{uri}</div>}
              {attachment.text && <div style={queueRowDescriptionStyle}>{attachment.text}</div>}
            </div>
            {uri && (
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  void onOpen(uri)
                }}
              >
                {t(locale, 'action.open')}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CapabilityChip({
  item,
  onUse,
}: {
  item: CapabilityItem
  onUse: (item: CapabilityItem) => void
}) {
  return (
    <button
      type="button"
      style={capabilityChipStyle(item.kind)}
      onClick={() => onUse(item)}
      title={item.description}
    >
      <div style={capabilityChipBodyStyle}>
        <div style={capabilityChipLabelStyle}>{item.label}</div>
        <div style={capabilityChipHintStyle}>{item.hint}</div>
      </div>
      <span style={statusBadgeStyle(item.kind === 'pack' ? 'running' : 'open')}>
        {item.kind === 'pack' ? '@pack' : item.kind === 'plugin' ? '@plugin' : '@skill'}
      </span>
    </button>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>('strategy')
  const [overview, setOverview] = useState<LongclawControlPlaneOverview | null>(null)
  const [runs, setRuns] = useState<LongclawRun[]>([])
  const [workItems, setWorkItems] = useState<LongclawWorkItem[]>([])
  const [dashboard, setDashboard] = useState<LongclawPackDashboard | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  const [selectedArtifacts, setSelectedArtifacts] = useState<LongclawArtifact[]>([])
  const previousPageRef = useRef<Page>('strategy')
  const [preview, setPreview] = useState<{ uri: string; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [taskFlowFilter, setTaskFlowFilter] = useState<TaskFlowFilter>('all')
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight)
  const [threadSidebarOpen, setThreadSidebarOpen] = useState(() => window.innerWidth >= 1080)
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [agentMode, setAgentMode] = useState<AgentModeInfo | null>(null)
  const [agentCwd, setAgentCwd] = useState('')
  const [substrateSummary, setSubstrateSummary] =
    useState<LongclawCapabilitySubstrateSummary | null>(null)
  const [capabilityManagerSettings, setCapabilityManagerSettings] =
    useState<CapabilityManagerSettings>(defaultCapabilityManagerSettings())
  const [capabilityRegistry, setCapabilityRegistry] = useState<RuntimeCapabilityRegistry>({
    version: 1,
    updated_at: '',
    entries: [],
  })
  const [launchTasks, setLaunchTasks] = useState<LongclawTask[]>([])
  const [weclawSessions, setWeclawSessions] = useState<WeclawSessionSummary[]>([])
  const [weclawSessionSourceStatus, setWeclawSessionSourceStatus] =
    useState<WeclawSessionSourceStatus | null>(null)
  const [wechatBindingStatus, setWechatBindingStatus] =
    useState<WeChatBindingStatus | null>(null)
  const [wechatRouteReceipts, setWechatRouteReceipts] = useState<WeChatRouteReceipt[]>([])
  const [pluginDevIssues, setPluginDevIssues] = useState<PluginDevIssue[]>([])
  const [locale, setLocale] = useState<LongclawLocale>(() => {
    try {
      return window.localStorage.getItem('longclaw.locale') === 'en-US' ? 'en-US' : 'zh-CN'
    } catch {
      return 'zh-CN'
    }
  })
  const [localSeatPreference, setLocalSeatPreference] = useState<LocalRuntimeSeatPreference>(() => {
    try {
      return normalizeLocalRuntimeSeatPreference(
        window.localStorage.getItem('longclaw.localRuntimeSeatPreference'),
      )
    } catch {
      return 'auto'
    }
  })
  const [selectedWorkMode, setSelectedWorkMode] = useState<WorkMode>('local')
  const [launchInput, setLaunchInput] = useState('')
  const [launchBusy, setLaunchBusy] = useState(false)
  const [launches, setLaunches] = useState<LaunchRecord[]>([])
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [selectedWeclawSessionId, setSelectedWeclawSessionId] = useState<string | null>(null)
  const [executionJumpContext, setExecutionJumpContext] =
    useState<WeclawExecutionJumpContext | null>(null)
  const [wechatSearch, setWechatSearch] = useState('')
  const [wechatSourceFilter, setWechatSourceFilter] =
    useState<WeclawSessionSourceFilter>('all')
  const [wechatVisibilityFilter, setWechatVisibilityFilter] =
    useState<WeclawSessionVisibilityFilter>('active')
  const [extraSkillRootDraft, setExtraSkillRootDraft] = useState('')
  const [extraPluginRootDraft, setExtraPluginRootDraft] = useState('')
  const [managedSkillPathDraft, setManagedSkillPathDraft] = useState('')
  const [managedPluginPathDraft, setManagedPluginPathDraft] = useState('')
  const activeLaunchIdRef = useRef<string | null>(null)
  const workModeTouchedRef = useRef(false)

  const viewportTier = getViewportTier(viewportWidth)
  const shellLayout = useMemo(
    () => createShellLayout(viewportWidth, viewportTier, threadSidebarOpen, Boolean(selected)),
    [selected, threadSidebarOpen, viewportTier, viewportWidth],
  )
  const isFullBleedPackPage = page === 'strategy' || page === 'backtest'
  const isWeChatPage = page === 'wechat'
  const hideContextSidebar = isFullBleedPackPage || page === 'execution' || page === 'factory' || page === 'wechat'
  const wechatBound = wechatBindingStatus?.state === 'bound'
  const wechatIdentityReady = wechatBindingStatus?.identity_status === 'ilink_verified'
  const runtimeStatus = useMemo(
    () => runtimeStatusFromSummary(substrateSummary),
    [substrateSummary],
  )
  const localizedDashboardNotice = useMemo(
    () => localizePackNotice(locale, dashboard?.notice),
    [dashboard?.notice, locale],
  )
  const filteredWeclawSessions = useMemo(() => {
    const query = wechatSearch.trim().toLowerCase()
    return weclawSessions.filter(session => {
      if (wechatVisibilityFilter === 'active' && (session.hidden || session.archived)) return false
      if (wechatVisibilityFilter === 'hidden' && !session.hidden) return false
      if (wechatVisibilityFilter === 'archived' && !session.archived) return false
      if (
        wechatSourceFilter === 'wechat' &&
        !session.sourceLabel.toLowerCase().includes('wechat')
      ) {
        return false
      }
      if (
        wechatSourceFilter === 'weclaw' &&
        !session.sourceLabel.toLowerCase().includes('weclaw')
      ) {
        return false
      }
      if (!query) return true
      const haystack = [
        session.title,
        session.preview,
        session.userId,
        session.sessionId,
        session.canonicalSessionId,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [weclawSessions, wechatSearch, wechatSourceFilter, wechatVisibilityFilter])
  const managedRegistryEntries = useMemo(
    () => capabilityRegistry.entries.filter(entry => entry.removable),
    [capabilityRegistry.entries],
  )

  useEffect(() => {
    try {
      window.localStorage.setItem('longclaw.locale', locale)
    } catch {
      // ignore storage failures in constrained environments
    }
    if (window.longclawWindow) {
      void window.longclawWindow.setLocale(locale)
    }
  }, [locale])

  useEffect(() => {
    if (workModeTouchedRef.current) return
    const preferredMode = preferredHomeWorkMode(runtimeStatus)
    if (preferredMode !== selectedWorkMode) {
      setSelectedWorkMode(preferredMode)
    }
  }, [
    runtimeStatus.localRuntimeAvailable,
    runtimeStatus.longclawCoreConnected,
    selectedWorkMode,
  ])

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await window.longclawControlPlane.getOverview())
    } catch {
      setOverview(null)
      throw new Error(t(locale, 'error.overview_unavailable'))
    }
  }, [locale])

  const loadRuns = useCallback(async () => {
    try {
      setRuns(await window.longclawControlPlane.listRuns())
    } catch {
      setRuns([])
      throw new Error(t(locale, 'error.runs_unavailable'))
    }
  }, [locale])

  const loadWorkItems = useCallback(async () => {
    try {
      setWorkItems(await window.longclawControlPlane.listWorkItems())
    } catch {
      setWorkItems([])
      throw new Error(t(locale, 'error.work_items_unavailable'))
    }
  }, [locale])

  const loadDashboard = useCallback(async (targetPack: PackTab) => {
    try {
      setDashboard(await window.longclawControlPlane.getPackDashboard(targetPack))
    } catch {
      setDashboard(null)
      throw new Error(
        tf(locale, 'error.pack_dashboard_unavailable', {
          pack: humanizeTokenLocale(locale, targetPack),
        }),
      )
    }
  }, [locale])

  const loadLaunchTasks = useCallback(async () => {
    try {
      setLaunchTasks(await window.longclawLaunch.listTasks(8))
    } catch {
      setLaunchTasks([])
      throw new Error(t(locale, 'error.launch_history_unavailable'))
    }
  }, [locale])

  const loadWeclawSessions = useCallback(async () => {
    try {
      setWeclawSessions(await window.weclawSessions.listWeclawSessions())
    } catch {
      setWeclawSessions([])
      throw new Error(t(locale, 'error.weclaw_sessions_unavailable'))
    }
  }, [locale])

  const loadWeclawSessionSourceStatus = useCallback(async () => {
    try {
      setWeclawSessionSourceStatus(await window.weclawSessions.getStatus())
    } catch {
      setWeclawSessionSourceStatus(null)
    }
  }, [])

  const loadWechatRuntime = useCallback(async () => {
    const [bindingResult, receiptResult, issueResult] = await Promise.allSettled([
      window.longclawWechat.getBindingStatus(),
      window.longclawPluginDev.listReceipts(),
      window.longclawPluginDev.listIssues(),
    ])
    if (bindingResult.status === 'fulfilled') setWechatBindingStatus(bindingResult.value)
    if (receiptResult.status === 'fulfilled') setWechatRouteReceipts(receiptResult.value)
    if (issueResult.status === 'fulfilled') setPluginDevIssues(issueResult.value)
  }, [])

  useEffect(() => {
    if (page !== 'wechat' || wechatBindingStatus?.state !== 'qr_pending') return undefined
    const timer = window.setInterval(() => {
      void loadWechatRuntime()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [loadWechatRuntime, page, wechatBindingStatus?.state])

  const loadCapabilitySubstrate = useCallback(async (): Promise<RuntimeStatusSummary | null> => {
    const [summaryResult, modeResult, cwdResult, skillsResult, settingsResult, registryResult] =
      await Promise.allSettled([
        window.longclawCapabilitySubstrate.getSummary(),
        window.agentAPI.getMode(),
        window.agentAPI.getCwd(),
        window.agentAPI.getSkills(),
        window.longclawCapabilityManager.getSettings(),
        window.longclawCapabilityManager.getRegistry(),
      ])
    let nextRuntimeStatus: RuntimeStatusSummary | null = null

    if (summaryResult.status === 'fulfilled') {
      nextRuntimeStatus = runtimeStatusFromSummary(summaryResult.value)
      setSubstrateSummary(summaryResult.value)
      setCapabilityManagerSettings(capabilityManagerSettingsFromSummary(summaryResult.value))
      setSkills(
        summaryResult.value.skills.map(skill => ({
          name: skill.label,
          path: String(skill.metadata.path ?? ''),
          description: skill.description,
          project:
            typeof skill.metadata.project === 'string' ? skill.metadata.project : undefined,
        })),
      )
    } else {
      setSubstrateSummary(null)
      if (skillsResult.status === 'fulfilled') setSkills(skillsResult.value)
    }
    if (settingsResult.status === 'fulfilled') {
      setCapabilityManagerSettings(settingsResult.value)
    }
    if (registryResult.status === 'fulfilled') {
      setCapabilityRegistry(registryResult.value)
    }
    if (modeResult.status === 'fulfilled') setAgentMode(modeResult.value)
    else if (summaryResult.status === 'fulfilled') {
      const mode = summaryResult.value.metadata.agent_mode
      if (typeof mode === 'string' && mode) {
        setAgentMode({ mode, alive: false })
      }
    }
    if (cwdResult.status === 'fulfilled') setAgentCwd(cwdResult.value)
    else if (summaryResult.status === 'fulfilled') {
      const cwd = summaryResult.value.metadata.cwd
      if (typeof cwd === 'string') setAgentCwd(cwd)
    }
    return nextRuntimeStatus
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem('longclaw.localRuntimeSeatPreference', localSeatPreference)
    } catch {
      // ignore storage failures in constrained environments
    }
    void window.longclawRuntime
      .setLocalSeatPreference(localSeatPreference)
      .then(() => loadCapabilitySubstrate())
      .catch(() => {
        // ignore runtime preference sync failures; substrate refresh will surface status later
      })
  }, [localSeatPreference, loadCapabilitySubstrate])

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth)
      setViewportHeight(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (viewportTier !== 'narrow') {
      setThreadSidebarOpen(true)
    }
  }, [viewportTier])

  useEffect(() => {
    if (!selected) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selected])

  useEffect(() => {
    if (previousPageRef.current === page) return
    previousPageRef.current = page
    setSelected(null)
    setSelectedArtifacts([])
  }, [page])

  useEffect(() => {
    const releaseText = window.agentAPI.onText(text => {
      setLaunches(previous =>
        patchLaunchRecord(previous, activeLaunchIdRef.current, record => ({
          ...record,
          text: record.text + text,
        })),
      )
    })
    const releaseTool = window.agentAPI.onTool(tool => {
      setLaunches(previous =>
        patchLaunchRecord(previous, activeLaunchIdRef.current, record => ({
          ...record,
          tool_names: record.tool_names.includes(tool.name)
            ? record.tool_names
            : [...record.tool_names, tool.name],
        })),
      )
    })
    const releaseResult = window.agentAPI.onResult(result => {
      const activeId = activeLaunchIdRef.current
      activeLaunchIdRef.current = null
      setLaunchBusy(false)
      setLaunches(previous =>
        patchLaunchRecord(previous, activeId, record => ({
          ...record,
          status: record.status === 'failed' ? 'failed' : 'succeeded',
          finished_at: new Date().toISOString(),
          result_label: summarizeAgentResult(result),
        })),
      )
      void loadCapabilitySubstrate()
    })
    const releaseError = window.agentAPI.onError(message => {
      const activeId = activeLaunchIdRef.current
      activeLaunchIdRef.current = null
      setLaunchBusy(false)
      setError(message)
      setLaunches(previous =>
        patchLaunchRecord(previous, activeId, record => ({
          ...record,
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message,
        })),
      )
      void loadCapabilitySubstrate()
    })

    return () => {
      releaseText()
      releaseTool()
      releaseResult()
      releaseError()
    }
  }, [loadCapabilitySubstrate])

  const refresh = useCallback(
    async (targetPage: Page = page) => {
      recordObservationEvent('app.refresh.start', { page: targetPage })
      setLoading(true)
      setError(null)
      if (targetPage === 'strategy') {
        await Promise.allSettled([
          loadDashboard('signals'),
          loadRuns(),
          loadWorkItems(),
          loadLaunchTasks(),
          loadCapabilitySubstrate(),
        ])
      }
      if (targetPage === 'backtest') {
        await Promise.allSettled([loadDashboard('signals'), loadCapabilitySubstrate()])
      }
      if (targetPage === 'execution') {
        await Promise.allSettled([
          loadDashboard('due_diligence'),
          loadOverview(),
          loadRuns(),
          loadWorkItems(),
          loadLaunchTasks(),
          loadCapabilitySubstrate(),
        ])
      }
      if (targetPage === 'wechat') {
        await Promise.allSettled([
          loadRuns(),
          loadLaunchTasks(),
          loadWorkItems(),
          loadWeclawSessions(),
          loadWeclawSessionSourceStatus(),
          loadWechatRuntime(),
          loadCapabilitySubstrate(),
        ])
      }
      if (targetPage === 'factory') {
        await Promise.allSettled([
          loadOverview(),
          loadLaunchTasks(),
          loadWechatRuntime(),
          loadCapabilitySubstrate(),
          loadDashboard('signals'),
        ])
      }
      setLoading(false)
      recordObservationEvent('app.refresh.finish', { page: targetPage })
    },
    [
      loadCapabilitySubstrate,
      loadDashboard,
      loadLaunchTasks,
      loadOverview,
      loadRuns,
      loadWechatRuntime,
      loadWeclawSessionSourceStatus,
      loadWeclawSessions,
      loadWorkItems,
      page,
    ],
  )

  useEffect(() => {
    recordObservationEvent('app.page.visible', { page })
    void refresh(page)
  }, [page, refresh])

  useEffect(() => {
    const intervalMs = page === 'strategy' || page === 'execution' ? 10_000 : 15_000
    const timer = window.setInterval(() => {
      void refresh(page)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [page, refresh])

  const openRun = useCallback(async (run: LongclawRun) => {
    setSelected({
      type: 'run',
      title: run.summary || run.run_id,
      run,
      actions: [],
    })
    setPreview(null)
    try {
      setSelectedArtifacts(await window.longclawControlPlane.listArtifacts(run.run_id, run.domain))
    } catch {
      setSelectedArtifacts([])
    }
  }, [])

  const openWorkItem = useCallback((workItem: LongclawWorkItem) => {
    setSelected({
      type: 'work_item',
      title: workItem.title,
      workItem,
    })
    setSelectedArtifacts([])
    setPreview(null)
  }, [])

  const openRecord = useCallback(
    (
      title: string,
      record: Record<string, unknown>,
      actions: LongclawOperatorAction[] = [],
    ) => {
      setSelected({ type: 'record', title, record, actions })
      setSelectedArtifacts([])
      setPreview(null)
    },
    [],
  )

  const openWeclawSession = useCallback(async (sessionId: string) => {
    try {
      const session = await window.weclawSessions.getWeclawSession(sessionId)
      if (!session) {
        setError(t(locale, 'error.weclaw_session_unavailable'))
        return
      }
      setSelected({
        type: 'weclaw_session',
        title: session.title,
        session,
      })
      setSelectedWeclawSessionId(session.sessionId)
      setSelectedArtifacts([])
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [locale])

  const runAction = useCallback(
    async (action: LongclawOperatorAction) => {
      setActionMessage(null)
      try {
        if (['open_path', 'open_url', 'copy_value'].includes(action.kind)) {
          await window.longclawControlPlane.performLocalAction(action)
          setActionMessage(`${action.label} completed`)
          return
        }
        if (!runtimeStatus.longclawCoreConnected) {
          setActionMessage(
            'This action needs Longclaw Core connectivity. The client is currently running in degraded mode.',
          )
          return
        }
        const result = await window.longclawControlPlane.executeAction(
          action.action_id,
          action.payload,
        )
        setActionMessage(`${action.label} completed`)
        if (result?.result && typeof result.result === 'object' && 'run' in result.result) {
          const runResult = result.result as { run?: LongclawRun }
          if (runResult.run) {
            await openRun(runResult.run)
          }
        }
        await refresh(page)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [openRun, page, refresh, runtimeStatus.longclawCoreConnected],
  )

  const openArtifact = useCallback(async (uri: string) => {
    const kind =
      uri.startsWith('http://') || uri.startsWith('https://')
        ? 'open_url'
        : uri.startsWith('/')
          ? 'open_path'
          : 'copy_value'
    const payload =
      kind === 'open_url'
        ? { url: uri }
        : kind === 'open_path'
          ? { path: uri }
          : { value: uri }
    await window.longclawControlPlane.performLocalAction({ kind, payload })
  }, [])

  const previewArtifact = useCallback(async (uri: string) => {
    const result = await window.longclawControlPlane.readArtifactPreview(uri)
    if (result.ok && result.text) {
      setPreview({ uri, text: result.text })
    } else if (result.reason === 'too_large') {
      setError(`Preview skipped: file exceeds 256KB (${result.size ?? 0} bytes)`)
    } else {
      setError('Preview unavailable for this artifact')
    }
  }, [])

  const selectedWeclawLinkedRecords = useMemo(() => {
    if (selected?.type !== 'weclaw_session') {
      return {
        tasks: [] as LongclawTask[],
        runs: [] as LongclawRun[],
        workItems: [] as LongclawWorkItem[],
      }
    }
    const canonicalSessionId = weclawCanonicalSessionId(selected.session)
    if (!canonicalSessionId) {
      return {
        tasks: [] as LongclawTask[],
        runs: [] as LongclawRun[],
        workItems: [] as LongclawWorkItem[],
      }
    }
    return {
      tasks: launchTasks
        .filter(
          task => recordSessionId(task as unknown as Record<string, unknown>) === canonicalSessionId,
        )
        .slice(0, 3),
      runs: runs
        .filter(
          run => recordSessionId(run as unknown as Record<string, unknown>) === canonicalSessionId,
        )
        .slice(0, 3),
      workItems: workItems
        .filter(
          item => recordSessionId(item as unknown as Record<string, unknown>) === canonicalSessionId,
        )
        .slice(0, 3),
    }
  }, [launchTasks, runs, selected, workItems])

  const priorityWorkItems = useMemo(
    () =>
      [...workItems]
        .filter(item => ['critical', 'warning'].includes(item.severity))
        .sort((left, right) => severityRank(left.severity) - severityRank(right.severity))
        .slice(0, 6),
    [workItems],
  )

  const packCapabilities = useMemo<CapabilityItem[]>(
    () =>
      (substrateSummary?.flagship_packs ?? overview?.packs ?? []).map(pack => ({
        id: `pack:${pack.pack_id}`,
        label: packLabel(locale, pack.pack_id),
        kind: 'pack',
        mention: `@pack ${pack.pack_id}`,
        hint: humanizeTokenLocale(locale, pack.runtime),
        description: pack.description,
      })),
    [locale, overview, substrateSummary],
  )

  const managedSkillEntries = useMemo<LongclawCapabilityEntry[]>(
    () =>
      substrateSummary?.skills ??
      skills.map(skill => ({
        capability_id: `skill:${skill.project ?? 'workspace'}:${skill.name}`,
        kind: 'skill',
        label: skill.name,
        mention: `@skill ${skill.name}`,
        source: 'filesystem',
        description: skill.description,
        summary: skill.project ?? 'workspace',
        owner: skill.project ?? null,
        curated: false,
        provisional: true,
        metadata: {
          path: skill.path,
          project: skill.project ?? null,
          disabled: capabilityManagerSettings.disabled_capabilities.includes(
            `skill:${skill.project ?? 'workspace'}:${skill.name}`,
          ),
          group:
            capabilityManagerSettings.capability_groups[
              `skill:${skill.project ?? 'workspace'}:${skill.name}`
            ] ?? null,
          config_path: skill.path,
        },
      })),
    [capabilityManagerSettings, skills, substrateSummary?.skills],
  )

  const managedPluginEntries = useMemo<LongclawCapabilityEntry[]>(
    () => substrateSummary?.plugins ?? [],
    [substrateSummary?.plugins],
  )

  const skillCapabilities = useMemo<CapabilityItem[]>(
    () =>
      managedSkillEntries
        .filter(skill => !capabilityDisabled(skill))
        .slice(0, 8)
        .map(skill => ({
            id: skill.capability_id,
            label: skill.label,
            kind: 'skill',
            mention: skill.mention,
            hint:
              skill.summary || (skill.owner ? humanizeToken(skill.owner) : 'Workspace skill'),
            description: skill.description,
          })),
    [managedSkillEntries],
  )

  const pluginCapabilities = useMemo<CapabilityItem[]>(
    () =>
      managedPluginEntries
        .filter(plugin => !capabilityDisabled(plugin))
        .slice(0, 4)
        .map(plugin => ({
        id: plugin.capability_id,
        label: plugin.label,
        kind: 'plugin',
        mention: plugin.mention,
        hint: plugin.summary || 'Capability plugin',
        description: plugin.description,
      })),
    [managedPluginEntries],
  )

  const modeAwareCapabilities = useMemo(() => {
    const localPreferred = [...skillCapabilities, ...pluginCapabilities, ...packCapabilities].slice(
      0,
      6,
    )
    const cloudPreferred = [...packCapabilities, ...pluginCapabilities, ...skillCapabilities].slice(
      0,
      6,
    )
    const weclawPreferred = [...packCapabilities, ...skillCapabilities, ...pluginCapabilities].slice(
      0,
      6,
    )
    return {
      local: localPreferred,
      cloud_sandbox: cloudPreferred,
      weclaw_dispatch: weclawPreferred,
    } satisfies Record<WorkMode, CapabilityItem[]>
  }, [packCapabilities, pluginCapabilities, skillCapabilities])

  const selectedModeSpec = localizedWorkModeSpec(locale, selectedWorkMode)
  const selectedModeCapabilities = modeAwareCapabilities[selectedWorkMode]
  const selectedModeNotice = useMemo(
    () => workModeAvailabilityNotice(locale, selectedWorkMode, runtimeStatus, localSeatPreference),
    [localSeatPreference, locale, runtimeStatus, selectedWorkMode],
  )
  const localSeatBannerMessage = useMemo(
    () =>
      selectedWorkMode === 'local'
        ? localSeatStateMessage(locale, runtimeStatus, localSeatPreference)
        : null,
    [localSeatPreference, locale, runtimeStatus, selectedWorkMode],
  )
  const { disabled: launchDisabled } = launchDisabledState(
    launchBusy,
    launchInput,
    selectedModeNotice,
  )
  const resetRuntimeDisabled =
    effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference) === 'unavailable'

  const capabilitySkillGroups = useMemo(() => {
    const groups = new Map<string, LongclawCapabilityEntry[]>()
    for (const skill of managedSkillEntries) {
      const key = capabilityGroup(skill) || skill.owner || 'workspace'
      const bucket = groups.get(key)
      if (bucket) bucket.push(skill)
      else groups.set(key, [skill])
    }
    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([group, items]) => ({
        group,
        items: [...items].sort((left, right) => left.label.localeCompare(right.label)),
      }))
  }, [managedSkillEntries])

  const recentLaunches = useMemo(
    () => mergeLaunchRecords(launches, launchTasks.map(launchRecordFromTask)).slice(0, 8),
    [launchTasks, launches],
  )
  const threadSummaries = useMemo(
    () => deriveThreadSummaries(locale, recentLaunches, launchTasks),
    [launchTasks, locale, recentLaunches],
  )
  const latestLaunch = recentLaunches[0] ?? null
  const capabilitySummaryItems = useMemo(
    () => [
      { label: t(locale, 'label.packs'), value: overview?.packs.length ?? 0, tone: 'running' },
      { label: t(locale, 'label.skills'), value: managedSkillEntries.length, tone: 'open' },
      { label: t(locale, 'label.plugins'), value: managedPluginEntries.length, tone: 'open' },
      { label: t(locale, 'label.launches'), value: recentLaunches.length, tone: latestLaunch?.status },
    ],
    [
      latestLaunch?.status,
      locale,
      managedPluginEntries.length,
      managedSkillEntries.length,
      overview?.packs.length,
      recentLaunches.length,
    ],
  )

  const modePosture = useMemo(
    () =>
      WORK_MODE_ORDER.map(mode => ({
        mode,
        spec: localizedWorkModeSpec(locale, mode),
        capabilities: modeAwareCapabilities[mode].slice(0, 3),
      })),
    [locale, modeAwareCapabilities],
  )
  const conversationEvents = useMemo(
    () =>
      deriveConversationEvents(
        locale,
        selectedThreadId,
        threadSummaries,
        recentLaunches,
        launchTasks,
        runs,
        workItems,
      ),
    [launchTasks, locale, recentLaunches, runs, selectedThreadId, threadSummaries, workItems],
  )
  const taskFlowItems = useMemo<TaskFlowItem[]>(
    () =>
      [
        ...recentLaunches.map(record => ({
          id: `launch:${record.id}`,
          kind: 'launch' as const,
          title:
            record.prompt.trim().slice(0, 72) ||
            humanizeTokenLocale(locale, record.pack_id ?? 'launch'),
          meta: formatModeMeta([
            record.work_mode ? humanizeWorkMode(locale, record.work_mode) : undefined,
            record.pack_id ? humanizeTokenLocale(locale, record.pack_id) : undefined,
            record.started_at ? formatTime(record.started_at) : undefined,
          ]),
          description:
            record.error || record.text.trim().slice(0, 140) || record.result_label || undefined,
          status: record.status,
          filter: taskFlowFilterForLaunch(record),
          timestamp: record.finished_at ?? record.started_at,
        })),
        ...launchTasks.map(task => ({
          id: `task:${task.task_id}`,
          kind: 'task' as const,
          title:
            stringValue(task.input.requested_outcome) ||
            stringValue(task.input.raw_text) ||
            humanizeTokenLocale(locale, task.capability),
          meta: formatModeMeta([
            humanizeTokenLocale(locale, task.capability),
            workModeFromTask(task) ? humanizeWorkMode(locale, workModeFromTask(task)) : undefined,
            task.updated_at ? formatTime(task.updated_at) : task.created_at ? formatTime(task.created_at) : undefined,
          ]),
          description: formatModeMeta([
            runtimeTargetFromRecord(task)
              ? humanizeTokenLocale(locale, runtimeTargetFromRecord(task))
              : undefined,
            localRuntimeSeatFromRecord(task)
              ? humanizeTokenLocale(locale, localRuntimeSeatFromRecord(task))
              : undefined,
          ]),
          status: task.status,
          filter: taskFlowFilterForTask(task),
          timestamp: task.updated_at ?? task.created_at ?? undefined,
        })),
        ...runs.map(run => ({
          id: `run:${run.run_id}`,
          kind: 'run' as const,
          title: run.summary || run.run_id,
          meta: formatModeMeta([
            humanizeTokenLocale(locale, run.pack_id ?? run.domain),
            humanizeTokenLocale(locale, run.capability),
            run.created_at ? formatTime(run.created_at) : undefined,
          ]),
          description: formatModeMeta([
            workModeFromRun(run) ? humanizeWorkMode(locale, workModeFromRun(run)) : undefined,
            runtimeTargetFromRecord(run)
              ? humanizeTokenLocale(locale, runtimeTargetFromRecord(run))
              : undefined,
          ]),
          status: run.status,
          filter: taskFlowFilterForRun(run),
          timestamp: run.started_at ?? run.created_at ?? undefined,
        })),
        ...workItems.map(item => ({
          id: `work_item:${item.work_item_id}`,
          kind: 'work_item' as const,
          title: item.title,
          meta: formatModeMeta([
            humanizeTokenLocale(locale, item.pack_id),
            humanizeTokenLocale(locale, item.kind),
            item.updated_at ? formatTime(item.updated_at) : item.created_at ? formatTime(item.created_at) : undefined,
          ]),
          description: item.summary,
          status: item.severity,
          filter: taskFlowFilterForWorkItem(item),
          timestamp: item.updated_at ?? item.created_at ?? undefined,
        })),
      ].sort((left, right) => {
        const leftValue = left.timestamp ? new Date(left.timestamp).getTime() : 0
        const rightValue = right.timestamp ? new Date(right.timestamp).getTime() : 0
        return rightValue - leftValue
      }),
    [launchTasks, locale, recentLaunches, runs, workItems],
  )
  const filteredTaskFlowItems = useMemo(
    () =>
      taskFlowFilter === 'all'
        ? taskFlowItems
        : taskFlowItems.filter(item => item.filter === taskFlowFilter),
    [taskFlowFilter, taskFlowItems],
  )
  const selectedThread = useMemo(
    () => threadSummaries.find(thread => thread.id === selectedThreadId) ?? null,
    [selectedThreadId, threadSummaries],
  )
  const navItems = useMemo<NavItemSpec[]>(
    () => {
      const items: Array<Omit<NavItemSpec, 'title'>> = [
        {
          id: 'strategy',
          label: t(locale, 'nav.strategy'),
          glyph: locale === 'zh-CN' ? '策' : 'S',
          group: 'primary',
        },
        {
          id: 'backtest',
          label: t(locale, 'nav.backtest'),
          glyph: locale === 'zh-CN' ? '测' : 'B',
          group: 'primary',
        },
        {
          id: 'execution',
          label: t(locale, 'nav.execution'),
          glyph: locale === 'zh-CN' ? '执' : 'E',
          group: 'primary',
        },
        {
          id: 'wechat',
          label: t(locale, 'nav.wechat'),
          glyph: locale === 'zh-CN' ? '微' : 'W',
          group: 'primary',
        },
        {
          id: 'factory',
          label: t(locale, 'nav.plugins'),
          glyph: locale === 'zh-CN' ? '插' : 'P',
          group: 'primary',
        },
      ]
      return items.map(item => ({ ...item, title: item.label }))
    },
    [locale],
  )
  const primaryNavItems = useMemo(
    () => navItems.filter(item => item.group === 'primary'),
    [navItems],
  )
  const secondaryNavItems = useMemo(
    () => navItems.filter(item => item.group === 'secondary'),
    [navItems],
  )
  const homeRecentThreads = threadSummaries.slice(0, 4)
  const homePendingItems = priorityWorkItems.slice(0, 4)
  const sidebarStatusItems = useMemo<SidebarStatusItem[]>(
    () => [
      {
        id: 'core',
        label: t(locale, 'runtime.longclaw_core'),
        meta: runtimeStatus.longclawCoreBaseUrl || t(locale, 'runtime.no_control_plane_url'),
        status: runtimeStatus.longclawCoreConnected ? 'connected' : 'degraded',
      },
      {
        id: 'due',
        label: t(locale, 'runtime.due_diligence'),
        meta: runtimeStatus.dueDiligenceBaseUrl || t(locale, 'runtime.no_due_diligence_url'),
        status: runtimeStatus.dueDiligenceConnected ? 'connected' : 'degraded',
      },
      {
        id: 'signals',
        label: t(locale, 'runtime.signals_workspace'),
        meta: runtimeStatus.signalsStateRoot || t(locale, 'runtime.no_signals_state_root'),
        status: runtimeStatus.signalsAvailable ? 'available' : 'degraded',
      },
      {
        id: 'seat',
        label: t(locale, 'runtime.local_runtime_seat'),
        meta: formatModeMeta([
          runtimeStatus.localRuntimeSeat
            ? humanizeTokenLocale(locale, runtimeStatus.localRuntimeSeat)
            : humanizeTokenLocale(locale, 'unavailable'),
          localSeatPreferenceLabel(locale, localSeatPreference),
        ]),
        status: runtimeStatus.localRuntimeAvailable ? 'available' : 'unavailable',
      },
      {
        id: 'acp',
        label: t(locale, 'runtime.local_acp_bridge'),
        meta: runtimeStatus.localAcpScript || t(locale, 'runtime.no_acp_bridge'),
        status: runtimeStatus.localAcpAvailable ? 'available' : 'unavailable',
      },
      {
        id: 'local-api',
        label: t(locale, 'runtime.local_runtime_api'),
        meta: runtimeStatus.localRuntimeApiUrl || t(locale, 'runtime.no_local_runtime_api'),
        status: runtimeStatus.localRuntimeApiAvailable ? 'available' : 'unavailable',
      },
    ],
    [localSeatPreference, locale, runtimeStatus],
  )
  const railStatusItems = useMemo(
    () => [
      {
        id: 'runtime',
        label: locale === 'zh-CN' ? '运行' : 'Runtime',
        meta: runtimeStatus.localRuntimeAvailable
          ? runtimeStatus.localRuntimeSeat
            ? humanizeTokenLocale(locale, runtimeStatus.localRuntimeSeat)
            : t(locale, 'state.ready')
          : locale === 'zh-CN'
            ? '未就绪'
            : 'Not ready',
        status: runtimeStatus.localRuntimeAvailable ? 'available' : 'degraded',
      },
      {
        id: 'data',
        label: locale === 'zh-CN' ? '数据' : 'Data',
        meta: runtimeStatus.signalsAvailable
          ? locale === 'zh-CN'
            ? '信号可用'
            : 'Signals ready'
          : locale === 'zh-CN'
            ? '待连接'
            : 'Pending',
        status: runtimeStatus.signalsAvailable ? 'available' : 'degraded',
      },
      {
        id: 'wechat',
        label: locale === 'zh-CN' ? '微信' : 'WeChat',
        meta: wechatBound
          ? locale === 'zh-CN'
            ? '已绑定'
            : 'Bound'
          : locale === 'zh-CN'
            ? '未绑定'
            : 'Unbound',
        status: wechatBound ? 'open' : 'degraded',
      },
    ],
    [
      locale,
      runtimeStatus.localRuntimeAvailable,
      runtimeStatus.localRuntimeSeat,
      runtimeStatus.signalsAvailable,
      wechatBound,
    ],
  )
  const disabledCapabilityCount = capabilityManagerSettings.disabled_capabilities.length
  const capabilityGroupsSummary = Object.entries(capabilityManagerSettings.capability_groups)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 6)

  useEffect(() => {
    if (!threadSummaries.length) {
      setSelectedThreadId(null)
      return
    }
    if (!selectedThreadId || !threadSummaries.some(thread => thread.id === selectedThreadId)) {
      setSelectedThreadId(threadSummaries[0].id)
    }
  }, [selectedThreadId, threadSummaries])

  useEffect(() => {
    if (!weclawSessions.length) {
      setSelectedWeclawSessionId(null)
      return
    }
    if (!selectedWeclawSessionId) {
      return
    }
    if (!weclawSessions.some(session => session.sessionId === selectedWeclawSessionId)) {
      setSelectedWeclawSessionId(null)
    }
  }, [selectedWeclawSessionId, weclawSessions])

  useEffect(() => {
    if (page !== 'wechat') return
    if (!selectedWeclawSessionId && selected?.type === 'weclaw_session') {
      setSelected(null)
    }
  }, [page, selected, selectedWeclawSessionId])

  useEffect(() => {
    if (page === 'wechat') return
    if (selected?.type === 'weclaw_session') {
      setSelected(null)
    }
  }, [page, selected])

  useEffect(() => {
    if (page !== 'wechat') return
    if (filteredWeclawSessions.length > 0) return
    if (selected?.type === 'weclaw_session') {
      setSelected(null)
    }
  }, [filteredWeclawSessions.length, page, selected])

  useEffect(() => {
    if (page === 'execution') return
    if (executionJumpContext) {
      setExecutionJumpContext(null)
    }
  }, [executionJumpContext, page])

  const useCapability = useCallback((item: CapabilityItem) => {
    setLaunchInput(previous => withMention(previous, item.mention))
    setPage('strategy')
  }, [])

  const openLaunchRecord = useCallback(
    (record: LaunchRecord) => {
      openRecord(
        `${t(locale, 'section.recent_launches.title')} ${formatTime(record.started_at)}${record.work_mode ? ` · ${humanizeWorkMode(locale, record.work_mode)}` : ''}`,
        record as unknown as Record<string, unknown>,
      )
    },
    [locale, openRecord],
  )

  const openConversationEvent = useCallback(
    (event: ConversationEvent) => {
      if (event.type === 'user_launch') {
        openLaunchRecord(event.launch)
        return
      }
      if (event.type === 'task_receipt') {
        setPage('execution')
        openRecord(
          event.title,
          event.task as unknown as Record<string, unknown>,
        )
        return
      }
      if (event.type === 'run_receipt') {
        setPage('execution')
        void openRun(event.run)
        return
      }
      setPage('execution')
      openWorkItem(event.workItem)
    },
    [openLaunchRecord, openRecord, openRun, openWorkItem],
  )

  const syncCapabilityManagerSettings = useCallback(
    async (patch: Partial<CapabilityManagerSettings>) => {
      try {
        const next = await window.longclawCapabilityManager.updateSettings(patch)
        setCapabilityManagerSettings(next)
        await loadCapabilitySubstrate()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [loadCapabilitySubstrate],
  )

  const syncCapabilityRegistry = useCallback(
    async (
      operation:
        | { type: 'refresh' }
        | { type: 'register'; kind: 'skill' | 'plugin'; sourcePath: string; label?: string }
        | { type: 'remove'; registryId: string },
    ) => {
      try {
        let next: RuntimeCapabilityRegistry
        if (operation.type === 'refresh') {
          next = await window.longclawCapabilityManager.rescan()
        } else if (operation.type === 'register') {
          next = await window.longclawCapabilityManager.registerCapability({
            kind: operation.kind,
            sourcePath: operation.sourcePath,
            label: operation.label,
          })
        } else {
          next = await window.longclawCapabilityManager.removeCapability(operation.registryId)
        }
        setCapabilityRegistry(next)
        await loadCapabilitySubstrate()
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [loadCapabilitySubstrate],
  )

  const updateWeclawSessionState = useCallback(
    async (
      session: Pick<WeclawSessionSummary, 'canonicalSessionId'>,
      patch: { hidden?: boolean; archived?: boolean },
    ) => {
      try {
        await window.weclawSessions.updateSessionState(session.canonicalSessionId, patch)
        const nextSessions = await window.weclawSessions.listWeclawSessions()
        setWeclawSessions(nextSessions)
        if (
          selected?.type === 'weclaw_session' &&
          selected.session.canonicalSessionId === session.canonicalSessionId
        ) {
          const nextSelected = nextSessions.find(
            item => item.sessionId === selected.session.sessionId,
          )
          if (nextSelected) {
            setSelected({
              type: 'weclaw_session',
              title: selected.title,
              session: {
                ...selected.session,
                hidden: nextSelected.hidden,
                archived: nextSelected.archived,
              },
            })
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [selected],
  )

  const toggleCapabilityVisibility = useCallback(
    (entry: LongclawCapabilityEntry) => {
      const nextDisabled = capabilityDisabled(entry)
        ? capabilityManagerSettings.disabled_capabilities.filter(
            capabilityId => capabilityId !== entry.capability_id,
          )
        : [...capabilityManagerSettings.disabled_capabilities, entry.capability_id]
      void syncCapabilityManagerSettings({
        disabled_capabilities: nextDisabled,
      })
    },
    [capabilityManagerSettings.disabled_capabilities, syncCapabilityManagerSettings],
  )

  const updateCapabilityGroup = useCallback(
    (entry: LongclawCapabilityEntry, group: string) => {
      const nextGroups = { ...capabilityManagerSettings.capability_groups }
      if (group.trim()) nextGroups[entry.capability_id] = group.trim()
      else delete nextGroups[entry.capability_id]
      void syncCapabilityManagerSettings({
        capability_groups: nextGroups,
      })
    },
    [capabilityManagerSettings.capability_groups, syncCapabilityManagerSettings],
  )

  const addDiscoveryRoot = useCallback(
    (kind: 'skill' | 'plugin') => {
      const draft = kind === 'skill' ? extraSkillRootDraft : extraPluginRootDraft
      const trimmed = draft.trim()
      if (!trimmed) return
      if (kind === 'skill') {
        void syncCapabilityManagerSettings({
          extra_skill_roots: [...capabilityManagerSettings.extra_skill_roots, trimmed],
        })
        setExtraSkillRootDraft('')
        return
      }
      void syncCapabilityManagerSettings({
        extra_plugin_roots: [...capabilityManagerSettings.extra_plugin_roots, trimmed],
      })
      setExtraPluginRootDraft('')
    },
    [
      capabilityManagerSettings.extra_plugin_roots,
      capabilityManagerSettings.extra_skill_roots,
      extraPluginRootDraft,
      extraSkillRootDraft,
      syncCapabilityManagerSettings,
    ],
  )

  const removeDiscoveryRoot = useCallback(
    (kind: 'skill' | 'plugin', root: string) => {
      if (kind === 'skill') {
        void syncCapabilityManagerSettings({
          extra_skill_roots: capabilityManagerSettings.extra_skill_roots.filter(
            value => value !== root,
          ),
        })
        return
      }
      void syncCapabilityManagerSettings({
        extra_plugin_roots: capabilityManagerSettings.extra_plugin_roots.filter(
          value => value !== root,
        ),
      })
    },
    [
      capabilityManagerSettings.extra_plugin_roots,
      capabilityManagerSettings.extra_skill_roots,
      syncCapabilityManagerSettings,
    ],
  )

  const openCapabilityLocalPath = useCallback(async (targetPath?: string) => {
    if (!targetPath) return
    try {
      await window.longclawControlPlane.performLocalAction({
        kind: 'open_path',
        payload: { path: targetPath },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const copyCapabilityMention = useCallback(async (mention: string) => {
    try {
      await window.longclawControlPlane.performLocalAction({
        kind: 'copy_value',
        payload: { value: mention },
      })
      setActionMessage(t(locale, 'action.copy_mention_done'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [locale])

  const openTaskFlowItem = useCallback(
    (item: TaskFlowItem) => {
      if (item.kind === 'launch') {
        const launch = recentLaunches.find(record => `launch:${record.id}` === item.id)
        if (launch) openLaunchRecord(launch)
        return
      }
      if (item.kind === 'task') {
        const task = launchTasks.find(record => `task:${record.task_id}` === item.id)
        if (task) {
          openRecord(item.title, task as unknown as Record<string, unknown>)
        }
        return
      }
      if (item.kind === 'run') {
        const run = runs.find(record => `run:${record.run_id}` === item.id)
        if (run) void openRun(run)
        return
      }
      const workItem = workItems.find(record => `work_item:${record.work_item_id}` === item.id)
      if (workItem) openWorkItem(workItem)
    },
    [launchTasks, openLaunchRecord, openRecord, openRun, openWorkItem, recentLaunches, runs, workItems],
  )

  const resetCoworkRuntime = useCallback(async () => {
    if (!runtimeStatus.localRuntimeAvailable) {
      setActionMessage(t(locale, 'notice.local_unavailable'))
      return
    }
    try {
      await window.agentAPI.clear()
      setActionMessage(t(locale, 'action.runtime_reset_done'))
      await loadCapabilitySubstrate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [loadCapabilitySubstrate, locale, runtimeStatus.localRuntimeAvailable])

  const refreshTaskLaunchReadiness = useCallback(async () => {
    const refreshedRuntimeStatus = await loadCapabilitySubstrate()
    return refreshedRuntimeStatus ?? runtimeStatus
  }, [loadCapabilitySubstrate, runtimeStatus])

  const handleSelectTaskWorkMode = useCallback(
    (mode: WorkMode) => {
      workModeTouchedRef.current = true
      setSelectedWorkMode(mode)
      void loadCapabilitySubstrate()
    },
    [loadCapabilitySubstrate],
  )

  const submitLaunch = useCallback(async () => {
    const prompt = launchInput.trim()
    if (!prompt || launchBusy) return
    const selectedMode = selectedWorkMode
    const refreshedRuntimeStatus = await refreshTaskLaunchReadiness()
    const refreshedModeNotice = workModeAvailabilityNotice(
      locale,
      selectedMode,
      refreshedRuntimeStatus,
      localSeatPreference,
    )
    if (refreshedModeNotice) {
      setError(null)
      setActionMessage(refreshedModeNotice)
      return
    }

    const tempLaunchId = `launch-${Date.now()}`
    const selectedSpec = localizedWorkModeSpec(locale, selectedMode)
    const runtimeProfile = effectiveRuntimeProfile(
      selectedMode,
      refreshedRuntimeStatus,
      localSeatPreference,
    )
    activeLaunchIdRef.current = tempLaunchId
    setLaunchBusy(true)
    setActionMessage(null)
    setError(null)
    setLaunchInput('')
    setLaunches(previous => {
      const optimisticLaunch: LaunchRecord = {
          id: tempLaunchId,
          prompt,
          status: 'running',
          started_at: new Date().toISOString(),
          text: '',
          tool_names: [],
          source: 'electron_cowork',
          work_mode: selectedMode,
          origin_surface: selectedSpec.interactionSurface,
          interaction_surface: selectedSpec.interactionSurface,
          runtime_profile: runtimeProfile,
          runtime_target: selectedSpec.runtimeTarget,
          model_plane: selectedSpec.modelPlane,
          local_runtime_seat:
            selectedMode === 'local'
              ? effectiveLocalRuntimeSeat(refreshedRuntimeStatus, localSeatPreference)
              : 'unavailable',
          execution_plane:
            selectedSpec.runtimeTarget === 'cloud_runtime' ? 'cloud_executor' : 'local_executor',
          workspace_target:
            selectedMode === 'local'
              ? agentCwd || undefined
              : selectedMode === 'cloud_sandbox'
                ? 'sandbox://longclaw/default'
                : 'weclaw://active-thread',
      }
      return [optimisticLaunch, ...previous].slice(0, 8)
    })

    try {
      const receipt = await window.longclawLaunch.launch(
        buildLaunchIntent(
          prompt,
          agentCwd,
          selectedMode,
          refreshedRuntimeStatus,
          localSeatPreference,
        ),
      )
      activeLaunchIdRef.current = null
      setLaunchBusy(false)
      const receiptRecord = launchRecordFromReceipt(receipt)
      setLaunches(previous =>
        previous
          .map(record =>
            record.id === tempLaunchId
              ? {
                  ...receiptRecord,
                  text: record.text || receiptRecord.text,
                  tool_names:
                    record.tool_names.length > 0
                      ? record.tool_names
                      : receiptRecord.tool_names,
                }
              : record,
          )
          .slice(0, 8),
      )
      setActionMessage(
        receipt.work_items.length > 0
          ? tf(locale, 'action.launch_created_work_items', {
              mode: humanizeWorkMode(locale, selectedMode),
              count: receipt.work_items.length,
              target: humanizeTokenLocale(locale, receipt.pack_id),
            })
          : tf(locale, 'action.launch_completed', {
              mode: humanizeWorkMode(locale, selectedMode),
              target: humanizeTokenLocale(locale, receipt.pack_id),
            }),
      )
      await Promise.all([
        loadOverview(),
        loadWorkItems(),
        loadLaunchTasks(),
        loadCapabilitySubstrate(),
      ])
    } catch (err) {
      activeLaunchIdRef.current = null
      setLaunchBusy(false)
      const message = formatLaunchFailureMessage(
        locale,
        err,
        refreshedRuntimeStatus,
        selectedMode,
      )
      setActionMessage(null)
      setError(message)
      setLaunches(previous =>
        patchLaunchRecord(previous, tempLaunchId, record => ({
          ...record,
          status: 'failed',
          finished_at: new Date().toISOString(),
          error: message,
        })),
      )
    }
  }, [
    agentCwd,
    launchBusy,
    launchInput,
    loadCapabilitySubstrate,
    loadLaunchTasks,
    loadOverview,
    loadWorkItems,
    localSeatPreference,
    selectedWorkMode,
    locale,
    refreshTaskLaunchReadiness,
  ])

  const pageHeading = pageTitle(locale, page)
  const selectedThreadModeSpec = workModeSpecFromValue(
    locale,
    selectedThread?.workMode ?? selectedWorkMode,
  )
  const taskWorkspaceContextItems = useMemo(
    () => [
      {
        id: 'workspace',
        label: t(locale, 'context.workspace_root'),
        value: agentCwd
          ? agentCwd.split('/').filter(Boolean).slice(-2).join('/')
          : t(locale, 'context.workspace_pending'),
        meta: agentCwd || t(locale, 'context.workspace_not_resolved'),
      },
      {
        id: 'mode',
        label: t(locale, 'context.selected_home_mode'),
        value: selectedModeSpec.label,
        meta: formatModeMeta([
          selectedModeSpec.summary,
          selectedWorkMode === 'local'
            ? localSeatPreferenceLabel(locale, localSeatPreference)
            : undefined,
        ]),
      },
      {
        id: 'thread',
        label: t(locale, 'sidebar.session_ledger'),
        value: selectedThread?.title || t(locale, 'state.pending'),
        meta:
          formatModeMeta([
            selectedThreadModeSpec?.label,
            selectedThread?.latestAt ? formatTime(selectedThread.latestAt) : undefined,
          ]) || t(locale, 'section.continue_threads.subtitle'),
      },
    ],
    [
      agentCwd,
      locale,
      localSeatPreference,
      selectedModeSpec.label,
      selectedModeSpec.summary,
      selectedThread,
      selectedThreadModeSpec?.label,
      selectedWorkMode,
    ],
  )
  const taskWorkspaceStatusItems = useMemo(
    () => [
      {
        label: t(locale, 'task_flow_filter.running'),
        value: taskFlowItems.filter(item => item.filter === 'running').length,
        tone: 'running',
      },
      {
        label: t(locale, 'task_flow_filter.pending'),
        value: taskFlowItems.filter(item => item.filter === 'pending').length,
        tone: 'pending',
      },
      {
        label: t(locale, 'task_flow_filter.failed'),
        value: taskFlowItems.filter(item => item.filter === 'failed').length,
        tone: 'failed',
      },
      {
        label: t(locale, 'section.continue_threads.title'),
        value: homeRecentThreads.length,
        tone: homeRecentThreads.length > 0 ? 'running' : 'open',
      },
    ],
    [homeRecentThreads.length, locale, taskFlowItems],
  )
  const taskWorkspaceTaskFlowItems = useMemo(
    () =>
      filteredTaskFlowItems.map(item => ({
        id: item.id,
        title: item.title,
        meta: item.meta,
        description: item.description,
        status: item.status,
        nextActionLabel: t(locale, 'action.inspect_launch'),
      })),
    [filteredTaskFlowItems, locale],
  )
  const taskWorkspaceContinueThreads = useMemo(
    () =>
      homeRecentThreads.map(thread => ({
        id: thread.id,
        title: thread.title,
        meta: formatModeMeta([
          thread.subtitle,
          thread.latestAt ? formatTime(thread.latestAt) : undefined,
        ]),
        status: thread.status,
        description: thread.localRuntimeSeat
          ? humanizeTokenLocale(locale, thread.localRuntimeSeat)
          : undefined,
        nextActionLabel: t(locale, 'action.switch_context'),
        active: selectedThreadId === thread.id,
      })),
    [homeRecentThreads, locale, selectedThreadId],
  )
  const taskWorkspacePendingItems = useMemo(
    () =>
      homePendingItems.map(item => ({
        id: item.work_item_id,
        title: item.title,
        meta: formatModeMeta([
          humanizeTokenLocale(locale, item.pack_id),
          humanizeTokenLocale(locale, item.kind),
          humanizeTokenLocale(locale, item.status),
        ]),
        status: item.severity,
        description: item.summary,
        nextActionLabel: item.operator_actions[0]?.label ?? t(locale, 'action.inspect_launch'),
      })),
    [homePendingItems, locale],
  )
  const taskWorkspaceWorkModeOptions = useMemo(
    () =>
      WORK_MODE_ORDER.map(mode => {
        const spec = localizedWorkModeSpec(locale, mode)
        return {
          value: mode,
          label: spec.label,
          description: spec.detail,
        }
      }),
    [locale],
  )
  const taskWorkspaceLocalSeatOptions = useMemo(
    () =>
      (['auto', 'force_acp', 'force_local_runtime_api'] as LocalRuntimeSeatPreference[]).map(
        preference => ({
          value: preference,
          label: localSeatPreferenceLabel(locale, preference),
        }),
      ),
    [locale],
  )
  const taskWorkspaceCapabilitySuggestions = useMemo(
    () =>
      selectedModeCapabilities.map(item => ({
        id: item.id,
        mention: item.mention,
        label: item.label,
      })),
    [selectedModeCapabilities],
  )
  const selectedWeclawSession = useMemo(
    () => (selected?.type === 'weclaw_session' ? selected.session : null),
    [selected],
  )
  const clearWeclawSelection = useCallback(() => {
    setSelected(null)
    setSelectedWeclawSessionId(null)
  }, [])
  const jumpContext = selected?.type === 'weclaw_session' ? buildWeclawJumpContext(selected.session) : null
  const openWeclawLinkedTask = useCallback(
    (task: LongclawTask) => {
      setExecutionJumpContext(jumpContext)
      setPage('execution')
      openRecord(t(locale, 'section.detail.weclaw_links.task'), task as unknown as Record<string, unknown>)
    },
    [jumpContext, locale, openRecord],
  )
  const openWeclawLinkedRun = useCallback(
    (run: LongclawRun) => {
      setExecutionJumpContext(jumpContext)
      setPage('execution')
      void openRun(run)
    },
    [jumpContext, openRun],
  )
  const openWeclawLinkedWorkItem = useCallback(
    (workItem: LongclawWorkItem) => {
      setExecutionJumpContext(jumpContext)
      setPage('execution')
      openWorkItem(workItem)
    },
    [jumpContext, openWorkItem],
  )
  const createWechatBindingSession = useCallback(async () => {
    try {
      setWechatBindingStatus(await window.longclawWechat.createBindingSession())
      setActionMessage(locale === 'zh-CN' ? '已生成微信绑定二维码。' : 'WeChat binding QR created.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [locale])
  const createLocalWechatBindingSession = useCallback(async () => {
    try {
      setWechatBindingStatus(await window.longclawWechat.createLocalBindingSession())
      setActionMessage(locale === 'zh-CN' ? '已生成本机测试二维码。' : 'Local test QR created.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [locale])
  const completeWechatBindingSession = useCallback(async () => {
    try {
      setWechatBindingStatus(await window.longclawWechat.completeBindingSession())
      setActionMessage(locale === 'zh-CN' ? '微信扫码绑定已完成。' : 'WeChat scan binding completed.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [locale])
  const revokeWechatBinding = useCallback(async () => {
    const confirmed = window.confirm(
      locale === 'zh-CN'
        ? '确定解除当前微信绑定吗？解除后需要重新扫码才能继续使用微信入口。'
        : 'Revoke the current WeChat binding? You will need to scan again before using the WeChat entry.',
    )
    if (!confirmed) return
    try {
      setWechatBindingStatus(await window.longclawWechat.revokeBinding())
      setActionMessage(locale === 'zh-CN' ? '微信绑定已解除。' : 'WeChat binding revoked.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [locale])
  const routeWechatMessage = useCallback(async (text: string) => {
    try {
      const receipt = await window.longclawWechat.routeMessage(text)
      await loadWechatRuntime()
      setActionMessage(locale === 'zh-CN' ? '已发送到路由。' : 'Route sent.')
      if (receipt.route === 'dev_plugin') setPage('factory')
      return receipt
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [loadWechatRuntime, locale])
  const refreshPluginDevIssues = useCallback(async () => {
    await loadWechatRuntime()
  }, [loadWechatRuntime])
  const startPluginDevIssue = useCallback(async (issueId: string) => {
    try {
      await window.longclawPluginDev.startImplementation(issueId)
      await refreshPluginDevIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [refreshPluginDevIssues])
  const runPluginDevIssueCi = useCallback(async (issueId: string) => {
    try {
      await window.longclawPluginDev.runCi(issueId)
      await refreshPluginDevIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [refreshPluginDevIssues])
  const mergePluginDevIssueAction = useCallback(async (issueId: string) => {
    try {
      await window.longclawPluginDev.merge(issueId)
      await refreshPluginDevIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [refreshPluginDevIssues])
  const registerPluginDevIssueAction = useCallback(async (issueId: string) => {
    try {
      await window.longclawPluginDev.registerArtifact(issueId)
      await refreshPluginDevIssues()
      await loadCapabilitySubstrate()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [loadCapabilitySubstrate, refreshPluginDevIssues])
  const openPluginDevIssue = useCallback((issue: PluginDevIssue) => {
    openRecord(issue.title, issue as unknown as Record<string, unknown>)
  }, [openRecord])

  return (
    <div style={shellLayout.app}>
      <aside style={shellLayout.rail}>
        <div style={railBrandStyle}>
          <div style={railMonogramStyle}>LC</div>
          <div style={railBrandLabelStyle}>{t(locale, 'app.brand')}</div>
          <div style={railBrandCaptionStyle}>
            {locale === 'zh-CN' ? '个人金融交易台' : 'Personal trading desk'}
          </div>
        </div>

        <div style={railModeLabelStyle}>
          {locale === 'zh-CN' ? '五个模式' : 'Five modes'}
        </div>
        <nav aria-label="Primary navigation" style={railNavStyle}>
          {primaryNavItems.map(item => (
            <button
              key={item.id}
              type="button"
              title={item.title}
              style={railNavButtonStyle(page === item.id)}
              onClick={() => setPage(item.id)}
            >
              <span style={railNavButtonGlyphStyle(page === item.id)}>{item.glyph}</span>
              <span style={railNavButtonLabelStyle}>{item.label}</span>
            </button>
          ))}
        </nav>

        {secondaryNavItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={chromeStyles.eyebrowLight}>
              {locale === 'zh-CN' ? '入口与能力' : 'Entries and capabilities'}
            </div>
            <nav aria-label="Secondary navigation" style={railNavStyle}>
              {secondaryNavItems.map(item => (
                <button
                  key={item.id}
                  type="button"
                  title={item.title}
                  style={railNavButtonStyle(page === item.id)}
                  onClick={() => setPage(item.id)}
                >
                  <span style={railNavButtonGlyphStyle(page === item.id)}>{item.glyph}</span>
                  <span style={railNavButtonLabelStyle}>{item.label}</span>
                </button>
              ))}
            </nav>
          </div>
        )}

        {viewportTier === 'narrow' && (
          <button
            type="button"
            style={buttonStyleForState(secondaryButtonStyle, false)}
            aria-label={
              threadSidebarOpen ? t(locale, 'sidebar.toggle_close') : t(locale, 'sidebar.toggle_open')
            }
            onClick={() => setThreadSidebarOpen(previous => !previous)}
          >
            {threadSidebarOpen ? t(locale, 'sidebar.toggle_close') : t(locale, 'sidebar.threads')}
          </button>
        )}

        <div style={{ marginTop: 'auto' }} />
        <div style={railStatusStackStyle} aria-label={locale === 'zh-CN' ? '交易台状态' : 'Desk status'}>
          {railStatusItems.map(item => (
            <div key={item.id} style={railStatusItemStyle} title={`${item.label}: ${item.meta}`}>
              <span style={railStatusSignalStyle(item.status)} aria-hidden="true" />
              <div style={railStatusLabelStyle}>{item.label}</div>
              <div style={railStatusMetaStyle}>{item.meta}</div>
            </div>
          ))}
        </div>
      </aside>

      {shellLayout.threadBackdrop && (
        <button
          type="button"
          aria-label={t(locale, 'action.close')}
          style={shellLayout.threadBackdrop}
          onClick={() => setThreadSidebarOpen(false)}
        />
      )}

      <aside
        style={
          hideContextSidebar
            ? { ...shellLayout.threadSidebar, display: 'none' }
            : isWeChatPage
              ? wechatThreadSidebarShellStyle(shellLayout.threadSidebar)
              : shellLayout.threadSidebar
        }
      >
        <div style={threadSidebarSectionStyle}>
          {isWeChatPage ? (
            <>
              <div style={threadSidebarSectionHeaderStyle}>
                <div>
                  <div style={wechatSidebarEyebrowStyle}>
                    {locale === 'zh-CN' ? '移动入口' : 'Mobile entry'}
                  </div>
                  <div style={wechatSidebarHeadingStyle}>
                    {locale === 'zh-CN' ? '微信入口' : 'WeChat entry'}
                  </div>
                </div>
                <span style={statusBadgeStyle(wechatBound ? 'open' : 'degraded')}>
                  {wechatBound ? t(locale, 'state.ready') : locale === 'zh-CN' ? '未绑定' : 'Unbound'}
                </span>
              </div>
              <div style={wechatSidebarCardStyle}>
                <div style={wechatSidebarCardValueStyle}>
                  {wechatBound
                    ? locale === 'zh-CN'
                      ? '已绑定微信用户'
                      : 'WeChat user bound'
                    : locale === 'zh-CN'
                      ? '等待扫码绑定'
                      : 'Waiting for QR binding'}
                </div>
                <div style={wechatSidebarMetaStyle}>
                  {formatModeMeta([
                    wechatIdentityReady
                      ? locale === 'zh-CN'
                        ? '扫码认证已完成'
                        : 'QR identity verified'
                      : locale === 'zh-CN'
                        ? '扫码后启用入站路由'
                        : 'Inbound routing unlocks after scan',
                    locale === 'zh-CN'
                      ? `${wechatBindingStatus?.allowed_routes.length ?? 0} 个入口`
                      : `${wechatBindingStatus?.allowed_routes.length ?? 0} routes`,
                  ])}
                </div>
              </div>
            </>
          ) : (
            <>
              <div style={threadSidebarSectionHeaderStyle}>
                <div>
                  <div style={chromeStyles.eyebrowLight}>{t(locale, 'context.workspace_root')}</div>
                  <div style={threadSidebarHeadingStyle}>
                    {agentCwd ? agentCwd.split('/').filter(Boolean).slice(-2).join('/') : t(locale, 'context.workspace_pending')}
                  </div>
                </div>
                <button
                  type="button"
                  style={buttonStyleForState(secondaryButtonStyle, loading)}
                  disabled={loading}
                  onClick={() => {
                    void refresh(page)
                  }}
                >
                  {loading ? t(locale, 'action.refreshing') : t(locale, 'action.refresh')}
                </button>
              </div>
              <div style={threadSidebarWorkspaceCardStyle}>
                <div style={threadSidebarWorkspaceValueStyle}>
                  {agentCwd ? agentCwd.split('/').filter(Boolean).slice(-1)[0] : t(locale, 'context.workspace_not_resolved')}
                </div>
                <div style={chromeStyles.monoMeta}>
                  {agentCwd || t(locale, 'context.workspace_not_resolved')}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={threadSidebarSectionStyle}>
          {page === 'wechat' && (
            <>
              <div style={threadSidebarSectionHeaderStyle}>
                <div>
                  <div style={wechatSidebarEyebrowStyle}>{t(locale, 'section.wechat_sessions.source.title')}</div>
                  <div style={wechatSidebarHeadingStyle}>{t(locale, 'page.wechat.title')}</div>
                </div>
                <span
                  style={statusBadgeStyle(
                    weclawSessionSourceStatus?.sessionsDirExists ? 'open' : 'degraded',
                  )}
                >
                  {filteredWeclawSessions.length}
                </span>
              </div>
              <div style={threadSidebarQuickListStyle}>
                <div style={wechatSidebarMetaStyle}>
                  {locale === 'zh-CN'
                    ? '仅展示最近入站与审计队列，不暴露本地目录。'
                    : 'Shows recent inbound and audit queue without local paths.'}
                </div>
                {(filteredWeclawSessions.length === 0 ? [] : filteredWeclawSessions.slice(0, 5)).map(session => (
                  <button
                    key={session.sessionId}
                    type="button"
                    style={wechatSidebarMiniRowStyle}
                    onClick={() => {
                      setSelectedWeclawSessionId(session.sessionId)
                      void openWeclawSession(session.sessionId)
                    }}
                  >
                    <div style={wechatSidebarMiniTitleStyle}>{session.title}</div>
                    <div style={wechatSidebarMetaStyle}>
                      {formatModeMeta([
                        session.sourceLabel,
                        session.updatedAt ? formatTime(session.updatedAt) : undefined,
                      ])}
                    </div>
                  </button>
                ))}
                {filteredWeclawSessions.length === 0 && (
                  <div style={wechatSidebarEmptyStyle}>
                    {weclawEmptyStateMessage(locale, weclawSessionSourceStatus)}
                  </div>
                )}
              </div>
            </>
          )}

          {page === 'factory' && (
            <>
              <div style={threadSidebarSectionHeaderStyle}>
                <div>
                  <div style={chromeStyles.eyebrowLight}>{t(locale, 'nav.plugins')}</div>
                  <div style={threadSidebarHeadingStyle}>{t(locale, 'sidebar.capability_groups')}</div>
                </div>
                <span style={statusBadgeStyle(disabledCapabilityCount > 0 ? 'degraded' : 'open')}>
                  {disabledCapabilityCount}
                </span>
              </div>
              <div style={threadSidebarQuickListStyle}>
                {capabilityGroupsSummary.length === 0 ? (
                  <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_capability_groups')}</div>
                ) : (
                  capabilityGroupsSummary.map(([capabilityId, group]) => (
                    <div key={capabilityId} style={threadSidebarMiniRowStyle}>
                      <div style={threadMiniTitleStyle}>{group}</div>
                      <div style={threadRowMetaStyle}>{capabilityId}</div>
                    </div>
                  ))
                )}
                <div style={threadRowMetaStyle}>
                  {tf(locale, 'sidebar.extra_roots_summary', {
                    skills: capabilityManagerSettings.extra_skill_roots.length,
                    plugins: capabilityManagerSettings.extra_plugin_roots.length,
                  })}
                </div>
              </div>
            </>
          )}

          {page === 'execution' && (
            <>
              <div style={threadSidebarSectionHeaderStyle}>
                <div>
                  <div style={chromeStyles.eyebrowLight}>{t(locale, 'nav.execution')}</div>
                  <div style={threadSidebarHeadingStyle}>{t(locale, 'sidebar.rpa_flows')}</div>
                </div>
                <span style={statusBadgeStyle(runtimeStatus.dueDiligenceConnected ? 'open' : 'degraded')}>
                  {runtimeStatus.dueDiligenceConnected ? t(locale, 'state.ready') : t(locale, 'state.degraded')}
                </span>
              </div>
              <div style={threadSidebarQuickListStyle}>
                <div style={threadSidebarMiniRowStyle}>
                  <div style={threadMiniTitleStyle}>{t(locale, 'pack.due_diligence')}</div>
                  <div style={threadRowMetaStyle}>{t(locale, 'sidebar.rpa_primary_flow')}</div>
                </div>
                {(dashboard && dashboard.pack_id === 'due_diligence'
                  ? dashboard.recent_runs.slice(0, 3)
                  : []
                ).map(run => (
                  <button
                    key={run.run_id}
                    type="button"
                    style={threadSidebarMiniRowStyle}
                    onClick={() => {
                      void openRun(run as LongclawRun)
                    }}
                  >
                    <div style={threadMiniTitleStyle}>
                      {run.summary || run.run_id}
                    </div>
                    <div style={threadRowMetaStyle}>{formatTime(run.created_at)}</div>
                  </button>
                ))}
              </div>
            </>
          )}

          {(page === 'strategy' || page === 'backtest') && (
            <>
              <div style={threadSidebarSectionHeaderStyle}>
                <div>
                  <div style={chromeStyles.eyebrowLight}>
                    {page === 'strategy' ? t(locale, 'nav.strategy') : t(locale, 'nav.backtest')}
                  </div>
                  <div style={threadSidebarHeadingStyle}>{t(locale, 'sidebar.signals_connectors')}</div>
                </div>
                <span style={statusBadgeStyle(runtimeStatus.signalsAvailable ? 'open' : 'degraded')}>
                  {runtimeStatus.signalsAvailable ? t(locale, 'state.ready') : t(locale, 'state.degraded')}
                </span>
              </div>
              <div style={threadSidebarQuickListStyle}>
                {(dashboard && dashboard.pack_id === 'signals'
                  ? [
                      ...(dashboard.connector_health ?? []).slice(0, 3).map(item => ({
                        id: String(item.connector_id ?? 'connector'),
                        title: humanizeTokenLocale(locale, String(item.connector_id ?? 'connector')),
                        meta: [
                          humanizeTokenLocale(locale, String(item.status ?? '')),
                          localizeSystemText(locale, String(item.summary ?? '')),
                        ].filter(Boolean).join(' · '),
                      })),
                    ]
                  : []
                ).map(item => (
                  <div key={item.id} style={threadSidebarMiniRowStyle}>
                    <div style={threadMiniTitleStyle}>{item.title}</div>
                    <div style={threadRowMetaStyle}>{item.meta}</div>
                  </div>
                ))}
                {dashboard && dashboard.pack_id === 'signals' && (
                  (dashboard.review_runs ?? []).slice(0, 2).map(run => (
                    <button
                      key={run.run_id}
                      type="button"
                      style={threadSidebarMiniRowStyle}
                      onClick={() => {
                        void openRun(run as LongclawRun)
                      }}
                    >
                      <div style={threadMiniTitleStyle}>{run.summary || run.run_id}</div>
                      <div style={threadRowMetaStyle}>{formatTime(run.created_at)}</div>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

      </aside>

      <main style={shellLayout.content}>
        {shellLayout.detailBackdrop && (
          <button
            type="button"
            aria-label={t(locale, 'action.close')}
            style={shellLayout.detailBackdrop}
            onClick={() => setSelected(null)}
          />
        )}

        <div style={shellLayout.mainWorkspace}>
          {(error || actionMessage) && (
            <div style={workspaceBannerRowStyle}>
              {error && <div style={utilityStyles.errorBanner}>{localizeSystemText(locale, error)}</div>}
              {!error && actionMessage && (
                <div style={utilityStyles.noticeBanner}>{localizeSystemText(locale, actionMessage)}</div>
              )}
            </div>
          )}

          <div
            style={
              isFullBleedPackPage
                ? strategyWorkspaceScrollStyle
                : isWeChatPage
                  ? wechatWorkspaceScrollStyle
                : workspaceScrollStyle
            }
          >
            {!isFullBleedPackPage && (
              <div style={isWeChatPage ? wechatPageHeaderShellStyle : pageHeaderShellStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={isWeChatPage ? wechatPageEyebrowStyle : chromeStyles.eyebrow}>
                    {pageEyebrow(locale, page)}
                  </div>
                  <h1 style={isWeChatPage ? wechatPageTitleStyle : chromeStyles.headerTitle}>
                    {pageHeading}
                  </h1>
                  {viewportTier === 'wide' && (
                    <div style={isWeChatPage ? wechatPageDescriptionStyle : chromeStyles.subtleText}>
                      {pageDescription(locale, page)}
                    </div>
                  )}
                </div>
                <div style={utilityStyles.buttonCluster}>
                  <button
                    type="button"
                    style={buttonStyleForState(
                      isWeChatPage ? wechatSecondaryButtonStyle : secondaryButtonStyle,
                      loading,
                    )}
                    disabled={loading}
                    onClick={() => {
                      void refresh(page)
                    }}
                  >
                    {loading ? t(locale, 'action.refreshing') : t(locale, 'action.refresh')}
                  </button>
                  {page === 'factory' && (
                    <>
                      <button
                        type="button"
                        style={segmentedButtonStyle(locale === 'zh-CN')}
                        onClick={() => setLocale('zh-CN')}
                      >
                        中文
                      </button>
                      <button
                        type="button"
                        style={segmentedButtonStyle(locale === 'en-US')}
                        onClick={() => setLocale('en-US')}
                      >
                        English
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div style={isFullBleedPackPage ? strategyPageStackStyle : pageStackStyle}>
              {page === 'strategy' && (
                <PackWorkspace
                  locale={locale}
                  surface="strategy"
                  dashboard={dashboard}
                  signalsWebBaseUrl={runtimeStatus.signalsWebBaseUrl}
                  localizedNotice={localizedDashboardNotice}
                  onRunAction={runAction}
                  onOpenRun={openRun}
                  onOpenRecord={openRecord}
                />
              )}

              {page === 'backtest' && (
                <PackWorkspace
                  locale={locale}
                  surface="backtest"
                  dashboard={dashboard}
                  signalsWebBaseUrl={runtimeStatus.signalsWebBaseUrl}
                  localizedNotice={localizedDashboardNotice}
                  onRunAction={runAction}
                  onOpenRun={openRun}
                  onOpenRecord={openRecord}
                />
              )}

              {page === 'execution' && (
                <>
                  {executionJumpContext &&
                    (executionJumpContext.canonicalSessionId ||
                      executionJumpContext.canonicalUserId ||
                      executionJumpContext.contextToken) && (
                      <Section
                        title={locale === 'zh-CN' ? '微信跳转上下文' : 'WeChat jump context'}
                        subtitle={
                          executionJumpContext.sessionTitle ||
                          (locale === 'zh-CN'
                            ? '从微信会话进入执行治理页时保留 canonical 锚点。'
                            : 'Preserve the canonical anchor when jumping from WeChat into execution.')
                        }
                      >
                        <div style={utilityStyles.stackedList}>
                          {executionJumpContext.canonicalSessionId && (
                            <div style={surfaceStyles.listRow}>
                              <div style={chromeStyles.quietMeta}>
                                {t(locale, 'label.canonical_session')}
                              </div>
                              <div style={chromeStyles.monoMeta}>
                                {executionJumpContext.canonicalSessionId}
                              </div>
                            </div>
                          )}
                          {executionJumpContext.canonicalUserId && (
                            <div style={surfaceStyles.listRow}>
                              <div style={chromeStyles.quietMeta}>
                                {t(locale, 'label.canonical_user')}
                              </div>
                              <div style={chromeStyles.monoMeta}>
                                {executionJumpContext.canonicalUserId}
                              </div>
                            </div>
                          )}
                          {executionJumpContext.contextToken && (
                            <div style={surfaceStyles.listRow}>
                              <div style={chromeStyles.quietMeta}>
                                {t(locale, 'label.context_token')}
                              </div>
                              <div style={chromeStyles.monoMeta}>
                                {executionJumpContext.contextToken}
                              </div>
                            </div>
                          )}
                        </div>
                      </Section>
                    )}
                  <ExecutionConsole
                    locale={locale}
                    taskFlowFilter={taskFlowFilter}
                    onSelectTaskFlowFilter={setTaskFlowFilter}
                    taskFlowItems={taskWorkspaceTaskFlowItems}
                    onOpenTaskFlowItem={item => {
                      const nextItem = filteredTaskFlowItems.find(candidate => candidate.id === item.id)
                      if (nextItem) openTaskFlowItem(nextItem)
                    }}
                    continueThreads={taskWorkspaceContinueThreads}
                    onSelectContinueThread={item => {
                      setSelectedThreadId(item.id)
                      if (viewportTier === 'narrow') setThreadSidebarOpen(true)
                    }}
                    pendingItems={taskWorkspacePendingItems}
                    onSelectPendingItem={item => {
                      const nextItem = homePendingItems.find(candidate => candidate.work_item_id === item.id)
                      if (nextItem) openWorkItem(nextItem)
                    }}
                  />
                </>
              )}

              {page === 'wechat' && (
                <WeChatWorkspace
                  locale={locale}
                  viewportTier={viewportTier}
                  sessions={weclawSessions}
                  sourceStatus={weclawSessionSourceStatus}
                  bindingStatus={wechatBindingStatus}
                  routeReceipts={wechatRouteReceipts}
                  pluginDevIssues={pluginDevIssues}
                  search={wechatSearch}
                  sourceFilter={wechatSourceFilter}
                  visibilityFilter={wechatVisibilityFilter}
                  selectedSessionId={selectedWeclawSessionId}
                  selectedSession={selectedWeclawSession}
                  linkedTasks={selectedWeclawLinkedRecords.tasks}
                  linkedRuns={selectedWeclawLinkedRecords.runs}
                  linkedWorkItems={selectedWeclawLinkedRecords.workItems}
                  canonicalJumpContext={jumpContext}
                  preview={preview}
                  onSearchChange={setWechatSearch}
                  onSourceFilterChange={setWechatSourceFilter}
                  onVisibilityFilterChange={setWechatVisibilityFilter}
                  onSelectSession={session => {
                    setSelectedWeclawSessionId(session.sessionId)
                    void openWeclawSession(session.sessionId)
                  }}
                  onClearSelection={clearWeclawSelection}
                  onToggleHidden={session =>
                    updateWeclawSessionState(session, {
                      hidden: !session.hidden,
                      archived: false,
                    })
                  }
                  onToggleArchived={session =>
                    updateWeclawSessionState(session, {
                      archived: !session.archived,
                      hidden: false,
                    })
                  }
                  onOpenLinkedTask={openWeclawLinkedTask}
                  onOpenLinkedRun={openWeclawLinkedRun}
                  onOpenLinkedWorkItem={openWeclawLinkedWorkItem}
                  onOpenAttachment={openArtifact}
                  onCreateBindingSession={createWechatBindingSession}
                  onCreateLocalBindingSession={createLocalWechatBindingSession}
                  onCompleteBindingSession={completeWechatBindingSession}
                  onRevokeBinding={revokeWechatBinding}
                  onRouteMessage={routeWechatMessage}
                  onOpenPluginIssue={openPluginDevIssue}
                />
              )}

              {page === 'factory' && (
                <>
                  <CapabilitiesWorkspace
                    locale={locale}
                    capabilitySummaryItems={capabilitySummaryItems}
                    modePosture={modePosture}
                    sidebarStatusItems={sidebarStatusItems}
                    runtimeStatus={runtimeStatus}
                    selectedWorkMode={selectedWorkMode}
                    selectedModeSpec={selectedModeSpec}
                    localSeatPreference={localSeatPreference}
                    launchBusy={launchBusy}
                    agentMode={agentMode}
                    agentCwd={agentCwd}
                    substrateSummary={substrateSummary}
                    managedSkillEntries={managedSkillEntries}
                    capabilitySkillGroups={capabilitySkillGroups}
                    managedPluginEntries={managedPluginEntries}
                    managedRegistryEntries={managedRegistryEntries}
                    pluginDevIssues={pluginDevIssues}
                    capabilityManagerSettings={capabilityManagerSettings}
                    managedSkillPathDraft={managedSkillPathDraft}
                    onManagedSkillPathDraftChange={setManagedSkillPathDraft}
                    managedPluginPathDraft={managedPluginPathDraft}
                    onManagedPluginPathDraftChange={setManagedPluginPathDraft}
                    extraSkillRootDraft={extraSkillRootDraft}
                    onExtraSkillRootDraftChange={setExtraSkillRootDraft}
                    extraPluginRootDraft={extraPluginRootDraft}
                    onExtraPluginRootDraftChange={setExtraPluginRootDraft}
                    useCapability={useCapability}
                    syncCapabilityRegistry={operation => {
                      void syncCapabilityRegistry(operation)
                    }}
                    updateCapabilityGroup={updateCapabilityGroup}
                    toggleCapabilityVisibility={toggleCapabilityVisibility}
                    openCapabilityLocalPath={openCapabilityLocalPath}
                    copyCapabilityMention={copyCapabilityMention}
                    addDiscoveryRoot={addDiscoveryRoot}
                    removeDiscoveryRoot={removeDiscoveryRoot}
                    openPluginDevIssue={openPluginDevIssue}
                    startPluginDevIssue={startPluginDevIssue}
                    runPluginDevIssueCi={runPluginDevIssueCi}
                    mergePluginDevIssue={mergePluginDevIssueAction}
                    registerPluginDevIssue={registerPluginDevIssueAction}
                  />
                </>
              )}
            </div>
          </div>

          {!isWeChatPage && (
          <aside aria-label={t(locale, 'section.detail.drawer')} style={shellLayout.detailPane}>
            {selected ? (
              <div style={pageStackStyle}>
                <div style={detailHeaderStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={chromeStyles.eyebrowLight}>{t(locale, 'section.detail.drawer')}</div>
                    <h2 style={chromeStyles.sectionTitle}>{selected.title}</h2>
                  </div>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => setSelected(null)}
                  >
                    {t(locale, 'action.close')}
                  </button>
                </div>

                {selected.type === 'run' && (
                  <>
                    <Section
                      title={t(locale, 'section.detail.run_summary.title')}
                      subtitle={t(locale, 'section.detail.run_summary.subtitle')}
                    >
                      <div style={utilityStyles.stackedList}>
                        <span style={statusBadgeStyle(selected.run.status)}>
                          {humanizeTokenLocale(locale, selected.run.status)}
                        </span>
                        {workModeFromRun(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.work_mode')}: {humanizeWorkMode(locale, workModeFromRun(selected.run))}
                          </div>
                        )}
                        {runtimeTargetFromRecord(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.runtime_target')}:{' '}
                            {humanizeTokenLocale(locale, runtimeTargetFromRecord(selected.run))}
                          </div>
                        )}
                        {interactionSurfaceFromRun(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.interaction_surface')}:{' '}
                            {humanizeTokenLocale(locale, interactionSurfaceFromRun(selected.run))}
                          </div>
                        )}
                        {runtimeProfileFromRecord(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.runtime_profile')}:{' '}
                            {humanizeTokenLocale(locale, runtimeProfileFromRecord(selected.run))}
                          </div>
                        )}
                        {modelPlaneFromRecord(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.model_plane')}:{' '}
                            {humanizeTokenLocale(locale, modelPlaneFromRecord(selected.run))}
                          </div>
                        )}
                        {localRuntimeSeatFromRecord(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.local_runtime_seat')}:{' '}
                            {humanizeTokenLocale(locale, localRuntimeSeatFromRecord(selected.run))}
                          </div>
                        )}
                        {originSurfaceFromRun(selected.run) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.origin_surface')}:{' '}
                            {humanizeTokenLocale(locale, originSurfaceFromRun(selected.run))}
                          </div>
                        )}
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.domain')}: {humanizeTokenLocale(locale, selected.run.domain)}
                        </div>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.capability')}: {humanizeTokenLocale(locale, selected.run.capability)}
                        </div>
                        <div style={chromeStyles.monoMeta}>
                          {t(locale, 'label.created')}: {formatTime(selected.run.created_at)}
                        </div>
                        <div style={chromeStyles.monoMeta}>
                          {t(locale, 'label.run_id')}: {selected.run.run_id}
                        </div>
                      </div>
                    </Section>

                    <Section
                      title={t(locale, 'section.detail.artifacts.title')}
                      subtitle={t(locale, 'section.detail.artifacts.subtitle')}
                    >
                      <ArtifactList
                        locale={locale}
                        artifacts={selectedArtifacts}
                        onOpen={openArtifact}
                        onPreview={previewArtifact}
                      />
                    </Section>

                    <Section
                      title={t(locale, 'section.detail.run_metadata.title')}
                      subtitle={t(locale, 'section.detail.run_metadata.subtitle')}
                    >
                      <pre style={surfaceStyles.drawerPre}>
                        {JSON.stringify(selected.run.metadata, null, 2)}
                      </pre>
                    </Section>
                  </>
                )}

                {selected.type === 'work_item' && (
                  <>
                    <Section
                      title={t(locale, 'section.detail.work_item.title')}
                      subtitle={t(locale, 'section.detail.work_item.subtitle')}
                    >
                      <div style={utilityStyles.stackedList}>
                        <span style={statusBadgeStyle(selected.workItem.severity)}>
                          {humanizeTokenLocale(locale, selected.workItem.severity)}
                        </span>
                        {workModeFromWorkItem(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.work_mode')}: {humanizeWorkMode(locale, workModeFromWorkItem(selected.workItem))}
                          </div>
                        )}
                        {runtimeTargetFromRecord(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.runtime_target')}:{' '}
                            {humanizeTokenLocale(locale, runtimeTargetFromRecord(selected.workItem))}
                          </div>
                        )}
                        {interactionSurfaceFromWorkItem(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.interaction_surface')}:{' '}
                            {humanizeTokenLocale(locale, interactionSurfaceFromWorkItem(selected.workItem))}
                          </div>
                        )}
                        {runtimeProfileFromRecord(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.runtime_profile')}:{' '}
                            {humanizeTokenLocale(locale, runtimeProfileFromRecord(selected.workItem))}
                          </div>
                        )}
                        {modelPlaneFromRecord(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.model_plane')}:{' '}
                            {humanizeTokenLocale(locale, modelPlaneFromRecord(selected.workItem))}
                          </div>
                        )}
                        {localRuntimeSeatFromRecord(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.local_runtime_seat')}:{' '}
                            {humanizeTokenLocale(
                              locale,
                              localRuntimeSeatFromRecord(selected.workItem),
                            )}
                          </div>
                        )}
                        {originSurfaceFromWorkItem(selected.workItem) && (
                          <div style={chromeStyles.quietMeta}>
                            {t(locale, 'label.origin_surface')}:{' '}
                            {humanizeTokenLocale(locale, originSurfaceFromWorkItem(selected.workItem))}
                          </div>
                        )}
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.status')}: {humanizeTokenLocale(locale, selected.workItem.status)}
                        </div>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.pack')}: {humanizeTokenLocale(locale, selected.workItem.pack_id)}
                        </div>
                        <div style={workItemSummaryStyle}>{selected.workItem.summary}</div>
                        <ActionButtons
                          actions={selected.workItem.operator_actions}
                          onRun={runAction}
                        />
                      </div>
                    </Section>

                    <Section
                      title={t(locale, 'section.detail.referenced_artifacts.title')}
                      subtitle={t(locale, 'section.detail.referenced_artifacts.subtitle')}
                    >
                      <ArtifactRefList
                        locale={locale}
                        items={selected.workItem.artifact_refs}
                        onOpen={openArtifact}
                        onPreview={previewArtifact}
                      />
                    </Section>
                  </>
                )}

                {selected.type === 'record' && (
                  <>
                    {(readMetadataString(selected.record, 'status') ||
                      readMetadataString(selected.record, 'summary') ||
                      readMetadataString(selected.record, 'connector_id')) && (
                      <Section
                        title={locale === 'zh-CN' ? '摘要' : 'Summary'}
                        subtitle={locale === 'zh-CN' ? '关键状态。' : 'Key status.'}
                      >
                        <div style={utilityStyles.stackedList}>
                          {readMetadataString(selected.record, 'status') && (
                            <span
                              style={statusBadgeStyle(
                                readMetadataString(selected.record, 'status') ?? 'info',
                              )}
                            >
                              {humanizeTokenLocale(
                                locale,
                                readMetadataString(selected.record, 'status'),
                              )}
                            </span>
                          )}
                          {readMetadataString(selected.record, 'connector_id') && (
                            <div style={chromeStyles.quietMeta}>
                              {locale === 'zh-CN' ? '连接器' : 'Connector'}:{' '}
                              {humanizeTokenLocale(
                                locale,
                                readMetadataString(selected.record, 'connector_id'),
                              )}
                            </div>
                          )}
                          {readMetadataString(selected.record, 'summary') && (
                            <div style={workItemSummaryStyle}>
                              {localizeSystemText(
                                locale,
                                readMetadataString(selected.record, 'summary'),
                              )}
                            </div>
                          )}
                        </div>
                      </Section>
                    )}
                    {(readMetadataString(selected.record, 'work_mode') ||
                      readMetadataString(selected.record, 'runtime_target') ||
                      readMetadataString(selected.record, 'interaction_surface') ||
                      readMetadataString(selected.record, 'runtime_profile')) && (
                      <Section
                        title={t(locale, 'section.detail.mode_context.title')}
                        subtitle={t(locale, 'section.detail.mode_context.subtitle')}
                      >
                        <div style={utilityStyles.stackedList}>
                          {readMetadataString(selected.record, 'work_mode') && (
                            <div style={chromeStyles.quietMeta}>
                              {t(locale, 'label.work_mode')}:{' '}
                              {humanizeWorkMode(locale, readMetadataString(selected.record, 'work_mode'))}
                            </div>
                          )}
                          {readMetadataString(selected.record, 'runtime_target') && (
                            <div style={chromeStyles.quietMeta}>
                              {t(locale, 'label.runtime_target')}:{' '}
                              {humanizeTokenLocale(locale,
                                readMetadataString(selected.record, 'runtime_target'),
                              )}
                            </div>
                          )}
                          {readMetadataString(selected.record, 'interaction_surface') && (
                            <div style={chromeStyles.quietMeta}>
                              {t(locale, 'label.interaction_surface')}:{' '}
                              {humanizeTokenLocale(locale,
                                readMetadataString(selected.record, 'interaction_surface'),
                              )}
                            </div>
                          )}
                          {readMetadataString(selected.record, 'runtime_profile') && (
                            <div style={chromeStyles.quietMeta}>
                              {t(locale, 'label.runtime_profile')}:{' '}
                              {humanizeTokenLocale(locale,
                                readMetadataString(selected.record, 'runtime_profile'),
                              )}
                            </div>
                          )}
                          {readMetadataString(selected.record, 'model_plane') && (
                            <div style={chromeStyles.quietMeta}>
                              {t(locale, 'label.model_plane')}:{' '}
                              {humanizeTokenLocale(locale, readMetadataString(selected.record, 'model_plane'))}
                            </div>
                          )}
                          {readMetadataString(selected.record, 'local_runtime_seat') && (
                            <div style={chromeStyles.quietMeta}>
                              {t(locale, 'label.local_runtime_seat')}:{' '}
                              {humanizeTokenLocale(
                                locale,
                                readMetadataString(selected.record, 'local_runtime_seat'),
                              )}
                            </div>
                          )}
                        </div>
                      </Section>
                    )}
                    {selected.actions.length > 0 && (
                      <Section
                        title={t(locale, 'section.detail.operator_actions.title')}
                        subtitle={t(locale, 'section.detail.operator_actions.subtitle')}
                      >
                        <ActionButtons actions={selected.actions} onRun={runAction} />
                      </Section>
                    )}
                    <details style={detailDisclosureStyle}>
                      <summary style={detailDisclosureSummaryStyle}>
                        {t(locale, 'section.detail.record_payload.title')}
                      </summary>
                      <div style={chromeStyles.quietMeta}>
                        {t(locale, 'section.detail.record_payload.subtitle')}
                      </div>
                      <pre style={surfaceStyles.drawerPre}>
                        {JSON.stringify(selected.record, null, 2)}
                      </pre>
                    </details>
                  </>
                )}

                {selected.type === 'weclaw_session' && (
                  <>
                    <Section
                      title={t(locale, 'section.detail.weclaw_session.title')}
                      subtitle={t(locale, 'section.detail.weclaw_session.subtitle')}
                    >
                      <div style={utilityStyles.stackedList}>
                        <span
                          style={statusBadgeStyle(
                            selected.session.archived
                              ? 'info'
                              : selected.session.hidden
                                ? 'degraded'
                                : 'open',
                          )}
                        >
                          {selected.session.archived
                            ? locale === 'zh-CN'
                              ? '已归档'
                              : 'Archived'
                            : selected.session.hidden
                              ? locale === 'zh-CN'
                                ? '已隐藏'
                                : 'Hidden'
                              : t(locale, 'state.readonly')}
                        </span>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.user_id')}: {selected.session.userId ?? humanizeTokenLocale(locale, 'unknown')}
                        </div>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.updated')}: {formatTime(selected.session.updatedAt)}
                        </div>
                        <div style={chromeStyles.monoMeta}>
                          {t(locale, 'label.session_id')}: {selected.session.sessionId}
                        </div>
                        <div style={chromeStyles.monoMeta}>
                          {t(locale, 'label.file_path')}: {selected.session.filePath}
                        </div>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.message_count')}: {selected.session.messageCount}
                        </div>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.agent_reply_count')}: {selected.session.agentReplyCount}
                        </div>
                        <div style={chromeStyles.quietMeta}>
                          {t(locale, 'label.media_count')}: {selected.session.mediaCount}
                        </div>
                        {weclawCanonicalSessionId(selected.session) && (
                          <div style={chromeStyles.monoMeta}>
                            {t(locale, 'label.canonical_session')}: {weclawCanonicalSessionId(selected.session)}
                          </div>
                        )}
                        {weclawCanonicalUserId(selected.session) && (
                          <div style={chromeStyles.monoMeta}>
                            {t(locale, 'label.canonical_user')}: {weclawCanonicalUserId(selected.session)}
                          </div>
                        )}
                        {weclawContextToken(selected.session) && (
                          <div style={chromeStyles.monoMeta}>
                            {t(locale, 'label.context_token')}: {weclawContextToken(selected.session)}
                          </div>
                        )}
                        <div style={managerActionsRowStyle}>
                          <button
                            type="button"
                            style={secondaryButtonStyle}
                            onClick={() => {
                              setSelected(null)
                              setSelectedWeclawSessionId(null)
                            }}
                          >
                            {locale === 'zh-CN' ? '取消选中' : 'Clear selection'}
                          </button>
                          <button
                            type="button"
                            style={secondaryButtonStyle}
                            onClick={() =>
                              updateWeclawSessionState(selected.session, {
                                hidden: !selected.session.hidden,
                                archived: false,
                              })
                            }
                          >
                            {selected.session.hidden
                              ? locale === 'zh-CN'
                                ? '取消隐藏'
                                : 'Unhide'
                              : locale === 'zh-CN'
                                ? '隐藏会话'
                                : 'Hide session'}
                          </button>
                          <button
                            type="button"
                            style={secondaryButtonStyle}
                            onClick={() =>
                              updateWeclawSessionState(selected.session, {
                                archived: !selected.session.archived,
                                hidden: false,
                              })
                            }
                          >
                            {selected.session.archived
                              ? locale === 'zh-CN'
                                ? '取消归档'
                                : 'Restore'
                              : locale === 'zh-CN'
                                ? '归档会话'
                                : 'Archive session'}
                          </button>
                        </div>
                      </div>
                    </Section>

                    {(selectedWeclawLinkedRecords.tasks.length > 0 ||
                      selectedWeclawLinkedRecords.runs.length > 0 ||
                      selectedWeclawLinkedRecords.workItems.length > 0) && (
                      <Section
                        title={t(locale, 'section.detail.weclaw_links.title')}
                        subtitle={t(locale, 'section.detail.weclaw_links.subtitle')}
                      >
                        <div style={utilityStyles.stackedList}>
                          {selectedWeclawLinkedRecords.tasks.map(task => (
                            <QueueRow
                              key={task.task_id}
                              locale={locale}
                              title={readMetadataString(task as unknown as Record<string, unknown>, 'requested_outcome') ?? task.capability}
                              meta={formatModeMeta([
                                humanizeWorkMode(locale, workModeFromTask(task)),
                                humanizeTokenLocale(locale, task.status),
                              ])}
                              status={task.status}
                              nextAction={t(locale, 'action.inspect_launch')}
                              onSelect={() =>
                                openRecord(
                                  t(locale, 'section.detail.weclaw_links.task'),
                                  task as unknown as Record<string, unknown>,
                                )
                              }
                            />
                          ))}
                          {selectedWeclawLinkedRecords.runs.map(run => (
                            <QueueRow
                              key={run.run_id}
                              locale={locale}
                              title={run.summary || run.run_id}
                              meta={formatModeMeta([
                                humanizeTokenLocale(locale, run.domain),
                                formatTime(run.created_at),
                              ])}
                              status={run.status}
                              nextAction={t(locale, 'action.inspect_launch')}
                              onSelect={() => {
                                void openRun(run)
                              }}
                            />
                          ))}
                          {selectedWeclawLinkedRecords.workItems.map(workItem => (
                            <QueueRow
                              key={workItem.work_item_id}
                              locale={locale}
                              title={workItem.title}
                              meta={formatModeMeta([
                                humanizeTokenLocale(locale, workItem.pack_id),
                                humanizeTokenLocale(locale, workItem.kind),
                              ])}
                              status={workItem.severity}
                              description={workItem.summary}
                              nextAction={t(locale, 'action.inspect_launch')}
                              onSelect={() => openWorkItem(workItem)}
                            />
                          ))}
                        </div>
                      </Section>
                    )}

                    <Section
                      title={t(locale, 'section.detail.weclaw_messages.title')}
                      subtitle={t(locale, 'section.detail.weclaw_messages.subtitle')}
                    >
                      {selected.session.messages.length === 0 ? (
                        <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_weclaw_messages')}</div>
                      ) : (
                        <div style={utilityStyles.stackedList}>
                          {selected.session.messages.map(message => (
                            <div key={message.messageId} style={weclawMessageCardStyle}>
                              <div style={weclawMessageHeaderStyle}>
                                <span
                                  style={statusBadgeStyle(
                                    ['agent', 'assistant'].includes(message.role) ? 'open' : 'info',
                                  )}
                                >
                                  {humanizeTokenLocale(locale, message.role)}
                                </span>
                                <div style={chromeStyles.quietMeta}>
                                  {formatModeMeta([
                                    message.agentName,
                                    message.kind ? humanizeTokenLocale(locale, message.kind) : undefined,
                                    message.createdAt ? formatTime(message.createdAt) : undefined,
                                  ])}
                                </div>
                              </div>
                              {message.text && <div style={weclawMessageBodyStyle}>{message.text}</div>}
                              <WeclawAttachmentList
                                locale={locale}
                                attachments={message.attachments}
                                onOpen={openArtifact}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>

                    <Section
                      title={t(locale, 'section.detail.weclaw_media.title')}
                      subtitle={t(locale, 'section.detail.weclaw_media.subtitle')}
                    >
                      {selected.session.media.length === 0 ? (
                        <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_weclaw_media')}</div>
                      ) : (
                        <WeclawAttachmentList
                          locale={locale}
                          attachments={selected.session.media}
                          onOpen={openArtifact}
                        />
                      )}
                    </Section>

                    <Section
                      title={t(locale, 'section.detail.record_payload.title')}
                      subtitle={t(locale, 'section.detail.record_payload.subtitle')}
                    >
                      <pre style={surfaceStyles.drawerPre}>
                        {JSON.stringify(selected.session.canonicalMetadata, null, 2)}
                      </pre>
                    </Section>
                  </>
                )}

                {preview && (
                  <Section title={t(locale, 'section.detail.preview.title')} subtitle={preview.uri}>
                    <pre style={surfaceStyles.drawerPre}>{preview.text}</pre>
                  </Section>
                )}
              </div>
            ) : (
              <div style={utilityStyles.emptyState}>{t(locale, 'empty.select_detail')}</div>
            )}
          </aside>
          )}
        </div>
      </main>
    </div>
  )
}

const wechatShellPalette = tradingDeskTheme.colors

const pageStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const strategyPageStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
}

const weclawMessageCardStyle: React.CSSProperties = {
  ...surfaceStyles.listRow,
  flexDirection: 'column',
  alignItems: 'stretch',
}

const weclawMessageHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
}

const weclawMessageBodyStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 14,
  lineHeight: 1.7,
  whiteSpace: 'pre-wrap',
}

const queueRowLeadStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
}

const queueRowTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 15,
  lineHeight: 1.35,
  fontWeight: 600,
}

const queueRowDescriptionStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
}

const healthGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
}

const subsectionTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 14,
  fontWeight: 600,
}

const detailHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const detailDisclosureStyle: React.CSSProperties = {
  ...surfaceStyles.section,
}

const detailDisclosureSummaryStyle: React.CSSProperties = {
  ...chromeStyles.sectionTitle,
  cursor: 'pointer',
  listStyle: 'none',
}

const workItemSummaryStyle: React.CSSProperties = {
  color: palette.ink,
  lineHeight: 1.55,
}

const railBrandStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 6,
  paddingBottom: 2,
}

const railMonogramStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  background: tradingDeskTheme.gradients.island,
  border: `1px solid ${tradingDeskTheme.alpha.textBorderStrong}`,
  color: palette.ink,
  display: 'grid',
  placeItems: 'center',
  boxShadow: tradingDeskTheme.shadows.island,
  fontFamily: fontStacks.mono,
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: '0.08em',
}

const railBrandLabelStyle: React.CSSProperties = {
  color: tradingDeskTheme.colors.text,
  fontSize: 13,
  lineHeight: 1.35,
  textAlign: 'left',
  fontWeight: 700,
  whiteSpace: 'normal',
}

const railBrandCaptionStyle: React.CSSProperties = {
  color: tradingDeskTheme.colors.muted,
  fontSize: 10.5,
  fontWeight: 600,
  lineHeight: 1.25,
  textAlign: 'left',
  maxWidth: 108,
}

const railModeLabelStyle: React.CSSProperties = {
  display: 'none',
  color: tradingDeskTheme.colors.muted,
  fontFamily: fontStacks.mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  lineHeight: 1,
  textAlign: 'center',
  textTransform: 'uppercase',
}

const railNavStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

function railNavButtonStyle(active: boolean): React.CSSProperties {
  return {
    borderRadius: 11,
    border: `1px solid ${active ? tradingDeskTheme.alpha.textBorderStrong : 'transparent'}`,
    background: active
      ? tradingDeskTheme.gradients.island
      : tradingDeskTheme.alpha.panelWash,
    color: active ? palette.ink : tradingDeskTheme.colors.text,
    minHeight: 38,
    padding: '6px 7px',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: active
      ? tradingDeskTheme.shadows.island
      : 'inset 0 1px rgba(255, 255, 255, 0.02)',
    transition:
      'background 160ms ease-out, border-color 160ms ease-out, color 160ms ease-out, box-shadow 160ms ease-out, transform 160ms ease-out, filter 160ms ease-out',
  }
}

function railNavButtonGlyphStyle(active: boolean): React.CSSProperties {
  return {
    width: 25,
    height: 25,
    borderRadius: 9,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    background: active ? tradingDeskTheme.alpha.accentSurface : tradingDeskTheme.alpha.panelWash,
    border: `1px solid ${active ? tradingDeskTheme.alpha.accentBorder : tradingDeskTheme.alpha.textHairline}`,
    color: active ? tradingDeskTheme.colors.accentText : palette.ink,
    boxShadow: active ? 'inset 0 0 0 1px rgba(255, 184, 107, 0.16)' : undefined,
    fontFamily: fontStacks.mono,
    fontSize: 11,
    fontWeight: 700,
    lineHeight: 1,
  }
}

const railNavButtonLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  lineHeight: 1.15,
  fontWeight: 700,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const railStatusStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  gap: 6,
}

const railStatusItemStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  flex: 1,
  minWidth: 0,
  padding: '6px 5px',
  borderRadius: 10,
  background: tradingDeskTheme.alpha.panelWash,
  border: `1px solid ${tradingDeskTheme.alpha.textHairline}`,
  boxShadow: 'inset 0 1px rgba(255, 255, 255, 0.035)',
}

function railStatusSignalStyle(status: string): React.CSSProperties {
  const isHealthy = ['available', 'open', 'connected', 'ready'].includes(status)
  return {
    width: 7,
    height: 7,
    borderRadius: 999,
    background: isHealthy ? 'rgba(75, 191, 126, 0.95)' : 'rgba(199, 146, 47, 0.95)',
    boxShadow: isHealthy
      ? '0 0 0 4px rgba(75, 191, 126, 0.12)'
      : '0 0 0 4px rgba(199, 146, 47, 0.12)',
  }
}

const railStatusLabelStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 10.5,
  lineHeight: 1.25,
  textAlign: 'center',
  fontWeight: 700,
}

const railStatusMetaStyle: React.CSSProperties = {
  display: 'none',
  color: tradingDeskTheme.colors.muted,
  fontSize: 10,
  lineHeight: 1.3,
  textAlign: 'left',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const threadSidebarSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: '16px 14px 0',
}

const threadSidebarSectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const threadSidebarHeadingStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 17,
  lineHeight: 1.25,
  fontWeight: 600,
}

const wechatSidebarEyebrowStyle: React.CSSProperties = {
  color: tradingDeskTheme.colors.mutedStrong,
  fontSize: 11,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
}

const wechatSidebarHeadingStyle: React.CSSProperties = {
  color: wechatShellPalette.textStrong,
  fontSize: 17,
  lineHeight: 1.25,
  fontWeight: 700,
}

const wechatSidebarCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '12px 13px',
  borderRadius: 5,
  border: `1px solid ${wechatShellPalette.border}`,
  background: wechatShellPalette.panel,
}

const wechatSidebarCardValueStyle: React.CSSProperties = {
  color: wechatShellPalette.textStrong,
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 700,
}

const wechatSidebarMetaStyle: React.CSSProperties = {
  color: wechatShellPalette.muted,
  fontSize: 12,
  lineHeight: 1.4,
}

const threadSidebarQuickStackStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const threadSidebarChipStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  padding: '7px 10px',
}

const threadSidebarWorkspaceCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px 11px',
  borderRadius: 12,
  border: `1px solid ${palette.border}`,
  background: palette.panelRaised,
}

const threadSidebarWorkspaceValueStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 15,
  lineHeight: 1.35,
  fontWeight: 600,
}

const threadListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 0,
}

function threadRowStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 13px',
    borderRadius: 16,
    border: `1px solid ${active ? tradingDeskTheme.alpha.accentBorder : palette.border}`,
    background: active ? tradingDeskTheme.alpha.accentSurface : palette.panelRaised,
    textAlign: 'left',
    cursor: 'pointer',
  }
}

const threadRowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 8,
}

const threadRowTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 600,
}

const threadRowMetaStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.4,
}

const threadSidebarQuickListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const threadSidebarMiniRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '10px 12px',
  borderRadius: 14,
  border: `1px solid ${palette.border}`,
  background: palette.panelRaised,
  textAlign: 'left',
  cursor: 'pointer',
}

const wechatSidebarMiniRowStyle: React.CSSProperties = {
  ...threadSidebarMiniRowStyle,
  borderRadius: 5,
  border: `1px solid ${wechatShellPalette.border}`,
  background: wechatShellPalette.panelSoft,
}

const threadMiniTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 600,
}

const wechatSidebarMiniTitleStyle: React.CSSProperties = {
  color: wechatShellPalette.textStrong,
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 700,
}

const wechatSidebarEmptyStyle: React.CSSProperties = {
  border: `1px dashed ${wechatShellPalette.borderStrong}`,
  borderRadius: 5,
  background: wechatShellPalette.panel,
  color: wechatShellPalette.muted,
  padding: '12px 10px',
  textAlign: 'center',
  fontSize: 13,
  lineHeight: 1.4,
}

const workspaceBannerRowStyle: React.CSSProperties = {
  padding: '18px 22px 0',
}

const threadHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 18,
  padding: '22px 24px 16px',
  borderBottom: `1px solid ${palette.border}`,
  background: 'rgba(21, 31, 45, 0.72)',
  backdropFilter: 'blur(14px)',
}

const threadHeaderLeadStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const threadHeaderMetaStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
  flexShrink: 0,
}

const transcriptViewportStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 24px 24px',
}

const transcriptEmptyStateStyle: React.CSSProperties = {
  ...surfaceStyles.section,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minHeight: 240,
  justifyContent: 'center',
}

const transcriptStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

function conversationEventStyle(type: ConversationEvent['type']): React.CSSProperties {
  const userLaunch = type === 'user_launch'
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: userLaunch ? '16px 18px' : '14px 16px',
    borderRadius: 20,
    border: `1px solid ${userLaunch ? tradingDeskTheme.alpha.accentBorder : palette.border}`,
    background: userLaunch ? tradingDeskTheme.alpha.accentSurface : palette.panelRaised,
    textAlign: 'left',
    cursor: 'pointer',
    boxShadow: userLaunch ? tradingDeskTheme.shadows.glow : 'none',
  }
}

const conversationEventHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
}

const conversationEventTypeStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 11,
  lineHeight: 1.2,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontFamily: fontStacks.mono,
}

const conversationEventTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 16,
  lineHeight: 1.4,
  fontWeight: 600,
}

const conversationEventBodyStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 14,
  lineHeight: 1.55,
  whiteSpace: 'pre-wrap',
}

const conversationEventMetaStyle: React.CSSProperties = {
  color: palette.textSoft,
  fontSize: 12,
  lineHeight: 1.45,
}

const composerDockStyle: React.CSSProperties = {
  padding: '0 24px 22px',
  borderTop: `1px solid ${palette.border}`,
  background:
    'linear-gradient(180deg, rgba(8, 11, 18, 0) 0%, rgba(8, 11, 18, 0.78) 32%, rgba(8, 11, 18, 0.98) 100%)',
}

const composerSurfaceStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: tradingDeskTheme.radius.island,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.panelRaised,
  boxShadow: tradingDeskTheme.shadows.panel,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const homeLauncherSurfaceStyle: React.CSSProperties = {
  ...composerSurfaceStyle,
  marginTop: 0,
}

const localSeatPreferenceSurfaceStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  padding: '10px 12px',
  borderRadius: 16,
  border: `1px solid ${palette.border}`,
  background: palette.panel,
}

const composerHeaderRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const composerStatusRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
}

const chatComposerSelectStyle: React.CSSProperties = {
  ...utilityStyles.select,
  minWidth: 220,
  borderRadius: 14,
}

const chatComposerTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 116,
  borderRadius: 18,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.paper,
  color: palette.ink,
  padding: '14px 16px',
  resize: 'vertical',
  fontSize: 14,
  lineHeight: 1.55,
  outline: 'none',
}

const chatComposerFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 16,
  flexWrap: 'wrap',
}

const chatComposerHintsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const chatHintChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${palette.border}`,
  background: palette.panel,
  color: palette.textMuted,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
}

const workspaceScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '18px 18px 20px',
}

const strategyWorkspaceScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: 0,
  background: tradingDeskTheme.colors.rootElevated,
}

function wechatThreadSidebarShellStyle(base: React.CSSProperties): React.CSSProperties {
  return {
    ...base,
    borderRight: `1px solid ${wechatShellPalette.border}`,
    background: wechatShellPalette.root,
    color: wechatShellPalette.text,
  }
}

const wechatWorkspaceScrollStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '0 14px 16px',
  background: wechatShellPalette.root,
}

const wechatPageHeaderShellStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '10px 0 8px',
  marginBottom: 0,
  background: wechatShellPalette.root,
}

const wechatPageEyebrowStyle: React.CSSProperties = {
  color: tradingDeskTheme.colors.mutedStrong,
  fontSize: 11,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
}

const wechatPageTitleStyle: React.CSSProperties = {
  margin: 0,
  color: wechatShellPalette.textStrong,
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 800,
  letterSpacing: 0,
}

const wechatPageDescriptionStyle: React.CSSProperties = {
  color: wechatShellPalette.muted,
  fontSize: 13,
  lineHeight: 1.45,
  maxWidth: 760,
}

const wechatSecondaryButtonStyle: React.CSSProperties = {
  border: `1px solid ${wechatShellPalette.borderStrong}`,
  borderRadius: 5,
  background: tradingDeskTheme.colors.control,
  color: tradingDeskTheme.colors.controlText,
  padding: '8px 11px',
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 13,
  fontWeight: 700,
}

const pageHeaderShellStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '10px 12px',
  marginBottom: 8,
  borderRadius: 8,
  border: `1px solid ${palette.border}`,
  background: palette.panel,
  boxShadow: 'none',
}

const pageHeaderActionsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 8,
}

const homeContextGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
}

const homeContextCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 16px',
  borderRadius: 16,
  border: `1px solid ${palette.border}`,
  background: palette.panel,
  minWidth: 0,
}

const homeContextValueStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 16,
  lineHeight: 1.35,
  fontWeight: 600,
  wordBreak: 'break-word',
}

const homeContextMetaStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
  wordBreak: 'break-word',
}

const packGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
}

const homeGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
  alignItems: 'start',
}

const homePrimaryColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const homeSecondaryColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const launchComposerStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const modeSelectorGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
}

function modeCardStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '14px 16px',
    borderRadius: 16,
    border: `1px solid ${active ? tradingDeskTheme.alpha.accentBorder : palette.border}`,
    background: active ? tradingDeskTheme.alpha.accentSurface : palette.panel,
    color: palette.ink,
    textAlign: 'left',
    cursor: 'pointer',
  }
}

const modeCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 10,
}

const modeCardTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 16,
  lineHeight: 1.3,
  fontWeight: 600,
}

const launchContextGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const launchContextTileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 10,
  borderRadius: 12,
  background: tradingDeskTheme.alpha.panelWash,
  border: `1px solid ${tradingDeskTheme.alpha.textHairline}`,
}

const contextValueStyle: React.CSSProperties = {
  color: palette.inspectText,
  fontSize: 15,
  lineHeight: 1.35,
  fontWeight: 600,
}

const launchTextAreaRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const launchTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 156,
  borderRadius: 16,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.panelRaised,
  color: palette.ink,
  padding: '16px 18px',
  resize: 'vertical',
  fontSize: 14,
  lineHeight: 1.55,
  outline: 'none',
}

const capabilityRailStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
}

function capabilityChipStyle(kind: CapabilityItem['kind']): React.CSSProperties {
  const pack = kind === 'pack'
  return {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    border: `1px solid ${pack ? 'rgba(47, 140, 255, 0.28)' : palette.border}`,
    background: pack ? tradingDeskTheme.alpha.auroraBlue : palette.panel,
    color: palette.ink,
    cursor: 'pointer',
    textAlign: 'left',
  }
}

const capabilityChipBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
}

const capabilityChipLabelStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 600,
  color: palette.ink,
}

const capabilityChipHintStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.4,
}

const launchPreviewStyle: React.CSSProperties = {
  margin: 0,
  marginTop: 8,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  maxHeight: 220,
  overflow: 'auto',
  fontSize: 12,
  lineHeight: 1.55,
  color: palette.inspectText,
}

const snapshotLeadStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '4px 2px 2px',
}

const studioGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
}

const modePostureGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
}

const modePostureCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: palette.panel,
  border: `1px solid ${palette.border}`,
}

const studioGroupStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const studioGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: palette.panel,
  border: `1px solid ${palette.border}`,
}

const studioGroupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 10,
}

const managerCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 12,
  borderRadius: 14,
  border: `1px solid ${palette.border}`,
  background: palette.panelRaised,
}

const managerRowMetaStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
  wordBreak: 'break-all',
}

const managerActionsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
}

const managerInputStyle: React.CSSProperties = {
  minWidth: 180,
  flex: '1 1 220px',
  borderRadius: 12,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.panel,
  color: palette.ink,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.4,
  outline: 'none',
}
