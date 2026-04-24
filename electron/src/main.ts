import { app, BrowserWindow, ipcMain, dialog, shell, clipboard } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { createBackend, AgentBackend, AgentMode } from './agent-backend.js'
import { inspectConfiguredAcpBridge } from './acp-client.js'
import {
  dispatchToLocalRuntimeApi,
  normalizeLocalRuntimeSeatPreference,
  probeLocalRuntimeSeat,
  resolveLocalRuntimeSeat,
  type LocalRuntimeSeat,
  type LocalRuntimeSeatPreference,
  type LocalRuntimeSeatResolution,
} from './local-runtime-seat.js'
import {
  readRuntimeCapabilityRegistry,
  registerRuntimeCapability,
  removeRuntimeCapability,
  rescanRuntimeCapabilityRegistry,
  runtimeDiscoveryRoots,
  type RuntimeCapabilityKind,
  type RuntimeCapabilityRegistry,
} from './runtime/capabilityRegistry.js'
import {
  canonicalWeclawSessionId,
  mergeWeclawSessionUiFlags,
  normalizeWeclawSessionUiState,
  type WeclawSessionUiState,
} from './runtime/weclawSessionState.js'
import { createLongclawControlPlaneClientFromEnv } from '../../src/services/longclawControlPlane/client.js'
import {
  LongclawCapabilitySubstrateSummarySchema,
  type LongclawCapabilityEntry,
  type LongclawCapabilitySubstrateSummary,
  type LongclawDomainPackDescriptor,
  type LongclawLaunchIntent,
  type LongclawLaunchMention,
  type LongclawTask,
  LongclawLaunchIntentSchema,
  LongclawLaunchReceiptSchema,
  LongclawRunSchema,
  LongclawTaskSchema,
  LongclawWorkItemSchema,
} from '../../src/services/longclawControlPlane/models.js'

const ELECTRON_DIST_DIR = __dirname
const REPO_ROOT = path.resolve(ELECTRON_DIST_DIR, '..', '..')
const PRODUCT_OBSERVATION_ROOT = path.join(REPO_ROOT, 'reports', 'product-observations')
const LONGCLAW_LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Longclaw')
const OBSERVATION_PRODUCT_LINE = 'longclaw-electron-signals'

type ObservationCounterKey = 'events' | 'api_timings' | 'main_logs' | 'renderer_errors'

type ObservationState = {
  run_id: string
  product_line: string
  scenario: string
  started_at: string
  repo_root: string
  observation_dir: string
  logs: {
    electron_current: string
    electron_session: string
    electron_observation: string
  }
  git: {
    sha: string | null
    dirty: boolean
    status_short: string
  }
  runtime: {
    electron_pid: number
    node_version: string
    platform: string
    signals_web_port: string
    signals_web2_port: string
  }
  counters: Record<ObservationCounterKey, number>
  memory_refs: string[]
}

function timestampSlug(value = new Date()): string {
  return value.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sanitizeSlug(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized || fallback
}

function stringifyLogValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function safeExecGit(args: string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const observationStartedAt = new Date()
const observationScenario = sanitizeSlug(
  process.env.LONGCLAW_OBSERVATION_SCENARIO ?? 'manual-electron-session',
  'manual-electron-session',
)
const observationRunId = sanitizeSlug(
  process.env.LONGCLAW_OBSERVATION_RUN_ID ?? `${timestampSlug(observationStartedAt)}-${observationScenario}`,
  `${timestampSlug(observationStartedAt)}-${observationScenario}`,
)
const observationDir = path.resolve(
  process.env.LONGCLAW_OBSERVATION_DIR || path.join(PRODUCT_OBSERVATION_ROOT, observationRunId),
)
const observationScreenshotsDir = path.join(observationDir, 'screenshots')
const electronSessionLogPath = path.join(
  LONGCLAW_LOG_DIR,
  `electron-${timestampSlug(observationStartedAt)}.log`,
)
const electronCurrentLogPath = path.join(LONGCLAW_LOG_DIR, 'electron-current.log')
const observationElectronLogPath = path.join(observationDir, 'electron.log')
const observationEventsPath = path.join(observationDir, 'events.jsonl')
const observationApiTimingsPath = path.join(observationDir, 'api-timings.jsonl')
const observationJsonPath = path.join(observationDir, 'observation.json')
const observationMarkdownPath = path.join(observationDir, 'observation.md')

const gitStatusShort = safeExecGit(['status', '--short']) ?? ''
const observationState: ObservationState = {
  run_id: observationRunId,
  product_line: OBSERVATION_PRODUCT_LINE,
  scenario: observationScenario,
  started_at: observationStartedAt.toISOString(),
  repo_root: REPO_ROOT,
  observation_dir: observationDir,
  logs: {
    electron_current: electronCurrentLogPath,
    electron_session: electronSessionLogPath,
    electron_observation: observationElectronLogPath,
  },
  git: {
    sha: safeExecGit(['rev-parse', '--short', 'HEAD']),
    dirty: Boolean(gitStatusShort),
    status_short: gitStatusShort,
  },
  runtime: {
    electron_pid: process.pid,
    node_version: process.version,
    platform: `${process.platform}-${process.arch}`,
    signals_web_port: process.env.LONGCLAW_SIGNALS_WEB_PORT ?? '8011',
    signals_web2_port: process.env.LONGCLAW_SIGNALS_WEB2_PORT ?? '6008',
  },
  counters: {
    events: 0,
    api_timings: 0,
    main_logs: 0,
    renderer_errors: 0,
  },
  memory_refs: [],
}

function ensureObservationFiles() {
  fs.mkdirSync(LONGCLAW_LOG_DIR, { recursive: true })
  fs.mkdirSync(observationScreenshotsDir, { recursive: true })
  fs.writeFileSync(electronCurrentLogPath, '', 'utf-8')
  for (const filePath of [observationEventsPath, observationApiTimingsPath, observationElectronLogPath]) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '', 'utf-8')
  }
  writeObservationJson()
  if (!fs.existsSync(observationMarkdownPath)) {
    fs.writeFileSync(observationMarkdownPath, renderObservationMarkdown(), 'utf-8')
  }
}

function readExistingObservationJson(): Record<string, unknown> {
  try {
    if (!fs.existsSync(observationJsonPath)) return {}
    const parsed = JSON.parse(fs.readFileSync(observationJsonPath, 'utf-8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

function mergeMemoryRefs(...values: unknown[]): string[] {
  const refs = new Set<string>()
  for (const value of values) {
    if (!Array.isArray(value)) continue
    for (const item of value) {
      if (typeof item === 'string' && item.trim()) refs.add(item)
    }
  }
  return [...refs].sort()
}

function writeObservationJson() {
  try {
    fs.mkdirSync(observationDir, { recursive: true })
    const existing = readExistingObservationJson()
    const payload = {
      ...existing,
      ...observationState,
      memory_refs: mergeMemoryRefs(existing.memory_refs, observationState.memory_refs),
    }
    fs.writeFileSync(
      observationJsonPath,
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf-8',
    )
  } catch (error) {
    process.stderr.write(`[longxiaoxia] failed to write observation.json ${String(error)}\n`)
  }
}

function renderObservationMarkdown(): string {
  return [
    `# Longclaw 产品观察日记`,
    ``,
    `## 假设`,
    ``,
    `本次观察用于保留 Electron + Signals 人工体验和自动 smoke 的上下文；具体问题由 events/api-timings/electron.log 共同复盘。`,
    ``,
    `## 复现`,
    ``,
    `打开 Electron 后按场景执行操作，页面行为、tab/周期/标的切换和 API 请求会写入本目录。`,
    ``,
    `## 最小改动`,
    ``,
    `本轮先建立观察日记、持久日志和 API telemetry，不改 control-plane schema。`,
    ``,
    `## 验证`,
    ``,
    `检查 observation.json、events.jsonl、api-timings.jsonl、electron.log 是否完整生成；必要时运行 observation:finalize 写入 MemPalace。`,
    ``,
    `## 上下文`,
    ``,
    `- run_id: ${observationState.run_id}`,
    `- product_line: ${observationState.product_line}`,
    `- scenario: ${observationState.scenario}`,
    `- started_at: ${observationState.started_at}`,
    `- git_sha: ${observationState.git.sha ?? 'unknown'}`,
    `- git_dirty: ${observationState.git.dirty ? 'yes' : 'no'}`,
    `- electron_pid: ${observationState.runtime.electron_pid}`,
    `## 证据路径`,
    ``,
    `- observation.json: ${observationJsonPath}`,
    `- events.jsonl: ${observationEventsPath}`,
    `- api-timings.jsonl: ${observationApiTimingsPath}`,
    `- electron.log: ${observationElectronLogPath}`,
    `- screenshots: ${observationScreenshotsDir}`,
    ``,
  ].join('\n')
}

function appendLine(filePath: string, line: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.appendFileSync(filePath, `${line}\n`, 'utf-8')
}

function writePersistentLog(line: string) {
  try {
    appendLine(electronSessionLogPath, line)
    fs.writeFileSync(electronCurrentLogPath, `${line}\n`, { encoding: 'utf-8', flag: 'a' })
    appendLine(observationElectronLogPath, line)
    observationState.counters.main_logs += 1
    writeObservationJson()
  } catch (error) {
    process.stderr.write(`[longxiaoxia] failed to persist log ${String(error)}\n`)
  }
}

function log(...args: any[]) {
  const msg = args.map(stringifyLogValue).join(' ')
  const line = `[${new Date().toISOString()}] [longxiaoxia] ${msg}`
  process.stderr.write(`${line}\n`)
  writePersistentLog(line)
}

function compactObservationValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return value.length > 2_000 ? `${value.slice(0, 2_000)}…[truncated]` : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 50).map(compactObservationValue)
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      result[key] = compactObservationValue(nested)
    }
    return result
  }
  return String(value)
}

function classifyRendererConsoleMessage(
  level: number,
  message: string,
): { level: 'info' | 'warning' | 'error'; category?: string; dev_only?: boolean } {
  if (message.includes('Electron Security Warning')) {
    return {
      level: 'warning',
      category: 'electron-security-warning',
      dev_only: true,
    }
  }
  if (level >= 2) return { level: 'error' }
  if (level === 1) return { level: 'warning' }
  return { level: 'info' }
}

function appendObservationJsonl(
  filePath: string,
  counter: 'events' | 'api_timings',
  payload: Record<string, unknown>,
) {
  try {
    appendLine(
      filePath,
      JSON.stringify({
        at: new Date().toISOString(),
        run_id: observationState.run_id,
        ...(compactObservationValue(payload) as Record<string, unknown>),
      }),
    )
    observationState.counters[counter] += 1
    if (payload.level === 'error' || payload.ok === false) {
      observationState.counters.renderer_errors += 1
    }
    writeObservationJson()
  } catch (error) {
    log('failed to append observation jsonl', { filePath, error: String(error) })
  }
}

ensureObservationFiles()

const STACK_ENV_PATH = path.join(os.homedir(), '.longclaw', 'runtime-v2', 'stack.env')
const LONGCLAW_RUNTIME_DIR = path.join(os.homedir(), '.longclaw', 'runtime-v2')
const CAPABILITY_MANAGER_SETTINGS_PATH = path.join(
  LONGCLAW_RUNTIME_DIR,
  'capability-manager.json',
)
const CAPABILITY_REGISTRY_PATH = path.join(LONGCLAW_RUNTIME_DIR, 'capability-registry.json')
const WECLAW_SESSION_UI_STATE_PATH = path.join(
  LONGCLAW_RUNTIME_DIR,
  'weclaw-session-state.json',
)
const WECLAW_CONFIG_PATH = path.join(os.homedir(), '.weclaw', 'config.json')
const DEFAULT_WECLAW_WORKSPACE = path.join(os.homedir(), '.weclaw', 'workspace')

function stripShellQuotes(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function loadRuntimeStackEnv(): { loaded: boolean; path: string; appliedKeys: string[] } {
  if (!fs.existsSync(STACK_ENV_PATH)) {
    return { loaded: false, path: STACK_ENV_PATH, appliedKeys: [] }
  }

  const appliedKeys: string[] = []
  try {
    const raw = fs.readFileSync(STACK_ENV_PATH, 'utf-8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex <= 0) continue
      const key = trimmed.slice(0, separatorIndex).trim()
      const value = stripShellQuotes(trimmed.slice(separatorIndex + 1))
      if (!key || process.env[key]) continue
      process.env[key] = value
      appliedKeys.push(key)
    }
  } catch (error) {
    log('failed to load stack env', STACK_ENV_PATH, error)
    return { loaded: false, path: STACK_ENV_PATH, appliedKeys: [] }
  }

  if (!process.env.LONGCLAW_AGENT_OS_BASE_URL && process.env.LONGCLAW_HERMES_AGENT_OS_BASE_URL) {
    process.env.LONGCLAW_AGENT_OS_BASE_URL = process.env.LONGCLAW_HERMES_AGENT_OS_BASE_URL
  }
  if (!process.env.LONGCLAW_AGENT_OS_API_KEY && process.env.LONGCLAW_HERMES_API_KEY) {
    process.env.LONGCLAW_AGENT_OS_API_KEY = process.env.LONGCLAW_HERMES_API_KEY
  }

  return { loaded: true, path: STACK_ENV_PATH, appliedKeys }
}

const runtimeStackEnv = loadRuntimeStackEnv()

let mainWindow: BrowserWindow | null = null
let backend: AgentBackend | null = null
let controlPlaneClient = createLongclawControlPlaneClientFromEnv()
let currentCwd = process.env.AGENT_CWD || app.getPath('home')
let localRuntimeSeatPreference: LocalRuntimeSeatPreference =
  normalizeLocalRuntimeSeatPreference(process.env.LONGCLAW_LOCAL_RUNTIME_SEAT_OVERRIDE)
const DEFAULT_LOCALE = 'zh-CN'

function getAgentMode(): AgentMode {
  return (process.env.AGENT_MODE as AgentMode) || 'acp'
}

function windowTitleForLocale(locale: string): string {
  return locale === 'en-US' ? 'Longclaw Agent OS' : '隆小侠 Agent OS'
}

function applyWindowLocale(locale: string) {
  if (!mainWindow) return
  mainWindow.setTitle(windowTitleForLocale(locale))
}

function createWindow() {
  log('creating electron window', {
    run_id: observationState.run_id,
    observation_dir: observationState.observation_dir,
  })
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    y: 30,
    title: windowTitleForLocale(DEFAULT_LOCALE),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_DEV) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  }

  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    log('renderer did-fail-load', { code, description, validatedURL })
    appendObservationJsonl(observationEventsPath, 'events', {
      source: 'electron-main',
      name: 'renderer.did-fail-load',
      level: 'error',
      code,
      description,
      validatedURL,
    })
  })

  mainWindow.webContents.on(
    'console-message',
    (_event, level, message, line, sourceId) => {
      const classification = classifyRendererConsoleMessage(level, message)
      log('renderer console', { level, message, line, sourceId, classification })
      appendObservationJsonl(observationEventsPath, 'events', {
        source: 'renderer-console',
        name: 'console-message',
        ...classification,
        console_level: level,
        message,
        line,
        sourceId,
      })
    },
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log('renderer process gone', details)
    appendObservationJsonl(observationEventsPath, 'events', {
      source: 'electron-main',
      name: 'renderer.render-process-gone',
      level: 'error',
      details,
    })
  })

  mainWindow.webContents.on('unresponsive', () => {
    log('renderer unresponsive')
    appendObservationJsonl(observationEventsPath, 'events', {
      source: 'electron-main',
      name: 'renderer.unresponsive',
      level: 'error',
    })
  })

  mainWindow.webContents.on('responsive', () => {
    log('renderer responsive')
    appendObservationJsonl(observationEventsPath, 'events', {
      source: 'electron-main',
      name: 'renderer.responsive',
      level: 'info',
    })
  })

  mainWindow.webContents.on('did-finish-load', () => {
    log('renderer did-finish-load')
    appendObservationJsonl(observationEventsPath, 'events', {
      source: 'electron-main',
      name: 'renderer.did-finish-load',
      level: 'info',
    })
  })
}

async function ensureBackend(): Promise<AgentBackend> {
  if (backend && backend.alive()) return backend

  const mode = getAgentMode()
  log(`initializing backend: mode=${mode} cwd=${currentCwd}`)

  if (mode === 'acp') {
    backend = createBackend('acp', { cwd: currentCwd })
  } else {
    backend = createBackend('sdk', {
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      cwd: currentCwd,
      systemPrompt: '你是隆小虾，一个金融业务 AI 助手。你可以读写文件、执行命令、搜索代码。回复使用中文。',
    })
  }

  await backend.connect()
  return backend
}

function getControlPlaneClient() {
  return controlPlaneClient
}

function currentRuntimeProfile(
  workMode: LongclawLaunchIntent['work_mode'],
  seatResolution?: LocalRuntimeSeatResolution,
): string {
  if (workMode === 'cloud_sandbox') {
    return 'cloud_managed_runtime'
  }
  if (process.env.LONGCLAW_RUNTIME_PROFILE?.trim()) {
    return process.env.LONGCLAW_RUNTIME_PROFILE.trim()
  }
  return seatResolution?.runtimeProfile ?? 'dev_local_acp_bridge'
}

function getLocalRuntimeSeatPreference(): LocalRuntimeSeatPreference {
  return localRuntimeSeatPreference
}

function setLocalRuntimeSeatPreference(value: unknown): LocalRuntimeSeatPreference {
  localRuntimeSeatPreference = normalizeLocalRuntimeSeatPreference(value)
  return localRuntimeSeatPreference
}

function resolveLaunchSeat(
  workMode: LongclawLaunchIntent['work_mode'],
  preference: LocalRuntimeSeatPreference = getLocalRuntimeSeatPreference(),
): LocalRuntimeSeatResolution {
  if (workMode === 'cloud_sandbox') {
    return {
      preference,
      seat: 'unavailable',
      available: false,
      runtimeProfile: 'cloud_managed_runtime',
      runtimeTarget: 'cloud_runtime',
      modelPlane: 'cloud_provider',
      localRuntimeApiKeyConfigured: Boolean(process.env.LONGCLAW_LOCAL_RUNTIME_API_KEY?.trim()),
      localRuntimeApiUrl: process.env.LONGCLAW_LOCAL_RUNTIME_API_URL?.trim(),
    }
  }
  return resolveLocalRuntimeSeat(preference)
}

function withLaunchSeatMetadata(
  intent: LongclawLaunchIntent,
  seatResolution: LocalRuntimeSeatResolution,
): LongclawLaunchIntent {
  const runtimeProfile = currentRuntimeProfile(intent.work_mode, seatResolution)
  const runtimeTarget = intent.work_mode === 'cloud_sandbox' ? 'cloud_runtime' : 'local_runtime'
  const interactionSurface = intent.work_mode === 'weclaw_dispatch' ? 'weclaw' : 'electron_home'
  const executionPlane = runtimeTarget === 'cloud_runtime' ? 'cloud_executor' : 'local_executor'

  return LongclawLaunchIntentSchema.parse({
    ...intent,
    interaction_surface: interactionSurface,
    runtime_profile: runtimeProfile,
    runtime_target: runtimeTarget,
    model_plane: 'cloud_provider',
    metadata: {
      ...(intent.metadata ?? {}),
      work_mode: intent.work_mode,
      launch_surface: intent.launch_surface ?? interactionSurface,
      origin_surface: intent.launch_surface ?? interactionSurface,
      interaction_surface: interactionSurface,
      runtime_profile: runtimeProfile,
      runtime_target: runtimeTarget,
      model_plane: 'cloud_provider',
      execution_plane: executionPlane,
      local_runtime_seat: seatResolution.seat,
      local_runtime_seat_preference: seatResolution.preference,
      dev_machine_acp_takeover:
        seatResolution.preference === 'auto' && seatResolution.seat === 'acp_bridge',
      local_runtime_api_url: seatResolution.localRuntimeApiUrl,
      local_acp_script: seatResolution.acpScript,
    },
  })
}

type WeclawWorkspaceResolution = {
  workspaceRoot: string | null
  source: 'config' | 'env' | 'default' | 'unresolved'
}

type WeclawSessionSourceStatus = {
  workspaceRoot: string | null
  workspaceSource: WeclawWorkspaceResolution['source']
  sessionsDir: string | null
  sessionsDirExists: boolean
  sessionCount: number
}

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

type WeclawSessionDetail = {
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
  canonicalMetadata: Record<string, unknown>
  messages: WeclawSessionMessage[]
  media: WeclawSessionAttachment[]
}

type WeclawSessionSummary = Pick<
  WeclawSessionDetail,
  | 'sessionId'
  | 'canonicalSessionId'
  | 'duplicateSessionIds'
  | 'hidden'
  | 'archived'
  | 'filePath'
  | 'userId'
  | 'updatedAt'
  | 'title'
  | 'preview'
  | 'messageCount'
  | 'agentReplyCount'
  | 'mediaCount'
> & {
  sourceLabel: string
  canonicalMetadata: Record<string, unknown>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function normalizeWeclawAttachmentPath(filePath: string, candidate: unknown): string | undefined {
  const rawValue = readString(candidate)
  if (!rawValue) return undefined
  if (/^https?:\/\//i.test(rawValue)) return rawValue
  if (rawValue.startsWith('file://')) {
    try {
      return fileURLToPath(rawValue)
    } catch {
      return rawValue
    }
  }
  if (path.isAbsolute(rawValue)) return rawValue
  return path.resolve(path.dirname(filePath), rawValue)
}

function collectAttachmentRecords(value: unknown): Array<Record<string, unknown> | string> {
  if (Array.isArray(value)) {
    return value.flatMap(item => collectAttachmentRecords(item))
  }
  if (typeof value === 'string' || isPlainRecord(value)) return [value]
  return []
}

function parseWeclawAttachment(
  filePath: string,
  source: unknown,
  origin: WeclawSessionAttachment['origin'],
  messageId?: string,
): WeclawSessionAttachment | null {
  if (typeof source === 'string') {
    const resolvedPath = normalizeWeclawAttachmentPath(filePath, source)
    const title = resolvedPath ? path.basename(resolvedPath) : source
    return {
      attachmentId: `${origin}:${messageId ?? 'session'}:${title}`,
      title,
      kind: path.extname(title).slice(1) || 'attachment',
      path: resolvedPath && path.isAbsolute(resolvedPath) ? resolvedPath : undefined,
      url: /^https?:\/\//i.test(source) ? source : undefined,
      origin,
      messageId,
      metadata: {},
    }
  }
  if (!isPlainRecord(source)) return null

  const pathValue =
    normalizeWeclawAttachmentPath(
      filePath,
      source.path ?? source.file_path ?? source.filePath ?? source.uri ?? source.url,
    )
  const title =
    readString(source.title) ??
    readString(source.name) ??
    readString(source.label) ??
    readString(source.filename) ??
    (pathValue ? path.basename(pathValue) : undefined) ??
    '附件'
  const kind =
    readString(source.kind) ??
    readString(source.type) ??
    (pathValue ? path.extname(pathValue).slice(1) || 'attachment' : 'attachment')
  const url = readString(source.url)

  return {
    attachmentId:
      readString(source.id) ??
      readString(source.attachment_id) ??
      `${origin}:${messageId ?? 'session'}:${title}`,
    title,
    kind,
    path: pathValue && path.isAbsolute(pathValue) ? pathValue : undefined,
    url: url && /^https?:\/\//i.test(url) ? url : undefined,
    mimeType: readString(source.mime_type) ?? readString(source.mimeType),
    size: readNumber(source.size) ?? readNumber(source.bytes),
    text: readString(source.text) ?? readString(source.caption) ?? readString(source.description),
    origin,
    messageId,
    metadata: Object.fromEntries(
      Object.entries(source).filter(
        ([key]) =>
          ![
            'id',
            'attachment_id',
            'title',
            'name',
            'label',
            'filename',
            'kind',
            'type',
            'path',
            'file_path',
            'filePath',
            'uri',
            'url',
            'mime_type',
            'mimeType',
            'size',
            'bytes',
            'text',
            'caption',
            'description',
          ].includes(key),
      ),
    ),
  }
}

function parseWeclawMessage(filePath: string, source: unknown): WeclawSessionMessage | null {
  if (!isPlainRecord(source)) return null
  const messageId =
    readString(source.message_id) ??
    readString(source.id) ??
    readString(source.uuid) ??
    `${readString(source.created_at) ?? readString(source.createdAt) ?? 'message'}:${readString(source.role) ?? 'unknown'}`
  const attachments = collectAttachmentRecords(
    source.attachments ?? source.attachment ?? source.media ?? source.files,
  )
    .map(item => parseWeclawAttachment(filePath, item, 'message', messageId))
    .filter((item): item is WeclawSessionAttachment => Boolean(item))
  const metadata = Object.fromEntries(
    Object.entries(source).filter(
      ([key]) =>
        ![
          'message_id',
          'id',
          'uuid',
          'role',
          'kind',
          'text',
          'content',
          'message',
          'agent_name',
          'agentName',
          'created_at',
          'createdAt',
          'attachments',
          'attachment',
          'media',
          'files',
        ].includes(key),
    ),
  )
  const text =
    readString(source.text) ??
    readString(source.content) ??
    readString(source.message) ??
    readString(source.summary)

  return {
    messageId,
    role: readString(source.role) ?? 'unknown',
    kind: readString(source.kind),
    text,
    agentName: readString(source.agent_name) ?? readString(source.agentName),
    createdAt: readString(source.created_at) ?? readString(source.createdAt),
    attachments,
    metadata,
  }
}

function summarizeWeclawSession(filePath: string, raw: Record<string, unknown>): WeclawSessionDetail {
  const messages = collectAttachmentRecords(raw.messages ?? raw.conversation ?? raw.turns ?? [])
  const parsedMessages = messages
    .map(message => parseWeclawMessage(filePath, message))
    .filter((message): message is WeclawSessionMessage => Boolean(message))
  const topLevelMedia = collectAttachmentRecords(raw.media ?? raw.attachments ?? raw.files ?? [])
    .map(item => parseWeclawAttachment(filePath, item, 'session'))
    .filter((item): item is WeclawSessionAttachment => Boolean(item))
  const canonicalMetadata = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !['messages', 'media'].includes(key)),
  )
  const sessionId = path.basename(filePath, path.extname(filePath))
  const userId = readString(raw.user_id) ?? readString(raw.userId)
  const updatedAt = readString(raw.updated_at) ?? readString(raw.updatedAt)
  const preview =
    [...parsedMessages]
      .reverse()
      .map(message => message.text?.trim())
      .find(Boolean) ??
    readString(raw.preview) ??
    readString(raw.title)
  const title =
    readString(raw.title) ??
    readString(raw.session_title) ??
    readString(raw.subject) ??
    preview?.split(/\r?\n/).find(Boolean)?.slice(0, 96) ??
    userId ??
    sessionId
  const agentReplyCount = parsedMessages.filter(message =>
    ['agent', 'assistant'].includes(message.role) ||
    ['reply', 'response'].includes(String(message.kind ?? '').toLowerCase()),
  ).length
  const nestedMediaCount = parsedMessages.reduce(
    (count, message) => count + message.attachments.length,
    0,
  )
  const canonicalSessionId = canonicalWeclawSessionId({
    sessionId,
    userId,
    title,
    canonicalMetadata,
  })

  return {
    sessionId,
    canonicalSessionId,
    duplicateSessionIds: [],
    hidden: false,
    archived: false,
    filePath,
    userId,
    updatedAt,
    title,
    preview,
    messageCount: parsedMessages.length,
    agentReplyCount,
    mediaCount: topLevelMedia.length + nestedMediaCount,
    canonicalMetadata,
    messages: parsedMessages,
    media: topLevelMedia,
  }
}

function readWeclawConfigSaveDir(): string | undefined {
  if (!fs.existsSync(WECLAW_CONFIG_PATH)) return undefined
  try {
    const raw = JSON.parse(fs.readFileSync(WECLAW_CONFIG_PATH, 'utf-8')) as Record<string, unknown>
    return readString(raw.save_dir)
  } catch {
    return undefined
  }
}

function resolveWeclawWorkspaceResolution(): WeclawWorkspaceResolution {
  const candidates = [
    { value: readWeclawConfigSaveDir(), source: 'config' as const },
    { value: readString(process.env.WECLAW_SAVE_DIR), source: 'env' as const },
    { value: DEFAULT_WECLAW_WORKSPACE, source: 'default' as const },
  ].filter((candidate): candidate is { value: string; source: 'config' | 'env' | 'default' } =>
    Boolean(candidate.value),
  )

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.value) && fs.statSync(candidate.value).isDirectory()) {
      return { workspaceRoot: candidate.value, source: candidate.source }
    }
  }

  if (candidates[0]) {
    return { workspaceRoot: candidates[0].value, source: candidates[0].source }
  }

  return { workspaceRoot: null, source: 'unresolved' }
}

function resolveWeclawWorkspaceRoot(): string | null {
  return resolveWeclawWorkspaceResolution().workspaceRoot
}

function resolveWeclawSessionsDir(): string | null {
  const workspaceRoot = resolveWeclawWorkspaceRoot()
  if (!workspaceRoot) return null
  return path.join(workspaceRoot, '.obsidian', 'sessions')
}

function getWeclawSessionSourceStatus(): WeclawSessionSourceStatus {
  const resolution = resolveWeclawWorkspaceResolution()
  const sessionsDir = resolution.workspaceRoot
    ? path.join(resolution.workspaceRoot, '.obsidian', 'sessions')
    : null
  const sessionsDirExists = Boolean(
    sessionsDir && fs.existsSync(sessionsDir) && fs.statSync(sessionsDir).isDirectory(),
  )
  const sessionCount = sessionsDirExists
    ? fs.readdirSync(sessionsDir!, { withFileTypes: true }).filter(
        entry => entry.isFile() && entry.name.endsWith('.json'),
      ).length
    : 0

  return {
    workspaceRoot: resolution.workspaceRoot,
    workspaceSource: resolution.source,
    sessionsDir,
    sessionsDirExists,
    sessionCount,
  }
}

function loadWeclawSessionFiles(): Array<{ sessionId: string; filePath: string; mtimeMs: number }> {
  const sessionsDir = resolveWeclawSessionsDir()
  if (!sessionsDir || !fs.existsSync(sessionsDir)) return []
  return fs
    .readdirSync(sessionsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => path.join(sessionsDir, entry.name))
    .map(filePath => {
      const stat = fs.statSync(filePath)
      return {
        sessionId: path.basename(filePath, path.extname(filePath)),
        filePath,
        mtimeMs: stat.mtimeMs,
      }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
}

function readWeclawSessionDetailByFile(filePath: string): WeclawSessionDetail | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown
    if (!isPlainRecord(raw)) return null
    return summarizeWeclawSession(filePath, raw)
  } catch (error) {
    log('failed to read weclaw session', { filePath, error })
    return null
  }
}

function listWeclawSessions(): WeclawSessionSummary[] {
  const deduped = new Map<string, WeclawSessionDetail>()
  for (const session of loadWeclawSessionFiles()
    .map(({ filePath }) => readWeclawSessionDetailByFile(filePath))
    .filter((session): session is WeclawSessionDetail => Boolean(session))
  ) {
    const existing = deduped.get(session.canonicalSessionId)
    if (!existing) {
      deduped.set(session.canonicalSessionId, session)
      continue
    }
    const existingTs = Date.parse(existing.updatedAt ?? '') || 0
    const currentTs = Date.parse(session.updatedAt ?? '') || 0
    const primary = currentTs >= existingTs ? session : existing
    const secondary = currentTs >= existingTs ? existing : session
    primary.duplicateSessionIds = [...new Set([
      ...primary.duplicateSessionIds,
      secondary.sessionId,
      ...secondary.duplicateSessionIds,
    ])]
    deduped.set(session.canonicalSessionId, primary)
  }
  return [...deduped.values()].map(session => {
    const uiFlags =
      getWeclawSessionUiState()[session.canonicalSessionId] ?? {
        hidden: false,
        archived: false,
      }
    return {
      sessionId: session.sessionId,
      canonicalSessionId: session.canonicalSessionId,
      duplicateSessionIds: session.duplicateSessionIds,
      hidden: uiFlags.hidden,
      archived: uiFlags.archived,
      filePath: session.filePath,
      userId: session.userId,
      updatedAt: session.updatedAt,
      title: session.title,
      preview: session.preview,
      messageCount: session.messageCount,
      agentReplyCount: session.agentReplyCount,
      mediaCount: session.mediaCount,
      sourceLabel: session.userId ? 'WeChat 会话' : 'WeClaw 会话',
      canonicalMetadata: session.canonicalMetadata,
    }
  })
}

function getWeclawSession(sessionId: string): WeclawSessionDetail | null {
  const target = readString(sessionId)
  if (!target) return null
  for (const entry of loadWeclawSessionFiles()) {
    if (entry.sessionId === target) {
      const session = readWeclawSessionDetailByFile(entry.filePath)
      if (!session) return null
      const uiFlags =
        getWeclawSessionUiState()[session.canonicalSessionId] ?? {
          hidden: false,
          archived: false,
        }
      return {
        ...session,
        hidden: uiFlags.hidden,
        archived: uiFlags.archived,
        duplicateSessionIds: listWeclawSessions()
          .find(item => item.sessionId === session.sessionId)
          ?.duplicateSessionIds ?? [],
      }
    }
  }
  return null
}

async function probeHttpOk(url: string | undefined): Promise<boolean> {
  if (!url) return false
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}

async function collectRuntimeStatus(
  packs: LongclawDomainPackDescriptor[],
  overviewReady: boolean,
): Promise<Record<string, unknown>> {
  const coreBaseUrl =
    process.env.LONGCLAW_AGENT_OS_BASE_URL ?? process.env.LONGCLAW_HERMES_AGENT_OS_BASE_URL
  const dueDiligenceBaseUrl = process.env.LONGCLAW_DUE_DILIGENCE_BASE_URL
  const signalsStateRoot = process.env.LONGCLAW_SIGNALS_STATE_ROOT
  const signalsWebBaseUrl = process.env.LONGCLAW_SIGNALS_WEB_BASE_URL
  const signalsWeb2BaseUrl = process.env.LONGCLAW_SIGNALS_WEB2_BASE_URL
  const acpBridge = inspectConfiguredAcpBridge()
  const currentSeatPreference = getLocalRuntimeSeatPreference()
  const localRuntimeSeat = await probeLocalRuntimeSeat(currentSeatPreference)
  const localRuntimeApiSeat = await probeLocalRuntimeSeat('force_local_runtime_api')

  const duePackVisible = packs.some(pack => pack.pack_id === 'due_diligence')
  const signalsPackVisible = packs.some(pack => pack.pack_id === 'signals')
  const normalizedCoreBaseUrl = coreBaseUrl?.replace(/\/$/, '')
  const [coreHealthReady, dueHealthReady] = await Promise.all([
    // `getOverview()` can fall back to a synthesized local summary when Hermes is down,
    // so connectivity must come from a direct probe rather than the fulfilled state alone.
    probeHttpOk(
      normalizedCoreBaseUrl
        ? `${normalizedCoreBaseUrl}/agent-os/overview`
        : undefined,
    ),
    probeHttpOk(
      dueDiligenceBaseUrl
        ? `${dueDiligenceBaseUrl.replace(/\/$/, '')}/healthz`
        : undefined,
    ),
  ])

  return {
    stack_env_loaded: runtimeStackEnv.loaded,
    stack_env_path: runtimeStackEnv.path,
    stack_env_applied_keys: runtimeStackEnv.appliedKeys,
    longclaw_core_connected: Boolean(
      normalizedCoreBaseUrl &&
        getControlPlaneClient().isHermesBacked() &&
        overviewReady &&
        coreHealthReady,
    ),
    longclaw_core_base_url: coreBaseUrl ?? '',
    due_diligence_connected: Boolean(duePackVisible || dueHealthReady),
    due_diligence_base_url: dueDiligenceBaseUrl ?? '',
    signals_available: Boolean(
      signalsPackVisible ||
        (signalsStateRoot && fs.existsSync(signalsStateRoot)) ||
        signalsWebBaseUrl ||
        signalsWeb2BaseUrl,
    ),
    signals_state_root: signalsStateRoot ?? '',
    signals_web_base_url: signalsWebBaseUrl ?? '',
    signals_web2_base_url: signalsWeb2BaseUrl ?? '',
    local_acp_available: acpBridge.available,
    local_acp_script: acpBridge.path,
    local_acp_source: acpBridge.source,
    local_runtime_seat: localRuntimeSeat.seat,
    local_runtime_seat_preference: currentSeatPreference,
    local_runtime_seat_override_active: currentSeatPreference !== 'auto',
    local_runtime_available: localRuntimeSeat.available,
    local_runtime_api_url: localRuntimeSeat.localRuntimeApiUrl ?? '',
    local_runtime_api_available: localRuntimeApiSeat.healthOk,
    dev_machine_acp_takeover:
      currentSeatPreference === 'auto' &&
      acpBridge.available &&
      localRuntimeSeat.seat === 'acp_bridge',
    runtime_profile:
      process.env.LONGCLAW_RUNTIME_PROFILE ??
      localRuntimeSeat.runtimeProfile,
  }
}

async function handleLocalAction(_event: Electron.IpcMainInvokeEvent, action: { kind: string; payload?: any }) {
  const payload = action?.payload ?? {}
  switch (action?.kind) {
    case 'open_path':
      return { ok: true, kind: action.kind, result: await shell.openPath(String(payload.path || '')) }
    case 'open_url':
      await shell.openExternal(String(payload.url || ''))
      return { ok: true, kind: action.kind }
    case 'copy_value':
      clipboard.writeText(String(payload.value || ''))
      return { ok: true, kind: action.kind }
    default:
      throw new Error(`Unsupported local action: ${action?.kind}`)
  }
}

async function handleReadArtifactPreview(_event: Electron.IpcMainInvokeEvent, uri: string) {
  if (!uri || !path.isAbsolute(uri) || !fs.existsSync(uri)) {
    return { ok: false, reason: 'missing_file' }
  }

  const stat = fs.statSync(uri)
  if (stat.size > 256 * 1024) {
    return { ok: false, reason: 'too_large', size: stat.size }
  }

  const text = fs.readFileSync(uri, 'utf-8')
  return { ok: true, text, size: stat.size }
}

// --- Skills discovery ---

interface SkillInfo {
  name: string
  path: string
  description: string
  project?: string
  source?: string
  registry_id?: string
  managed?: boolean
  health?: string
}

interface PluginInfo {
  plugin_id: string
  label: string
  path: string
  description: string
  source: string
  project?: string
  registry_id?: string
  managed?: boolean
  health?: string
}

type CapabilityManagerSettings = {
  disabled_capabilities: string[]
  capability_groups: Record<string, string>
  extra_skill_roots: string[]
  extra_plugin_roots: string[]
}

type AgentStreamEvent = {
  type: 'text' | 'tool' | 'result' | 'error'
  text?: string
  toolName?: string
  toolInput?: unknown
  result?: unknown
  error?: string
}

const WORKSPACE_ROOT_CANDIDATES = [
  path.join(os.homedir(), 'github代码仓库'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库'),
]

const KNOWN_SKILL_PROJECTS = [
  'Signals',
  'aippt',
  'aippt/ppt-master',
  'Chanless',
  'gstack',
  'superpowers',
  'compound-engineering-plugin',
]

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean).map(item => path.resolve(item)))]
}

function expandUserPath(input: string): string {
  const trimmed = input.trim()
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2))
  return trimmed
}

function normalizeCapabilityIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => String(item ?? '').trim()).filter(Boolean))].sort()
}

function normalizeCapabilityGroupMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, group]) => [String(key).trim(), String(group ?? '').trim()] as const)
      .filter(([key, group]) => Boolean(key) && Boolean(group))
      .sort(([left], [right]) => left.localeCompare(right)),
  )
}

function normalizeDiscoveryRoots(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return uniquePaths(
    value
      .map(item => String(item ?? '').trim())
      .filter(Boolean)
      .map(expandUserPath),
  )
}

function defaultCapabilityManagerSettings(): CapabilityManagerSettings {
  return {
    disabled_capabilities: [],
    capability_groups: {},
    extra_skill_roots: [],
    extra_plugin_roots: [],
  }
}

function normalizeCapabilityManagerSettings(
  value: unknown,
  base: CapabilityManagerSettings = defaultCapabilityManagerSettings(),
): CapabilityManagerSettings {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  return {
    disabled_capabilities:
      'disabled_capabilities' in record
        ? normalizeCapabilityIdList(record.disabled_capabilities)
        : base.disabled_capabilities,
    capability_groups:
      'capability_groups' in record
        ? normalizeCapabilityGroupMap(record.capability_groups)
        : base.capability_groups,
    extra_skill_roots:
      'extra_skill_roots' in record
        ? normalizeDiscoveryRoots(record.extra_skill_roots)
        : base.extra_skill_roots,
    extra_plugin_roots:
      'extra_plugin_roots' in record
        ? normalizeDiscoveryRoots(record.extra_plugin_roots)
        : base.extra_plugin_roots,
  }
}

function loadCapabilityManagerSettings(): CapabilityManagerSettings {
  if (!fs.existsSync(CAPABILITY_MANAGER_SETTINGS_PATH)) {
    return defaultCapabilityManagerSettings()
  }
  try {
    const raw = JSON.parse(
      fs.readFileSync(CAPABILITY_MANAGER_SETTINGS_PATH, 'utf-8'),
    ) as Record<string, unknown>
    return normalizeCapabilityManagerSettings(raw)
  } catch (error) {
    log('failed to load capability manager settings', CAPABILITY_MANAGER_SETTINGS_PATH, error)
    return defaultCapabilityManagerSettings()
  }
}

function persistCapabilityManagerSettings(settings: CapabilityManagerSettings): CapabilityManagerSettings {
  const normalized = normalizeCapabilityManagerSettings(settings)
  fs.mkdirSync(LONGCLAW_RUNTIME_DIR, { recursive: true })
  fs.writeFileSync(
    CAPABILITY_MANAGER_SETTINGS_PATH,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf-8',
  )
  return normalized
}

let capabilityManagerSettings = loadCapabilityManagerSettings()
let runtimeCapabilityRegistry = readRuntimeCapabilityRegistry(
  CAPABILITY_REGISTRY_PATH,
  LONGCLAW_RUNTIME_DIR,
)

function getRuntimeCapabilityRegistry(): RuntimeCapabilityRegistry {
  runtimeCapabilityRegistry = readRuntimeCapabilityRegistry(
    CAPABILITY_REGISTRY_PATH,
    LONGCLAW_RUNTIME_DIR,
  )
  return runtimeCapabilityRegistry
}

function registerManagedCapability(
  input: { kind: RuntimeCapabilityKind; sourcePath: string; label?: string },
): RuntimeCapabilityRegistry {
  runtimeCapabilityRegistry = registerRuntimeCapability({
    runtimeDir: LONGCLAW_RUNTIME_DIR,
    registryPath: CAPABILITY_REGISTRY_PATH,
    kind: input.kind,
    sourcePath: input.sourcePath,
    label: input.label,
    metadata: {
      current_cwd: currentCwd,
    },
  })
  return runtimeCapabilityRegistry
}

function removeManagedCapability(registryId: string): RuntimeCapabilityRegistry {
  runtimeCapabilityRegistry = removeRuntimeCapability({
    runtimeDir: LONGCLAW_RUNTIME_DIR,
    registryPath: CAPABILITY_REGISTRY_PATH,
    registryId,
  })
  return runtimeCapabilityRegistry
}

function rescanManagedCapabilities(): RuntimeCapabilityRegistry {
  runtimeCapabilityRegistry = rescanRuntimeCapabilityRegistry(
    CAPABILITY_REGISTRY_PATH,
    LONGCLAW_RUNTIME_DIR,
  )
  return runtimeCapabilityRegistry
}

function loadWeclawSessionUiState(): WeclawSessionUiState {
  if (!fs.existsSync(WECLAW_SESSION_UI_STATE_PATH)) return {}
  try {
    return normalizeWeclawSessionUiState(
      JSON.parse(fs.readFileSync(WECLAW_SESSION_UI_STATE_PATH, 'utf-8')),
    )
  } catch (error) {
    log('failed to load weclaw session ui state', WECLAW_SESSION_UI_STATE_PATH, error)
    return {}
  }
}

function persistWeclawSessionUiState(state: WeclawSessionUiState): WeclawSessionUiState {
  const normalized = normalizeWeclawSessionUiState(state)
  fs.mkdirSync(LONGCLAW_RUNTIME_DIR, { recursive: true })
  fs.writeFileSync(
    WECLAW_SESSION_UI_STATE_PATH,
    `${JSON.stringify(normalized, null, 2)}\n`,
    'utf-8',
  )
  return normalized
}

let weclawSessionUiState = loadWeclawSessionUiState()

function getWeclawSessionUiState(): WeclawSessionUiState {
  return weclawSessionUiState
}

function updateWeclawSessionUiState(
  canonicalSessionId: string,
  patch: Partial<{ hidden: boolean; archived: boolean }>,
): WeclawSessionUiState {
  const target = readString(canonicalSessionId)
  if (!target) {
    throw new Error('canonical session id is required')
  }
  weclawSessionUiState = persistWeclawSessionUiState(
    mergeWeclawSessionUiFlags(weclawSessionUiState, target, patch),
  )
  return weclawSessionUiState
}

function getCapabilityManagerSettings(): CapabilityManagerSettings {
  return capabilityManagerSettings
}

function updateCapabilityManagerSettings(
  patch: unknown,
): CapabilityManagerSettings {
  capabilityManagerSettings = persistCapabilityManagerSettings(
    normalizeCapabilityManagerSettings(patch, capabilityManagerSettings),
  )
  return capabilityManagerSettings
}

function workspaceRoots(): string[] {
  return uniquePaths(
    WORKSPACE_ROOT_CANDIDATES.filter(candidate => fs.existsSync(candidate)),
  )
}

function runtimeRegistryEntryByManagedPath(): Map<string, RuntimeCapabilityRegistry['entries'][number]> {
  return new Map(
    getRuntimeCapabilityRegistry().entries.map(entry => [path.resolve(entry.managed_path), entry] as const),
  )
}

function configuredSkillScanDirs(
  settings: CapabilityManagerSettings = getCapabilityManagerSettings(),
): string[] {
  const runtimeRoots = runtimeDiscoveryRoots(LONGCLAW_RUNTIME_DIR)
  return uniquePaths([
    ...workspaceRoots().flatMap(root =>
      KNOWN_SKILL_PROJECTS.map(project => path.join(root, project)),
    ),
    ...runtimeRoots.skills,
    ...settings.extra_skill_roots,
  ])
}

function scanDirForSkills(dir: string, projectName: string): SkillInfo[] {
  const skills: SkillInfo[] = []
  if (!fs.existsSync(dir)) return skills
  const registryEntry = runtimeRegistryEntryByManagedPath().get(path.resolve(dir))

  // CLAUDE.md
  const claudeMd = path.join(dir, 'CLAUDE.md')
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, 'utf-8')
    const title = content.split('\n').find(l => l.startsWith('# '))?.replace('# ', '') || projectName
    skills.push({
      name: `${projectName}/CLAUDE.md`,
      path: claudeMd,
      description: title.slice(0, 80),
      project: projectName,
      source: registryEntry?.source ?? 'filesystem',
      registry_id: registryEntry?.registry_id,
      managed: Boolean(registryEntry),
      health: registryEntry?.health,
    })
  }

  // Direct SKILL.md capability roots, used by runtime-managed overlays.
  const directSkillMd = path.join(dir, 'SKILL.md')
  if (fs.existsSync(directSkillMd)) {
    const content = fs.readFileSync(directSkillMd, 'utf-8')
    const description =
      content
        .split('\n')
        .find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'))
        ?.trim()
        .slice(0, 80) || projectName
    skills.push({
      name: registryEntry?.label ?? projectName,
      path: directSkillMd,
      description,
      project: projectName,
      source: registryEntry?.source ?? 'filesystem',
      registry_id: registryEntry?.registry_id,
      managed: Boolean(registryEntry),
      health: registryEntry?.health,
    })
  }

  // .claude/skills/
  const skillsDir = path.join(dir, '.claude', 'skills')
  if (fs.existsSync(skillsDir)) {
    try {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const skillMd = path.join(skillsDir, entry.name, 'SKILL.md')
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8')
          const desc = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---')) || ''
          skills.push({
            name: entry.name,
            path: skillMd,
            description: desc.trim().slice(0, 80),
            project: projectName,
            source: registryEntry?.source ?? 'filesystem',
            registry_id: registryEntry?.registry_id,
            managed: Boolean(registryEntry),
            health: registryEntry?.health,
          })
        }
      }
    } catch {}
  }

  return skills
}

function discoverAllSkills(
  settings: CapabilityManagerSettings = getCapabilityManagerSettings(),
): SkillInfo[] {
  const all: SkillInfo[] = []
  const scanDirs = configuredSkillScanDirs(settings)
  for (const dir of scanDirs) {
    const projectName = path.basename(dir)
    all.push(...scanDirForSkills(dir, projectName))
  }
  if (!scanDirs.includes(currentCwd)) {
    all.push(...scanDirForSkills(currentCwd, path.basename(currentCwd)))
  }
  const unique = new Map<string, SkillInfo>()
  for (const skill of all) {
    unique.set(skill.path, skill)
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function discoverSkills(cwd: string): SkillInfo[] {
  const skills = [...discoverAllSkills(), ...scanDirForSkills(cwd, path.basename(cwd))]
  const unique = new Map<string, SkillInfo>()
  for (const skill of skills) {
    unique.set(skill.path, skill)
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name))
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

function pluginInfoForDir(dir: string): PluginInfo | null {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null

  const baseName = path.basename(dir)
  const registryEntry = runtimeRegistryEntryByManagedPath().get(path.resolve(dir))
  const codexPluginPath = path.join(dir, '.codex-plugin', 'plugin.json')
  const packageJsonPath = path.join(dir, 'package.json')
  const isPluginLike =
    baseName.toLowerCase().includes('plugin') ||
    fs.existsSync(codexPluginPath) ||
    fs.existsSync(path.join(dir, 'plugins')) ||
    fs.existsSync(path.join(dir, 'cowork_plugins'))

  if (!isPluginLike) return null

  const pluginManifest = readJsonFile(codexPluginPath)
  const packageManifest = readJsonFile(packageJsonPath)
  const pluginId =
    String(pluginManifest?.id ?? packageManifest?.name ?? baseName).trim() || baseName
  const label =
    String(pluginManifest?.name ?? packageManifest?.name ?? baseName).trim() || baseName
  const description =
    String(pluginManifest?.description ?? packageManifest?.description ?? '')
      .trim()
      .slice(0, 160) || `${baseName} plugin bundle`

  return {
    plugin_id: pluginId,
    label,
    path: dir,
    description,
    source: registryEntry?.source ?? (fs.existsSync(codexPluginPath) ? 'codex_plugin' : 'workspace_package'),
    project: baseName,
    registry_id: registryEntry?.registry_id,
    managed: Boolean(registryEntry),
    health: registryEntry?.health,
  }
}

function discoverCapabilityPlugins(
  settings: CapabilityManagerSettings = getCapabilityManagerSettings(),
): PluginInfo[] {
  const runtimeRoots = runtimeDiscoveryRoots(LONGCLAW_RUNTIME_DIR)
  const roots = uniquePaths([
    ...workspaceRoots(),
    currentCwd,
    ...runtimeRoots.plugins,
    ...settings.extra_plugin_roots,
  ])
  const discovered = new Map<string, PluginInfo>()

  for (const root of roots) {
    const direct = pluginInfoForDir(root)
    if (direct) discovered.set(direct.path, direct)

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const info = pluginInfoForDir(path.join(root, entry.name))
      if (info) discovered.set(info.path, info)
    }
  }

  return [...discovered.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function forwardAgentEvent(sender: Electron.WebContents, event: AgentStreamEvent) {
  log(`event: type=${event.type} text="${(event.text || '').slice(0, 30)}"`)
  switch (event.type) {
    case 'text':
      sender.send('agent:text', event.text)
      break
    case 'tool':
      sender.send('agent:tool', { name: event.toolName, input: event.toolInput })
      break
    case 'result':
      sender.send('agent:result', event.result)
      break
    case 'error':
      sender.send('agent:error', event.error)
      break
  }
}

function launchPackMention(intent: LongclawLaunchIntent): LongclawLaunchMention | undefined {
  return intent.mentions.find(mention => mention.kind === 'pack')
}

function launchPackId(intent: LongclawLaunchIntent): string {
  const metadataPack = intent.metadata.pack_id
  const hintedValue =
    launchPackMention(intent)?.value ??
    (typeof metadataPack === 'string' ? metadataPack : '')
  if (!hintedValue) return 'local_agent'
  return hintedValue.includes('.') ? hintedValue.split('.')[0] : hintedValue
}

function launchTaskCapability(intent: LongclawLaunchIntent, packId: string): string {
  const metadataCapability = intent.metadata.capability
  const hintedValue =
    launchPackMention(intent)?.value ??
    (typeof metadataCapability === 'string' ? metadataCapability : '')
  if (hintedValue.includes('.')) return hintedValue
  if (hintedValue) return `${packId}.${hintedValue}`
  return `${packId}.cowork_launch`
}

function launchRunCapability(taskCapability: string): string {
  return taskCapability.includes('.') ? taskCapability.split('.').slice(1).join('.') : taskCapability
}

function launchDomain(packId: string): string {
  if (packId === 'signals') return 'financial_analysis'
  if (packId === 'due_diligence') return 'due_diligence'
  return packId || 'local_agent'
}

function capabilityEntryFromPack(pack: LongclawDomainPackDescriptor): LongclawCapabilityEntry {
  return {
    capability_id: `pack:${pack.pack_id}`,
    kind: 'pack',
    label: pack.pack_id,
    mention: `@pack ${pack.pack_id}`,
    source: pack.runtime,
    description: pack.description,
    summary: `${pack.runtime} runtime`,
    owner: pack.owner_repo,
    curated: ['signals', 'due_diligence'].includes(pack.pack_id),
    provisional: false,
    metadata: pack.metadata ?? {},
  }
}

function capabilityEntryFromSkill(skill: SkillInfo): LongclawCapabilityEntry {
  const configPath = fs.existsSync(skill.path) ? skill.path : null
  return {
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
      config_path: configPath,
      managed: skill.managed ?? false,
      registry_id: skill.registry_id ?? null,
      health: skill.health ?? null,
      source: skill.source ?? 'filesystem',
    },
  }
}

function capabilityEntryFromPlugin(plugin: PluginInfo): LongclawCapabilityEntry {
  const configPath = path.join(plugin.path, '.codex-plugin', 'plugin.json')
  return {
    capability_id: `plugin:${plugin.plugin_id}`,
    kind: 'plugin',
    label: plugin.label,
    mention: `@plugin ${plugin.plugin_id}`,
    source: plugin.source,
    description: plugin.description,
    summary: plugin.project ?? 'workspace plugin',
    owner: plugin.project ?? null,
    curated: false,
    provisional: true,
    metadata: {
      path: plugin.path,
      config_path: fs.existsSync(configPath) ? configPath : null,
      managed: plugin.managed ?? false,
      registry_id: plugin.registry_id ?? null,
      health: plugin.health ?? null,
    },
  }
}

function applyCapabilityManagerOverlay(
  capability: LongclawCapabilityEntry,
  settings: CapabilityManagerSettings,
): LongclawCapabilityEntry {
  const disabled = settings.disabled_capabilities.includes(capability.capability_id)
  const group = settings.capability_groups[capability.capability_id]
  return {
    ...capability,
    metadata: {
      ...capability.metadata,
      disabled,
      group: group ?? null,
    },
  }
}

function recentCapabilityEntry(task: LongclawTask): LongclawCapabilityEntry {
  const metadata = task.metadata as Record<string, unknown>
  const packId =
    typeof metadata.pack_id === 'string' && metadata.pack_id
      ? metadata.pack_id
      : task.capability.includes('.')
        ? task.capability.split('.')[0]
        : ''
  const skillMention = Array.isArray(metadata.skill_mentions) ? metadata.skill_mentions[0] : null
  const pluginMention = Array.isArray(metadata.plugin_mentions) ? metadata.plugin_mentions[0] : null

  if (typeof skillMention === 'string' && skillMention) {
    return {
      capability_id: `recent:skill:${skillMention}`,
      kind: 'skill',
      label: skillMention,
      mention: `@skill ${skillMention}`,
      source: String(metadata.launch_source ?? 'launch_history'),
      description: 'Recently launched skill mention',
      summary: task.status,
      owner: null,
      curated: false,
      provisional: false,
      metadata: { task_id: task.task_id, run_ids: task.run_ids },
    }
  }

  if (typeof pluginMention === 'string' && pluginMention) {
    return {
      capability_id: `recent:plugin:${pluginMention}`,
      kind: 'plugin',
      label: pluginMention,
      mention: `@plugin ${pluginMention}`,
      source: String(metadata.launch_source ?? 'launch_history'),
      description: 'Recently launched plugin bundle',
      summary: task.status,
      owner: null,
      curated: false,
      provisional: false,
      metadata: { task_id: task.task_id, run_ids: task.run_ids },
    }
  }

  return {
    capability_id: `recent:pack:${task.capability}`,
    kind: 'pack',
    label: task.capability,
    mention: packId ? `@pack ${task.capability}` : `@pack ${task.capability}`,
    source: String(metadata.launch_source ?? 'launch_history'),
    description: 'Recently launched pack capability',
    summary: task.status,
    owner: packId || null,
    curated: ['signals', 'due_diligence'].includes(packId),
    provisional: false,
    metadata: { task_id: task.task_id, run_ids: task.run_ids },
  }
}

async function buildCapabilitySubstrateSummary(): Promise<LongclawCapabilitySubstrateSummary> {
  const settings = getCapabilityManagerSettings()
  const [overviewResult, packsResult, tasksResult] = await Promise.allSettled([
    getControlPlaneClient().getOverview(),
    getControlPlaneClient().listPacks(),
    getControlPlaneClient().listTasks(8),
  ])
  const skills = discoverAllSkills(settings)
  const plugins = discoverCapabilityPlugins(settings)
  const capabilityRegistry = getRuntimeCapabilityRegistry()
  const packs =
    packsResult.status === 'fulfilled'
      ? packsResult.value
      : overviewResult.status === 'fulfilled'
        ? overviewResult.value.packs
        : []
  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : []
  const source = getControlPlaneClient().isHermesBacked() ? 'hybrid' : 'local_fallback'
  const runtimeStatus = await collectRuntimeStatus(
    packs,
    overviewResult.status === 'fulfilled' && getControlPlaneClient().isHermesBacked(),
  )
  const seatResolution = resolveLocalRuntimeSeat(getLocalRuntimeSeatPreference())

  return LongclawCapabilitySubstrateSummarySchema.parse({
    generated_at: new Date().toISOString(),
    source,
    provisional: true,
    flagship_packs: packs.filter(pack => ['signals', 'due_diligence'].includes(pack.pack_id)),
    skills: skills.map(capabilityEntryFromSkill).map(entry => applyCapabilityManagerOverlay(entry, settings)),
    plugins: plugins
      .map(capabilityEntryFromPlugin)
      .map(entry => applyCapabilityManagerOverlay(entry, settings)),
    packs: packs.map(capabilityEntryFromPack),
    aliases: [],
    presets: [
      packs.some(pack => pack.pack_id === 'signals')
        ? {
            preset_id: 'signals-review',
            label: 'Signals Review',
            description: 'Launch the flagship review flow in Signals.',
            mentions: [{ kind: 'pack', value: 'signals.review', metadata: {} }],
            default_pack_id: 'signals',
            curated: true,
            metadata: {},
          }
        : null,
      packs.some(pack => pack.pack_id === 'signals')
        ? {
            preset_id: 'signals-backtest',
            label: 'Signals Backtest',
            description: 'Run backlog evaluation and backtest in the Signals pack.',
            mentions: [{ kind: 'pack', value: 'signals.backtest', metadata: {} }],
            default_pack_id: 'signals',
            curated: true,
            metadata: {},
          }
        : null,
      packs.some(pack => pack.pack_id === 'due_diligence')
        ? {
            preset_id: 'due-diligence-company',
            label: 'Company Due Diligence',
            description: 'Launch the due-diligence runtime for a company investigation.',
            mentions: [{ kind: 'pack', value: 'due_diligence.company_due_diligence', metadata: {} }],
            default_pack_id: 'due_diligence',
            curated: true,
            metadata: {},
          }
        : null,
    ].filter(Boolean),
    last_used_capabilities: tasks.map(recentCapabilityEntry),
    visibility: {
      curated: false,
      shows_provisional_inventory: true,
      skills_source: 'filesystem',
      plugins_source: plugins.length > 0 ? 'workspace_scan' : 'local_fallback',
      packs_source: packsResult.status === 'fulfilled' ? 'control_plane' : 'overview',
    },
    metadata: {
      cwd: currentCwd,
      agent_mode: getAgentMode(),
      runtime_profile: currentRuntimeProfile('local', seatResolution),
      model_plane: 'cloud_provider',
      local_runtime_seat: seatResolution.seat,
      local_runtime_seat_preference: seatResolution.preference,
      runtime_status: runtimeStatus,
      packs_count: packs.length,
      skills_count: skills.length,
      plugins_count: plugins.length,
      tasks_count: tasks.length,
      capability_manager: settings,
      capability_manager_settings_path: CAPABILITY_MANAGER_SETTINGS_PATH,
      capability_registry: capabilityRegistry,
      capability_registry_path: CAPABILITY_REGISTRY_PATH,
      runtime_capability_roots: runtimeDiscoveryRoots(LONGCLAW_RUNTIME_DIR),
    },
  })
}

async function handleProvisionalLaunch(
  event: Electron.IpcMainInvokeEvent,
  intent: LongclawLaunchIntent,
) {
  const sender = event.sender
  const startedAt = new Date().toISOString()
  const launchId = intent.launch_id ?? `launch-local-${Date.now()}`
  const packId = launchPackId(intent)
  const taskCapability = launchTaskCapability(intent, packId)
  const taskId = `task-local-${Date.now()}`
  const runId = `run-local-${Date.now()}`
  const prompt = String(intent.requested_outcome ?? intent.raw_text).trim()
  const workMode = intent.work_mode
  const seatPreference = normalizeLocalRuntimeSeatPreference(
    intent.metadata.local_runtime_seat_preference,
  )
  const seatResolution = resolveLaunchSeat(workMode, seatPreference)
  const localRuntimeSeat = String(
    intent.metadata.local_runtime_seat ?? seatResolution.seat,
  ) as LocalRuntimeSeat
  const runtimeProfile = intent.runtime_profile ?? currentRuntimeProfile(workMode, seatResolution)
  const runtimeTarget = workMode === 'cloud_sandbox' ? 'cloud_runtime' : 'local_runtime'
  const interactionSurface =
    workMode === 'weclaw_dispatch' ? 'weclaw' : 'electron_home'
  const modelPlane = intent.model_plane ?? 'cloud_provider'
  const executionPlane = runtimeTarget === 'cloud_runtime' ? 'cloud_executor' : 'local_executor'
  const launchSurface = intent.launch_surface ?? interactionSurface
  const workspaceTarget =
    intent.workspace_target ??
    (workMode === 'local'
      ? currentCwd
      : workMode === 'cloud_sandbox'
        ? 'sandbox://longclaw/default'
        : 'weclaw://active-thread')
  const input = {
    query: prompt,
    raw_text: intent.raw_text,
    requested_outcome: intent.requested_outcome ?? intent.raw_text,
    work_mode: workMode,
    launch_surface: launchSurface,
    interaction_surface: interactionSurface,
    runtime_profile: runtimeProfile,
    runtime_target: runtimeTarget,
    model_plane: modelPlane,
    workspace_target: workspaceTarget,
    local_runtime_seat: localRuntimeSeat,
  }

  let failed = false
  let errorMessage = ''
  let taskStatus = 'succeeded'
  let runStatus = 'succeeded'
  let runtimeSummary = 'Completed via local cowork runtime'
  let seatDispatchResult: Record<string, unknown> | undefined
  try {
    if (workMode === 'cloud_sandbox') {
      failed = true
      errorMessage = 'Cloud Sandbox requires Longclaw Core.'
      taskStatus = 'failed'
      runStatus = 'failed'
      runtimeSummary = errorMessage
    } else if (localRuntimeSeat === 'acp_bridge') {
      const b = await ensureBackend()
      await b.query(prompt, rawEvent => {
        forwardAgentEvent(sender, rawEvent as AgentStreamEvent)
      })
    } else if (localRuntimeSeat === 'local_runtime_api') {
      seatDispatchResult = await dispatchToLocalRuntimeApi({
        launch_id: launchId,
        task_id: taskId,
        work_mode: workMode,
        requested_outcome: String(input.requested_outcome ?? prompt),
        mentions: intent.mentions as Array<Record<string, unknown>>,
        workspace_root: typeof workspaceTarget === 'string' ? workspaceTarget : currentCwd,
        runtime_profile: runtimeProfile as 'dev_local_acp_bridge' | 'packaged_local_runtime' | 'cloud_managed_runtime',
        model_plane: 'cloud_provider',
        raw_text: intent.raw_text,
      }, seatResolution.preference)
      taskStatus = 'running'
      runStatus = 'running'
      runtimeSummary = 'Accepted by local runtime API'
      forwardAgentEvent(sender, {
        type: 'result',
        result: {
          local_runtime_seat: localRuntimeSeat,
          accepted: Boolean(seatDispatchResult.accepted ?? true),
          dispatch: seatDispatchResult,
        },
      })
    } else {
      failed = true
      errorMessage =
        'Local Work and WeClaw Dispatch need either a local ACP bridge or LONGCLAW_LOCAL_RUNTIME_API_URL.'
      taskStatus = 'failed'
      runStatus = 'failed'
      runtimeSummary = errorMessage
    }
  } catch (error) {
    failed = true
    errorMessage = error instanceof Error ? error.message : String(error)
    taskStatus = 'failed'
    runStatus = 'failed'
    runtimeSummary = `Fallback cowork launch failed: ${errorMessage}`
    forwardAgentEvent(sender, { type: 'error', error: errorMessage })
  }

  const finishedAt = new Date().toISOString()
  const task = LongclawTaskSchema.parse({
    task_id: taskId,
    capability: taskCapability,
    session_id:
      typeof intent.session_context.session_id === 'string'
        ? intent.session_context.session_id
        : null,
    channel:
      typeof intent.session_context.channel === 'string'
        ? intent.session_context.channel
        : intent.source,
    status: taskStatus,
    input,
    work_mode: workMode,
    origin_surface: launchSurface,
    interaction_surface: interactionSurface,
    runtime_profile: runtimeProfile,
    runtime_target: runtimeTarget,
    model_plane: modelPlane,
    execution_plane: executionPlane,
    run_ids: [runId],
    last_run_id: runId,
    created_at: startedAt,
    updated_at: finishedAt,
    metadata: {
      ...intent.metadata,
      provisional: true,
      pack_id: packId,
      launch_source: intent.source,
      work_mode: workMode,
      launch_surface: launchSurface,
      interaction_surface: interactionSurface,
      runtime_profile: runtimeProfile,
      runtime_target: runtimeTarget,
      model_plane: modelPlane,
      execution_plane: executionPlane,
      workspace_target: workspaceTarget,
      local_runtime_seat: localRuntimeSeat,
      local_runtime_seat_preference: seatResolution.preference,
      mentions: intent.mentions,
      fallback_runtime: localRuntimeSeat === 'acp_bridge' ? getAgentMode() : localRuntimeSeat,
      error: errorMessage || undefined,
      local_runtime_dispatch: seatDispatchResult,
    },
  })
  const run = LongclawRunSchema.parse({
    run_id: runId,
    domain: launchDomain(packId),
    capability: launchRunCapability(taskCapability),
    status: runStatus,
    session_id: task.session_id,
    task_id: taskId,
    requested_by:
      typeof intent.session_context.user_id === 'string'
        ? intent.session_context.user_id
        : null,
    work_mode: workMode,
    origin_surface: launchSurface,
    interaction_surface: interactionSurface,
    runtime_profile: runtimeProfile,
    runtime_target: runtimeTarget,
    model_plane: modelPlane,
    execution_plane: executionPlane,
    summary: runtimeSummary,
    created_at: startedAt,
    started_at: startedAt,
    finished_at: finishedAt,
    metadata: {
      ...intent.metadata,
      provisional: true,
      pack_id: packId,
      launch_source: intent.source,
      work_mode: workMode,
      launch_surface: launchSurface,
      interaction_surface: interactionSurface,
      runtime_profile: runtimeProfile,
      runtime_target: runtimeTarget,
      model_plane: modelPlane,
      execution_plane: executionPlane,
      workspace_target: workspaceTarget,
      fallback_runtime: localRuntimeSeat === 'acp_bridge' ? getAgentMode() : localRuntimeSeat,
      local_runtime_seat: localRuntimeSeat,
      local_runtime_seat_preference: seatResolution.preference,
      local_runtime_dispatch: seatDispatchResult,
      raw_text: intent.raw_text,
    },
    pack_id: packId,
  })
  const workItems = failed
    ? [
        LongclawWorkItemSchema.parse({
          work_item_id: `work-local-${Date.now()}`,
          pack_id: packId,
          kind: 'delivery_failed',
          title: 'Fallback cowork launch failed',
          summary: errorMessage || 'Local cowork runtime failed before Hermes was available.',
          severity: 'warning',
          status: 'open',
          run_id: runId,
          work_mode: workMode,
          origin_surface: launchSurface,
          interaction_surface: interactionSurface,
          runtime_profile: runtimeProfile,
          runtime_target: runtimeTarget,
          model_plane: modelPlane,
          execution_plane: executionPlane,
          artifact_refs: [],
          operator_actions: [],
          created_at: finishedAt,
          updated_at: finishedAt,
          metadata: {
            provisional: true,
            launch_id: launchId,
            work_mode: workMode,
            launch_surface: launchSurface,
            interaction_surface: interactionSurface,
            runtime_profile: runtimeProfile,
            runtime_target: runtimeTarget,
            model_plane: modelPlane,
            execution_plane: executionPlane,
            workspace_target: workspaceTarget,
            local_runtime_seat: localRuntimeSeat,
            local_runtime_seat_preference: seatResolution.preference,
          },
        }),
      ]
    : []

  return LongclawLaunchReceiptSchema.parse({
    launch_id: launchId,
    pack_id: packId,
    task,
    run,
    artifacts: [],
    review_actions: [],
    work_items: workItems,
    compiled_input: input,
    metadata: {
      source: 'local_fallback',
      provisional: true,
      work_mode: workMode,
      launch_surface: launchSurface,
      interaction_surface: interactionSurface,
      runtime_profile: runtimeProfile,
      runtime_target: runtimeTarget,
      model_plane: modelPlane,
      execution_plane: executionPlane,
      workspace_target: workspaceTarget,
      fallback_runtime: localRuntimeSeat === 'acp_bridge' ? getAgentMode() : localRuntimeSeat,
      local_runtime_seat: localRuntimeSeat,
      local_runtime_seat_preference: seatResolution.preference,
      local_runtime_dispatch: seatDispatchResult,
    },
  })
}

async function handleLaunchIntent(
  event: Electron.IpcMainInvokeEvent,
  payload: unknown,
) {
  const parsedIntent = LongclawLaunchIntentSchema.parse(payload)
  const seatPreference = normalizeLocalRuntimeSeatPreference(
    parsedIntent.metadata.local_runtime_seat_preference,
  )
  const seatResolution = resolveLaunchSeat(parsedIntent.work_mode, seatPreference)
  const intent = withLaunchSeatMetadata(parsedIntent, seatResolution)
  try {
    const receipt = await getControlPlaneClient().launch(intent)
    const hasPackMention = intent.mentions.some(mention => mention.kind === 'pack')
    const shouldDispatchLocalSeat =
      intent.work_mode !== 'cloud_sandbox' &&
      seatResolution.available &&
      (receipt.pack_id === 'local_runtime' || !hasPackMention)

    if (shouldDispatchLocalSeat) {
      if (seatResolution.seat === 'acp_bridge') {
        const sender = event.sender
        const b = await ensureBackend()
        await b.query(String(intent.requested_outcome ?? intent.raw_text).trim(), rawEvent => {
          forwardAgentEvent(sender, rawEvent as AgentStreamEvent)
        })
      } else if (seatResolution.seat === 'local_runtime_api') {
        await dispatchToLocalRuntimeApi({
          launch_id: receipt.launch_id,
          task_id: receipt.task.task_id,
          work_mode: intent.work_mode,
          requested_outcome: String(intent.requested_outcome ?? intent.raw_text).trim(),
          mentions: intent.mentions as Array<Record<string, unknown>>,
          workspace_root:
            typeof intent.workspace_target === 'string' && intent.workspace_target
              ? intent.workspace_target
              : currentCwd,
          runtime_profile:
            currentRuntimeProfile(intent.work_mode, seatResolution) as
              | 'dev_local_acp_bridge'
              | 'packaged_local_runtime'
              | 'cloud_managed_runtime',
          model_plane: 'cloud_provider',
          raw_text: intent.raw_text,
        }, seatResolution.preference)
      }
    }

    return LongclawLaunchReceiptSchema.parse({
      ...receipt,
      task: {
        ...receipt.task,
        metadata: {
          ...(receipt.task.metadata ?? {}),
          local_runtime_seat: seatResolution.seat,
          local_runtime_seat_preference: seatResolution.preference,
        },
      },
      run: {
        ...receipt.run,
        metadata: {
          ...(receipt.run.metadata ?? {}),
          local_runtime_seat: seatResolution.seat,
          local_runtime_seat_preference: seatResolution.preference,
        },
      },
      metadata: {
        ...(receipt.metadata ?? {}),
        local_runtime_seat: seatResolution.seat,
        local_runtime_seat_preference: seatResolution.preference,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const hasPackMention = intent.mentions.some(mention => mention.kind === 'pack')
    const missingPackRouting =
      /LaunchIntent requires an @pack mention/.test(message) && !hasPackMention
    const shouldFallback =
      !getControlPlaneClient().isHermesBacked() ||
      /404\b/.test(message) ||
      /Launch requires Hermes Agent OS/.test(message) ||
      missingPackRouting

    if (!shouldFallback) {
      throw error
    }
    return handleProvisionalLaunch(event, intent)
  }
}

// --- IPC Handlers ---

async function handleQuery(_event: Electron.IpcMainInvokeEvent, message: string) {
  const sender = _event.sender
  const b = await ensureBackend()

  await b.query(message, (event) => {
    forwardAgentEvent(sender, event as AgentStreamEvent)
  })

  return { ok: true }
}

app.whenReady().then(() => {
  log('app ready', {
    run_id: observationState.run_id,
    observation_dir: observationState.observation_dir,
    logs: observationState.logs,
  })
  // Agent
  ipcMain.handle('agent:query', handleQuery)
  ipcMain.handle('agent:clear', async () => {
    backend?.clear()
    return { ok: true }
  })
  ipcMain.handle('agent:mode', () => {
    return { mode: getAgentMode(), alive: backend?.alive() ?? false }
  })

  // CWD management
  ipcMain.handle('cwd:get', () => currentCwd)

  ipcMain.handle('cwd:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '选择项目目录',
      defaultPath: currentCwd,
    })
    if (!result.canceled && result.filePaths[0]) {
      const newCwd = result.filePaths[0]
      currentCwd = newCwd
      if (backend) {
        backend.close()
        backend = null
      }
      log(`cwd changed to: ${newCwd}`)
      return { cwd: newCwd, skills: discoverSkills(newCwd) }
    }
    return null
  })

  ipcMain.handle('cwd:set', (_event, newCwd: string) => {
    if (fs.existsSync(newCwd)) {
      currentCwd = newCwd
      if (backend) {
        backend.close()
        backend = null
      }
      log(`cwd set to: ${newCwd}`)
      return { cwd: newCwd, skills: discoverSkills(newCwd) }
    }
    return null
  })

  // Skills
  ipcMain.handle('skills:list', () => discoverAllSkills())

  // Cowork front door + capability substrate
  ipcMain.handle('launch:submit', handleLaunchIntent)
  ipcMain.handle('launch:list-tasks', async (_event, limit?: number) =>
    getControlPlaneClient().listTasks(typeof limit === 'number' ? limit : 50),
  )
  ipcMain.handle('launch:get-task', async (_event, taskId: string) =>
    getControlPlaneClient().getTask(taskId),
  )
  ipcMain.handle('weclaw:list-sessions', () => listWeclawSessions())
  ipcMain.handle('weclaw:get-session', (_event, sessionId: string) => getWeclawSession(sessionId))
  ipcMain.handle('weclaw:get-source-status', () => getWeclawSessionSourceStatus())
  ipcMain.handle(
    'weclaw:update-session-state',
    (_event, canonicalSessionId: string, patch: Partial<{ hidden: boolean; archived: boolean }>) =>
      updateWeclawSessionUiState(canonicalSessionId, patch),
  )
  ipcMain.handle('capability-substrate:get-summary', buildCapabilitySubstrateSummary)
  ipcMain.handle('capability-manager:get-settings', () => getCapabilityManagerSettings())
  ipcMain.handle('capability-manager:update-settings', (_event, patch: unknown) =>
    updateCapabilityManagerSettings(patch),
  )
  ipcMain.handle('capability-manager:get-registry', () => getRuntimeCapabilityRegistry())
  ipcMain.handle(
    'capability-manager:register',
    (_event, payload: { kind: RuntimeCapabilityKind; sourcePath: string; label?: string }) =>
      registerManagedCapability(payload),
  )
  ipcMain.handle('capability-manager:remove', (_event, registryId: string) =>
    removeManagedCapability(registryId),
  )
  ipcMain.handle('capability-manager:rescan', () => rescanManagedCapabilities())
  ipcMain.handle('runtime:get-local-seat-preference', () => getLocalRuntimeSeatPreference())
  ipcMain.handle('runtime:set-local-seat-preference', (_event, value: unknown) => ({
    preference: setLocalRuntimeSeatPreference(value),
  }))

  // Control plane
  ipcMain.handle('control-plane:get-overview', async () => getControlPlaneClient().getOverview())
  ipcMain.handle('control-plane:list-runs', async () => getControlPlaneClient().listRuns())
  ipcMain.handle('control-plane:list-work-items', async () => getControlPlaneClient().listWorkItems())
  ipcMain.handle('control-plane:get-pack-dashboard', async (_event, packId: string) => getControlPlaneClient().getPackDashboard(packId))
  ipcMain.handle('control-plane:list-artifacts', async (_event, runId: string, domain: string) => getControlPlaneClient().listArtifacts(runId, domain))
  ipcMain.handle('control-plane:execute-action', async (_event, actionId: string, payload: any) => getControlPlaneClient().executeAction(actionId, payload ?? {}))
  ipcMain.handle('control-plane:local-action', handleLocalAction)
  ipcMain.handle('control-plane:read-artifact-preview', handleReadArtifactPreview)
  ipcMain.handle('window:set-locale', async (_event, locale: string) => {
    applyWindowLocale(locale === 'en-US' ? 'en-US' : 'zh-CN')
    return { ok: true }
  })
  ipcMain.handle('observation:get-context', () => ({
    ok: true,
    run_id: observationState.run_id,
    product_line: observationState.product_line,
    scenario: observationState.scenario,
    observation_dir: observationState.observation_dir,
    logs: observationState.logs,
    git: observationState.git,
    runtime: observationState.runtime,
  }))
  ipcMain.handle('observation:record-event', (_event, payload: Record<string, unknown>) => {
    appendObservationJsonl(observationEventsPath, 'events', {
      source: 'renderer',
      ...(compactObservationValue(payload) as Record<string, unknown>),
    })
    return {
      ok: true,
      run_id: observationState.run_id,
      observation_dir: observationState.observation_dir,
    }
  })
  ipcMain.handle('observation:record-api-timing', (_event, payload: Record<string, unknown>) => {
    appendObservationJsonl(observationApiTimingsPath, 'api_timings', {
      source: 'renderer-api',
      ...(compactObservationValue(payload) as Record<string, unknown>),
    })
    return {
      ok: true,
      run_id: observationState.run_id,
      observation_dir: observationState.observation_dir,
    }
  })

  createWindow()
})

app.on('window-all-closed', () => {
  log('window-all-closed')
  backend?.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  log('app activate')
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

process.on('uncaughtException', error => {
  log('uncaughtException', error?.stack || error?.message || String(error))
  appendObservationJsonl(observationEventsPath, 'events', {
    source: 'electron-main',
    name: 'process.uncaughtException',
    level: 'error',
    message: error?.message,
    stack: error?.stack,
  })
})

process.on('unhandledRejection', reason => {
  log('unhandledRejection', reason instanceof Error ? reason.stack || reason.message : String(reason))
  appendObservationJsonl(observationEventsPath, 'events', {
    source: 'electron-main',
    name: 'process.unhandledRejection',
    level: 'error',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  })
})
