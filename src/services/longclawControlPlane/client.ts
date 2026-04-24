import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import {
  type DueDiligenceDashboard,
  DueDiligenceDashboardSchema,
  LongclawArtifactSchema,
  type LongclawArtifact,
  type LongclawControlPlaneOverview,
  LongclawControlPlaneOverviewSchema,
  type LongclawDomainPackDescriptor,
  LongclawDomainPackDescriptorSchema,
  type LongclawExecutionPlane,
  type LongclawInteractionSurface,
  type LongclawLaunchIntent,
  LongclawLaunchIntentSchema,
  type LongclawLaunchReceipt,
  LongclawLaunchReceiptSchema,
  type LongclawModelPlane,
  type LongclawModeSummary,
  type LongclawPackDashboard,
  type LongclawRuntimeProfile,
  type LongclawRuntimeTarget,
  type LongclawRun,
  LongclawRunSchema,
  type LongclawTask,
  LongclawTaskSchema,
  type LongclawWorkMode,
  type LongclawWorkItem,
  LongclawWorkItemSchema,
  type SignalsDashboard,
  SignalsDashboardSchema,
} from './models.js'

export type LongclawControlPlaneClientOptions = {
  hermesAgentOsBaseUrl?: string
  hermesApiKey?: string
  dueDiligenceBaseUrl?: string
  signalsStateRoot?: string
  signalsWebBaseUrl?: string
  signalsWeb2BaseUrl?: string
  fetchImpl?: typeof fetch
}

function envValue(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function inferWorkMode(run: LongclawRun): LongclawWorkMode {
  const metadata = recordValue(run.metadata)
  const surface = inferInteractionSurface(run)
  const runtimeTarget = inferRuntimeTarget(run)

  if (run.work_mode) return run.work_mode
  if (runtimeTarget === 'local_runtime' && surface === 'weclaw') return 'weclaw_dispatch'
  return runtimeTarget === 'local_runtime' ? 'local' : 'cloud_sandbox'
}

function executionPlaneForMode(workMode: LongclawWorkMode): LongclawExecutionPlane {
  return runtimeTargetForMode(workMode) === 'cloud_runtime' ? 'cloud_executor' : 'local_executor'
}

function runtimeTargetForMode(workMode: LongclawWorkMode): LongclawRuntimeTarget {
  return workMode === 'cloud_sandbox' ? 'cloud_runtime' : 'local_runtime'
}

function interactionSurfaceForMode(workMode: LongclawWorkMode): LongclawInteractionSurface {
  return workMode === 'weclaw_dispatch' ? 'weclaw' : 'electron_home'
}

function modelPlaneForMode(): LongclawModelPlane {
  return 'cloud_provider'
}

function inferRuntimeProfile(run: LongclawRun): LongclawRuntimeProfile {
  const metadata = recordValue(run.metadata)
  return (
    (stringValue(run.runtime_profile) as LongclawRuntimeProfile | undefined) ??
    (stringValue(metadata.runtime_profile) as LongclawRuntimeProfile | undefined) ??
    'dev_local_acp_bridge'
  )
}

function inferRuntimeTarget(run: LongclawRun): LongclawRuntimeTarget {
  const metadata = recordValue(run.metadata)
  const explicit =
    (stringValue(run.runtime_target) as LongclawRuntimeTarget | undefined) ??
    (stringValue(metadata.runtime_target) as LongclawRuntimeTarget | undefined)
  if (explicit) return explicit

  const legacy = stringValue(run.execution_plane) ?? stringValue(metadata.execution_plane)
  if (legacy === 'weclaw_dispatch' || legacy === 'local_executor') return 'local_runtime'
  if (legacy === 'cloud_executor') return 'cloud_runtime'
  return runtimeTargetForMode(run.work_mode ?? 'cloud_sandbox')
}

function inferInteractionSurface(run: LongclawRun): LongclawInteractionSurface {
  const metadata = recordValue(run.metadata)
  const explicit =
    (stringValue(run.interaction_surface) as LongclawInteractionSurface | undefined) ??
    (stringValue(metadata.interaction_surface) as LongclawInteractionSurface | undefined)
  if (explicit) return explicit

  const candidate =
    stringValue(run.origin_surface) ??
    stringValue(metadata.origin_surface) ??
    stringValue(metadata.launch_surface) ??
    stringValue(metadata.launch_source) ??
    stringValue(metadata.source) ??
    stringValue(metadata.channel)
  if (candidate) {
    const normalized = candidate.toLowerCase()
    if (normalized.includes('weclaw') || normalized.includes('wechat') || normalized.includes('dispatch')) {
      return 'weclaw'
    }
    if (normalized.includes('electron') || normalized.includes('home') || normalized.includes('desktop')) {
      return 'electron_home'
    }
  }
  return interactionSurfaceForMode(run.work_mode ?? 'cloud_sandbox')
}

function inferOriginSurface(run: LongclawRun): string | null {
  return run.origin_surface ?? inferInteractionSurface(run)
}

function inferModelPlane(run: LongclawRun): LongclawModelPlane {
  const metadata = recordValue(run.metadata)
  return (
    (stringValue(run.model_plane) as LongclawModelPlane | undefined) ??
    (stringValue(metadata.model_plane) as LongclawModelPlane | undefined) ??
    modelPlaneForMode()
  )
}

function summarizeModes(
  tasks: LongclawTask[],
  runs: LongclawRun[],
  workItems: LongclawWorkItem[],
): LongclawModeSummary {
  const empty = (): LongclawModeSummary['tasks'] => ({
    local: 0,
    cloud_sandbox: 0,
    weclaw_dispatch: 0,
  })
  const summary: LongclawModeSummary = {
    tasks: empty(),
    runs: empty(),
    work_items: empty(),
  }

  for (const task of tasks) {
    summary.tasks[task.work_mode] += 1
  }
  for (const run of runs) {
    summary.runs[run.work_mode] += 1
  }
  for (const item of workItems) {
    summary.work_items[item.work_mode] += 1
  }

  return summary
}

export function createLongclawControlPlaneClientFromEnv(
  overrides: LongclawControlPlaneClientOptions = {},
): LongclawControlPlaneClient {
  return new LongclawControlPlaneClient({
    hermesAgentOsBaseUrl:
      overrides.hermesAgentOsBaseUrl ??
      envValue('LONGCLAW_HERMES_AGENT_OS_BASE_URL') ??
      envValue('LONGCLAW_AGENT_OS_BASE_URL'),
    hermesApiKey:
      overrides.hermesApiKey ??
      envValue('LONGCLAW_AGENT_OS_API_KEY') ??
      envValue('LONGCLAW_HERMES_API_KEY'),
    dueDiligenceBaseUrl:
      overrides.dueDiligenceBaseUrl ??
      envValue('LONGCLAW_DUE_DILIGENCE_BASE_URL'),
    signalsStateRoot:
      overrides.signalsStateRoot ??
      envValue('LONGCLAW_SIGNALS_STATE_ROOT'),
    signalsWebBaseUrl:
      overrides.signalsWebBaseUrl ??
      envValue('LONGCLAW_SIGNALS_WEB_BASE_URL'),
    signalsWeb2BaseUrl:
      overrides.signalsWeb2BaseUrl ??
      envValue('LONGCLAW_SIGNALS_WEB2_BASE_URL'),
    fetchImpl: overrides.fetchImpl,
  })
}

const defaultPacks = (
  options: LongclawControlPlaneClientOptions,
): LongclawDomainPackDescriptor[] => {
  const packs: LongclawDomainPackDescriptor[] = []
  if (options.dueDiligenceBaseUrl) {
    packs.push(
      LongclawDomainPackDescriptorSchema.parse({
        pack_id: 'due_diligence',
        domain: 'due_diligence',
        version: '0.1.0',
        owner_repo: 'due-diligence-core',
        runtime: 'cloud',
        description:
          'Due-diligence flagship pack with runtime health, evidence bundles, and review queues.',
        metadata: {
          transport: 'http',
          baseUrl: options.dueDiligenceBaseUrl,
        },
      }),
    )
  }
  if (options.signalsStateRoot || options.signalsWebBaseUrl || options.signalsWeb2BaseUrl) {
    packs.push(
      LongclawDomainPackDescriptorSchema.parse({
        pack_id: 'signals',
        domain: 'financial_analysis',
        version: '0.1.0',
        owner_repo: 'Signals',
        runtime: 'cloud',
        description: 'Signals flagship pack backed by the LONG CLAW analysis ledger.',
        metadata: {
          transport: 'filesystem',
          stateRoot: options.signalsStateRoot,
          webBaseUrl: options.signalsWebBaseUrl ?? null,
          web2BaseUrl: options.signalsWeb2BaseUrl ?? null,
        },
      }),
    )
  }
  return packs
}

function degradedDueDiligenceDashboard(
  status: 'healthy' | 'degraded' | 'not_connected',
  notice: string,
): DueDiligenceDashboard {
  return DueDiligenceDashboardSchema.parse({
    pack_id: 'due_diligence',
    title: 'Due Diligence',
    status,
    notice,
    diagnostics: [],
    recent_runs: [],
    manual_review_queue: [],
    repair_cases: [],
    site_health: [],
    operator_actions: [],
  })
}

function degradedSignalsDashboard(
  status: 'healthy' | 'degraded' | 'not_connected',
  notice: string,
): SignalsDashboard {
  return SignalsDashboardSchema.parse({
    pack_id: 'signals',
    title: 'Signals',
    status,
    notice,
    diagnostics: [],
    overview: {
      market_regime: {},
      cluster_summary: {},
      review_summary: {},
      data_warning: '',
    },
    recent_runs: [],
    review_runs: [],
    buy_candidates: [],
    sell_warnings: [],
    chart_context: null,
    backtest_summary: { total: 0, evaluated: 0, pending: 0 },
    backtest_jobs: [],
    pending_backlog_preview: [],
    connector_health: [],
    deep_links: [],
    operator_actions: [],
  })
}

function localAction(
  actionId: string,
  runId: string,
  kind: 'open_path' | 'open_url' | 'copy_value',
  label: string,
  payload: Record<string, unknown>,
) {
  return {
    action_id: actionId,
    run_id: runId,
    kind,
    label,
    payload,
    metadata: {},
  }
}

function packDiagnostic(
  diagnosticId: string,
  status: string,
  label: string,
  detail: string,
  metadata: Record<string, unknown> = {},
) {
  return {
    diagnostic_id: diagnosticId,
    status,
    label,
    detail,
    metadata,
  }
}

async function fetchJsonOrNull<T>(
  url: string | undefined,
  parse: (value: unknown) => T,
  fetchImpl: typeof fetch,
  init?: RequestInit,
): Promise<T | null> {
  if (!url) return null
  try {
    return await fetchJson(url, parse, fetchImpl, init)
  } catch {
    return null
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function connectorHealthEntry(
  connectorId: string,
  status: string,
  summary: string,
  details: Record<string, unknown> = {},
) {
  return {
    connector_id: connectorId,
    status,
    summary,
    details,
  }
}

function candidateRecord(
  symbol: string,
  source: Record<string, unknown>,
  defaults: { direction?: string; reason?: string; status?: string } = {},
) {
  return {
    symbol,
    name: stringValue(source.name) ?? '',
    score:
      numberValue(source.fused_total) ??
      numberValue(source.total_score) ??
      numberValue(source.score) ??
      numberValue(source.momentum_score) ??
      0,
    direction: stringValue(source.direction) ?? defaults.direction ?? '',
    reason:
      stringValue(source.detail) ??
      stringValue(source.summary) ??
      stringValue(source.signal_level) ??
      defaults.reason ??
      '',
    status: defaults.status ?? 'open',
    metadata: source,
  }
}

async function fetchJson<T>(
  url: string,
  parse: (value: unknown) => T,
  fetchImpl: typeof fetch,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchImpl(url, init)
  if (!response.ok) {
    throw new Error(`Longclaw control plane request failed: ${response.status} ${url}`)
  }
  return parse(await response.json())
}

async function readSignalsRunFiles(stateRoot: string): Promise<LongclawRun[]> {
  const runsRoot = join(stateRoot, 'runs')
  let entries: string[]
  try {
    entries = await readdir(runsRoot)
  } catch {
    return []
  }

  const runs = await Promise.all(
    entries.map(async entry => {
      try {
        const raw = await readFile(join(runsRoot, entry, 'run.json'), 'utf-8')
        return LongclawRunSchema.parse(JSON.parse(raw))
      } catch {
        return null
      }
    }),
  )

  return runs
    .filter((run): run is LongclawRun => Boolean(run))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function capabilityFromRun(run: LongclawRun): string {
  if (run.capability.includes('.')) return run.capability
  if (run.pack_id) return `${run.pack_id}.${run.capability}`
  const metadata = run.metadata as Record<string, unknown>
  const packId = metadata.pack_id
  return typeof packId === 'string' && packId ? `${packId}.${run.capability}` : run.capability
}

function provisionalTaskId(run: LongclawRun): string {
  return run.task_id ?? `task:provisional:${run.run_id}`
}

function updatedAtForRun(run: LongclawRun): string {
  return run.finished_at ?? run.started_at ?? run.created_at
}

function taskInputFromRun(run: LongclawRun): Record<string, unknown> {
  const metadata = run.metadata as Record<string, unknown>
  return {
    query:
      metadata.query ??
      metadata.requested_outcome ??
      metadata.raw_text ??
      metadata.summary ??
      run.summary,
    raw_text: metadata.raw_text ?? undefined,
    requested_outcome: metadata.requested_outcome ?? undefined,
  }
}

function provisionalTaskFromRun(run: LongclawRun): LongclawTask {
  const metadata = run.metadata as Record<string, unknown>
  const workMode = inferWorkMode(run)
  const originSurface = inferOriginSurface(run)
  const interactionSurface = inferInteractionSurface(run)
  const runtimeProfile = inferRuntimeProfile(run)
  const runtimeTarget = inferRuntimeTarget(run)
  const modelPlane = inferModelPlane(run)
  const executionPlane = run.execution_plane ?? executionPlaneForMode(workMode)
  return LongclawTaskSchema.parse({
    task_id: provisionalTaskId(run),
    capability: capabilityFromRun(run),
    session_id: run.session_id ?? null,
    channel:
      typeof metadata.channel === 'string'
        ? metadata.channel
        : typeof metadata.launch_source === 'string'
          ? metadata.launch_source
          : null,
    status: run.status,
    input: taskInputFromRun(run),
    work_mode: workMode,
    origin_surface: originSurface,
    interaction_surface: interactionSurface,
    runtime_profile: runtimeProfile,
    runtime_target: runtimeTarget,
    model_plane: modelPlane,
    execution_plane: executionPlane,
    run_ids: [run.run_id],
    last_run_id: run.run_id,
    created_at: run.created_at,
    updated_at: updatedAtForRun(run),
    metadata: {
      ...metadata,
      provisional: true,
      derived_from_run: true,
      pack_id: run.pack_id ?? metadata.pack_id ?? null,
      work_mode: workMode,
      origin_surface: originSurface,
      interaction_surface: interactionSurface,
      runtime_profile: runtimeProfile,
      runtime_target: runtimeTarget,
      model_plane: modelPlane,
      execution_plane: executionPlane,
    },
  })
}

export class LongclawControlPlaneClient {
  private readonly hermesAgentOsBaseUrl?: string
  private readonly hermesApiKey?: string
  private readonly dueDiligenceBaseUrl?: string
  private readonly signalsStateRoot?: string
  private readonly signalsWebBaseUrl?: string
  private readonly signalsWeb2BaseUrl?: string
  private readonly fetchImpl: typeof fetch

  constructor(options: LongclawControlPlaneClientOptions = {}) {
    this.hermesAgentOsBaseUrl = options.hermesAgentOsBaseUrl?.replace(/\/$/, '')
    this.hermesApiKey = options.hermesApiKey
    this.dueDiligenceBaseUrl = options.dueDiligenceBaseUrl?.replace(/\/$/, '')
    this.signalsStateRoot = options.signalsStateRoot
    this.signalsWebBaseUrl = options.signalsWebBaseUrl?.replace(/\/$/, '')
    this.signalsWeb2BaseUrl = options.signalsWeb2BaseUrl?.replace(/\/$/, '')
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  private authHeaders(): HeadersInit | undefined {
    if (!this.hermesApiKey) return undefined
    return { Authorization: `Bearer ${this.hermesApiKey}` }
  }

  isHermesBacked(): boolean {
    return Boolean(this.hermesAgentOsBaseUrl)
  }

  async launch(intent: LongclawLaunchIntent): Promise<LongclawLaunchReceipt> {
    if (!this.hermesAgentOsBaseUrl) {
      throw new Error('Launch requires Hermes Agent OS')
    }

    return fetchJson(
      `${this.hermesAgentOsBaseUrl}/agent-os/launches`,
      value => LongclawLaunchReceiptSchema.parse(value),
      this.fetchImpl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authHeaders() ?? {}),
        },
        body: JSON.stringify(LongclawLaunchIntentSchema.parse(intent)),
      },
    )
  }

  async listPacks(): Promise<LongclawDomainPackDescriptor[]> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/packs`,
          value => LongclawDomainPackDescriptorSchema.array().parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Fall back to known local descriptors when the control plane is configured
        // but not currently reachable.
      }
    }
    return defaultPacks({
      dueDiligenceBaseUrl: this.dueDiligenceBaseUrl,
      signalsStateRoot: this.signalsStateRoot,
      signalsWebBaseUrl: this.signalsWebBaseUrl,
      signalsWeb2BaseUrl: this.signalsWeb2BaseUrl,
    })
  }

  async listTasks(limit = 50): Promise<LongclawTask[]> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/tasks?limit=${encodeURIComponent(String(limit))}`,
          value => LongclawTaskSchema.array().parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Fall back to a provisional task view when Hermes is partially rolled out.
      }
    }

    const tasks = new Map<string, LongclawTask>()
    for (const run of await this.listRuns()) {
      const taskId = provisionalTaskId(run)
      const existing = tasks.get(taskId)
      const current = provisionalTaskFromRun(run)
      if (!existing) {
        tasks.set(taskId, current)
        continue
      }
      tasks.set(
        taskId,
        LongclawTaskSchema.parse({
          ...existing,
          status: current.status,
          work_mode: current.work_mode ?? existing.work_mode,
          origin_surface: current.origin_surface ?? existing.origin_surface,
          interaction_surface: current.interaction_surface ?? existing.interaction_surface,
          runtime_profile: current.runtime_profile ?? existing.runtime_profile,
          runtime_target: current.runtime_target ?? existing.runtime_target,
          model_plane: current.model_plane ?? existing.model_plane,
          execution_plane: current.execution_plane ?? existing.execution_plane,
          run_ids: [...new Set([...existing.run_ids, run.run_id])],
          last_run_id: run.run_id,
          updated_at: current.updated_at ?? existing.updated_at,
          metadata: {
            ...existing.metadata,
            ...current.metadata,
          },
        }),
      )
    }

    return [...tasks.values()]
      .sort((left, right) =>
        String(right.updated_at ?? right.created_at ?? '').localeCompare(
          String(left.updated_at ?? left.created_at ?? ''),
        ),
      )
      .slice(0, limit)
  }

  async getTask(taskId: string): Promise<LongclawTask> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/tasks/${encodeURIComponent(taskId)}`,
          value => LongclawTaskSchema.parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Fall through to provisional run-derived lookup when Hermes is partially rolled out.
      }
    }

    const task = (await this.listTasks(500)).find(item => item.task_id === taskId)
    if (!task) {
      throw new Error(`Unknown task: ${taskId}`)
    }
    return task
  }

  async listRuns(): Promise<LongclawRun[]> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/runs`,
          value => LongclawRunSchema.array().parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Fall through to local descriptors so the renderer stays usable while
        // Longclaw Core is unavailable.
      }
    }

    const runs: LongclawRun[] = []
    if (this.dueDiligenceBaseUrl) {
      try {
        const payload = await fetchJson(
          `${this.dueDiligenceBaseUrl}/runs`,
          value => value as Array<Record<string, unknown>>,
          this.fetchImpl,
        )
        runs.push(
          ...payload.map(run =>
            LongclawRunSchema.parse({
              run_id: String(run.run_id),
              domain: 'due_diligence',
              capability: `${String(run.task_type ?? 'company')}_due_diligence`,
              status: String(run.status ?? 'queued'),
              requested_by: run.requested_by ? String(run.requested_by) : null,
              work_mode: run.work_mode,
              origin_surface:
                (run.origin_surface ? String(run.origin_surface) : null) ??
                (run.launch_surface ? String(run.launch_surface) : null) ??
                (run.launch_source ? String(run.launch_source) : null) ??
                (run.channel ? String(run.channel) : null),
              interaction_surface: run.interaction_surface,
              runtime_profile: run.runtime_profile,
              runtime_target: run.runtime_target,
              model_plane: run.model_plane,
              execution_plane: run.execution_plane,
              summary: String(run.legacy_summary_message ?? run.query ?? ''),
              created_at: String(run.created_at),
              started_at: run.started_at ? String(run.started_at) : null,
              finished_at: run.finished_at ? String(run.finished_at) : null,
              metadata: {
                pack_id: 'due_diligence',
                ...run,
              },
              pack_id: 'due_diligence',
            }),
          ),
        )
      } catch {
        // Keep degraded mode readable even when the Due Diligence service is down.
      }
    }
    if (this.signalsStateRoot) {
      runs.push(...(await readSignalsRunFiles(this.signalsStateRoot)))
    }
    return runs.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  async listArtifacts(runId: string, domain: string): Promise<LongclawArtifact[]> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/runs/${runId}/artifacts?domain=${encodeURIComponent(domain)}`,
          value => LongclawArtifactSchema.array().parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Fall through to pack-local artifact discovery when possible.
      }
    }

    if (domain === 'due_diligence' && this.dueDiligenceBaseUrl) {
      try {
        const manifest = await fetchJson(
          `${this.dueDiligenceBaseUrl}/runs/${runId}/artifacts`,
          value => value as Record<string, unknown>,
          this.fetchImpl,
        )
        const candidates = [
          manifest.delivery_zip_path
            ? {
                artifact_id: `${runId}:delivery_zip`,
                run_id: runId,
                kind: 'delivery_zip',
                uri: String(manifest.delivery_zip_path),
                title: 'delivery zip',
                metadata: {},
              }
            : null,
          manifest.diagnostic_manifest_path
            ? {
                artifact_id: `${runId}:diagnostic_manifest`,
                run_id: runId,
                kind: 'diagnostic_manifest',
                uri: String(manifest.diagnostic_manifest_path),
                title: 'diagnostic manifest',
                metadata: {},
              }
            : null,
        ].filter(Boolean)
        return candidates.map(artifact => LongclawArtifactSchema.parse(artifact))
      } catch {
        return []
      }
    }

    if (domain === 'financial_analysis' && this.signalsStateRoot) {
      try {
        const raw = await readFile(join(this.signalsStateRoot, 'runs', runId, 'run.json'), 'utf-8')
        const run = LongclawRunSchema.parse(JSON.parse(raw))
        const stdoutPath = String((run.metadata as Record<string, unknown>).stdout_path ?? '')
        if (!stdoutPath) return []
        return [
          LongclawArtifactSchema.parse({
            artifact_id: `${runId}:stdout`,
            run_id: runId,
            kind: 'stdout_log',
            uri: stdoutPath,
            title: 'signals stdout',
            metadata: {},
          }),
        ]
      } catch {
        return []
      }
    }

    return []
  }

  async listWorkItems(): Promise<LongclawWorkItem[]> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/work-items`,
          value => LongclawWorkItemSchema.array().parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Work items are optional in degraded mode.
      }
    }
    return []
  }

  async getPackDashboard(packId: string): Promise<LongclawPackDashboard> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/packs/${encodeURIComponent(packId)}/dashboard`,
          value =>
            packId === 'due_diligence'
              ? DueDiligenceDashboardSchema.parse(value)
              : SignalsDashboardSchema.parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch (error) {
        if (packId !== 'due_diligence' && packId !== 'signals') {
          throw error
        }
      }
    }

    if (packId === 'due_diligence' && this.dueDiligenceBaseUrl) {
      const runtimeDir = join(process.env.HOME ?? '', '.longclaw', 'runtime-v2')
      const healthUrl = `${this.dueDiligenceBaseUrl}/healthz`
      try {
        const [runs, manualReviewQueue, repairCases, siteHealth] = await Promise.all([
          this.listRuns(),
          fetchJson(
            `${this.dueDiligenceBaseUrl}/manual-review-queue`,
            value => value as Array<Record<string, unknown>>,
            this.fetchImpl,
          ),
          fetchJson(
            `${this.dueDiligenceBaseUrl}/repair-cases`,
            value => value as Array<Record<string, unknown>>,
            this.fetchImpl,
          ),
          fetchJson(
            `${this.dueDiligenceBaseUrl}/site-health`,
            value => value as Array<Record<string, unknown>>,
            this.fetchImpl,
          ),
        ])
        return DueDiligenceDashboardSchema.parse({
          pack_id: 'due_diligence',
          title: 'Due Diligence',
          status: 'healthy',
          notice: '',
          diagnostics: [
            packDiagnostic(
              'due-runtime',
              'available',
              'due-diligence runtime',
              this.dueDiligenceBaseUrl,
              { base_url: this.dueDiligenceBaseUrl },
            ),
          ],
          recent_runs: runs.filter(run => run.domain === 'due_diligence').slice(0, 20),
          manual_review_queue: manualReviewQueue.map(item => ({
            ...item,
            artifact_refs: [],
            operator_actions: [],
            metadata: item,
          })),
          repair_cases: repairCases.map(item => ({
            ...item,
            operator_actions: [],
          })),
          site_health: siteHealth.map(item => ({
            ...item,
            operator_actions: [],
          })),
          operator_actions: [
            localAction(
              'pack:due_diligence:open:url',
              'pack:due_diligence',
              'open_url',
              'Open runtime',
              { url: this.dueDiligenceBaseUrl },
            ),
            localAction(
              'pack:due_diligence:health:url',
              'pack:due_diligence',
              'copy_value',
              'Copy env check',
              { value: `curl -fsS ${healthUrl}` },
            ),
            localAction(
              'pack:due_diligence:config:path',
              'pack:due_diligence',
              'open_path',
              'Open config',
              { path: join(runtimeDir, 'stack.env') },
            ),
            localAction(
              'pack:due_diligence:logs:path',
              'pack:due_diligence',
              'open_path',
              'Open runtime dir',
              { path: runtimeDir },
            ),
          ],
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Due Diligence runtime is configured but currently unavailable.'
        return DueDiligenceDashboardSchema.parse({
          ...degradedDueDiligenceDashboard('degraded', message),
          diagnostics: [
            packDiagnostic(
              'due-runtime',
              'degraded',
              'due-diligence runtime',
              message,
              { base_url: this.dueDiligenceBaseUrl },
            ),
          ],
          operator_actions: [
            localAction(
              'pack:due_diligence:health:url',
              'pack:due_diligence',
              'copy_value',
              'Copy env check',
              { value: `curl -fsS ${healthUrl}` },
            ),
            localAction(
              'pack:due_diligence:config:path',
              'pack:due_diligence',
              'open_path',
              'Open config',
              { path: join(runtimeDir, 'stack.env') },
            ),
            localAction(
              'pack:due_diligence:logs:path',
              'pack:due_diligence',
              'open_path',
              'Open runtime dir',
              { path: runtimeDir },
            ),
          ],
        })
      }
    }

    if (packId === 'signals') {
      const runtimeDir = join(process.env.HOME ?? '', '.longclaw', 'runtime-v2')
      const web1 = this.signalsWebBaseUrl
      const web2 = this.signalsWeb2BaseUrl
      const stateRoot = this.signalsStateRoot
      const stateRootConfigured = Boolean(stateRoot)
      const stateRootEntries = stateRoot ? await readdir(stateRoot).catch(() => null) : null
      const stateRootExists = Array.isArray(stateRootEntries) && stateRootEntries.length > 0
      if (!stateRoot && !web1 && !web2) {
        return SignalsDashboardSchema.parse({
          ...degradedSignalsDashboard(
            'not_connected',
            'Signals state root and web endpoints are not configured for this Electron runtime.',
          ),
          diagnostics: [
            packDiagnostic(
              'signals-connectivity',
              'not_connected',
              'signals endpoints',
              'No state root, web1, or web2 endpoint is configured.',
            ),
          ],
          operator_actions: [
            localAction(
              'pack:signals:config:path',
              'pack:signals',
              'open_path',
              'Open config',
              { path: join(runtimeDir, 'stack.env') },
            ),
          ],
        })
      }

      const canonicalDashboard = await fetchJsonOrNull(
        web1 ? `${web1}/api/pack/dashboard` : undefined,
        value => SignalsDashboardSchema.parse(value),
        this.fetchImpl,
      )
      if (canonicalDashboard) return canonicalDashboard

      try {
        const runs = await this.listRuns()
        const recentRuns = runs.filter(run => run.domain === 'financial_analysis').slice(0, 20)
        const reviewRuns = runs.filter(run => run.capability === 'review').slice(0, 10)
        const [marketContext, indexReports, predictionOverview, reviewResults, reviewStatus, clusterLatest, tradeSummary] =
          await Promise.all([
            fetchJsonOrNull(
              web1 ? `${web1}/api/index/context` : undefined,
              value => recordValue(value),
              this.fetchImpl,
            ),
            fetchJsonOrNull(
              web1 ? `${web1}/api/index/reports` : undefined,
              value =>
                Array.isArray(value)
                  ? value.map(item => recordValue(item))
                  : [],
              this.fetchImpl,
            ),
            fetchJsonOrNull(
              web1 ? `${web1}/api/prediction/overview` : undefined,
              value => recordValue(value),
              this.fetchImpl,
            ),
            fetchJsonOrNull(
              web1 ? `${web1}/api/review/results` : undefined,
              value => recordValue(value),
              this.fetchImpl,
            ),
            fetchJsonOrNull(
              web1 ? `${web1}/api/review/status` : undefined,
              value => recordValue(value),
              this.fetchImpl,
            ),
            fetchJsonOrNull(
              web2 ? `${web2}/api/cluster/latest?top=5` : undefined,
              value => recordValue(value),
              this.fetchImpl,
            ),
            fetchJsonOrNull(
              web1 ? `${web1}/api/trade/summary` : undefined,
              value => recordValue(value),
              this.fetchImpl,
            ),
          ])

        const prediction = predictionOverview ?? {}
        const review = reviewResults ?? {}
        const reviewRunning = reviewStatus ?? {}
        const buyCandidates = [
          ...((Array.isArray(prediction.stock_buy) ? prediction.stock_buy : [])
            .map(item => candidateRecord(
              stringValue(recordValue(item).symbol) ?? '',
              recordValue(item),
              { direction: 'buy', reason: 'prediction overview' },
            ))),
          ...((Array.isArray(review.scored_symbols) ? review.scored_symbols : [])
            .slice(0, 8)
            .map(item => candidateRecord(
              stringValue(recordValue(item).symbol) ?? '',
              recordValue(item),
              { direction: 'buy', reason: 'review results' },
            ))),
        ].filter(item => item.symbol)
        const uniqueBuyCandidates = [...new Map(
          buyCandidates.map(item => [item.symbol, item] as const),
        ).values()].slice(0, 12)

        const sellWarnings = (Array.isArray(prediction.stock_sell) ? prediction.stock_sell : [])
          .map(item => candidateRecord(
            stringValue(recordValue(item).symbol) ?? '',
            recordValue(item),
            { direction: 'sell', reason: 'prediction overview', status: 'warning' },
          ))
          .filter(item => item.symbol)
          .slice(0, 10)

        const chartSeed =
          stringValue(indexReports?.[0]?.symbol) ??
          stringValue(indexReports?.[0]?.name) ??
          uniqueBuyCandidates[0]?.symbol ??
          'sh000300'
        const chartData = await fetchJsonOrNull(
          web1 ? `${web1}/api/chart/${encodeURIComponent(chartSeed)}?freq=daily` : undefined,
          value => recordValue(value),
          this.fetchImpl,
        )
        const chartMeta = recordValue(chartData?.meta)
        const chartReport = recordValue(chartData?.report)
        const chartReportSignals = Array.isArray(chartData?.report_signals)
          ? chartData.report_signals
          : []

        const backtestSeedRaw = uniqueBuyCandidates[0]?.symbol ?? stringValue(chartMeta.symbol) ?? ''
        const backtestSeed = backtestSeedRaw.includes('.')
          ? backtestSeedRaw.split('.').at(-1) ?? backtestSeedRaw
          : backtestSeedRaw.replace(/^[a-z]{2}/i, '')
        const backtestAnalysis = await fetchJsonOrNull(
          web2 && backtestSeed
            ? `${web2}/api/backtest/analyze?code=${encodeURIComponent(backtestSeed)}&freq=daily&signal_group=all&lookback=180`
            : undefined,
          value => recordValue(value),
          this.fetchImpl,
        )

        const backtestSummary = recordValue(backtestAnalysis?.forward_kpi ?? backtestAnalysis?.kpi)
        const totalSignals = numberValue(backtestSummary.total) ?? 0
        const evaluatedSignals = numberValue(backtestSummary.evaluated) ?? totalSignals
        const pendingSignals = Math.max(totalSignals - evaluatedSignals, 0)
        const pendingBacklogPreview = uniqueBuyCandidates.slice(0, 6).map(item => ({
          symbol: item.symbol,
          signal_date:
            stringValue(review.start_date) ??
            stringValue(review.start_label) ??
            new Date().toISOString().slice(0, 10),
          signal_type: item.direction || 'buy',
          freq: 'daily',
          created_at: null,
        }))

        const diagnostics = [
          packDiagnostic(
            'signals-state-root',
            stateRootConfigured ? (stateRootExists ? 'available' : 'degraded') : 'not_connected',
            'signals state root',
            stateRoot ?? 'not configured',
            { state_root: stateRoot ?? '' },
          ),
          packDiagnostic(
            'signals-web1',
            web1 ? (marketContext || indexReports ? 'available' : 'degraded') : 'not_connected',
            'signals web1',
            web1 ?? 'not configured',
            { base_url: web1 ?? '' },
          ),
          packDiagnostic(
            'signals-web2',
            web2 ? (clusterLatest || backtestAnalysis ? 'available' : 'degraded') : 'not_connected',
            'signals web2',
            web2 ?? 'not configured',
            { base_url: web2 ?? '' },
          ),
        ]

        const connectorHealth = [
          connectorHealthEntry(
            'signals-state-root',
            stateRootConfigured ? (stateRootExists ? 'available' : 'degraded') : 'not_connected',
            stateRootExists ? 'Signals state root is mounted.' : 'Signals state root is empty or missing.',
            { state_root: stateRoot ?? '' },
          ),
          connectorHealthEntry(
            'signals-web1',
            web1 ? (marketContext || indexReports ? 'available' : 'degraded') : 'not_connected',
            web1 ? 'Signals web1 supplies chart, review, and prediction data.' : 'Signals web1 is not configured.',
            { base_url: web1 ?? '' },
          ),
          connectorHealthEntry(
            'signals-web2',
            web2 ? (clusterLatest || backtestAnalysis ? 'available' : 'degraded') : 'not_connected',
            web2 ? 'Signals web2 supplies backtests and cluster scans.' : 'Signals web2 is not configured.',
            { base_url: web2 ?? '' },
          ),
        ]

        const signalsTerminalUrl = web1 ?? null
        const signalsLegacyUrl = web1 ? `${web1}/legacy` : null

        const operatorActions = [
          signalsTerminalUrl
            ? localAction(
                'pack:signals:web1:url',
                'pack:signals',
                'open_url',
                'Open Signals Terminal',
                { url: signalsTerminalUrl },
              )
            : null,
          signalsLegacyUrl
            ? localAction(
                'pack:signals:legacy:url',
                'pack:signals',
                'open_url',
                'Open Signals Legacy',
                { url: signalsLegacyUrl },
              )
            : null,
          web2
            ? localAction(
                'pack:signals:web2:url',
                'pack:signals',
                'open_url',
                'Open Signals Web2',
                { url: web2 },
              )
            : null,
          stateRoot
            ? localAction(
                'pack:signals:state-root:path',
                'pack:signals',
                'open_path',
                'Open state root',
                { path: stateRoot },
              )
            : null,
          localAction(
            'pack:signals:config:path',
            'pack:signals',
            'open_path',
            'Open config',
            { path: join(runtimeDir, 'stack.env') },
          ),
          web2
            ? localAction(
                'pack:signals:health:copy',
                'pack:signals',
                'copy_value',
                'Copy env check',
                { value: `curl -fsS ${web2}/api/cluster/latest?top=1` },
              )
            : null,
        ].filter(Boolean)

        const chartContext = chartData
          ? {
              symbol:
                stringValue(chartMeta.symbol) ??
                stringValue(chartMeta.name) ??
                chartSeed,
              freq: stringValue(chartMeta.freq) ?? 'daily',
              conclusion: stringValue(chartReport.conclusion) ?? '',
              latest_signal:
                stringValue(recordValue(chartReportSignals[0]).type) ??
                '',
              key_levels: Array.isArray(chartReport.key_levels)
                ? chartReport.key_levels
                    .map(item => recordValue(item))
                    .map(item => ({
                      name: stringValue(item.name) ?? '',
                      value: numberValue(item.value) ?? 0,
                      position: stringValue(item.position) ?? '',
                      distance_pct: numberValue(item.distance_pct),
                    }))
                : [],
              signal_markers: Array.isArray(chartData.signals)
                ? chartData.signals.slice(-8).map(item => {
                    const record = recordValue(item)
                    return {
                      time: numberValue(record.time) ?? numberValue(record.dt),
                      date_str: stringValue(record.date_str) ?? '',
                      type: stringValue(record.type) ?? '',
                      price: numberValue(record.price),
                      confidence: numberValue(record.confidence),
                    }
                  })
                : [],
              ohlcv_preview: Array.isArray(chartData.ohlcv)
                ? chartData.ohlcv.slice(-24).map(item => {
                    const record = recordValue(item)
                    return {
                      time: numberValue(record.time) ?? 0,
                      close: numberValue(record.close) ?? 0,
                    }
                  })
                : [],
              metadata: {
                report: chartReport,
              },
            }
          : null

        const deepLinks = [
          signalsTerminalUrl
            ? {
                link_id: 'signals-terminal',
                label: 'Signals Terminal',
                url: signalsTerminalUrl,
                kind: 'web',
              }
            : null,
          signalsLegacyUrl
            ? {
                link_id: 'signals-legacy',
                label: 'Signals Legacy',
                url: signalsLegacyUrl,
                kind: 'web',
              }
            : null,
          web2
            ? {
                link_id: 'signals-web2',
                label: 'Signals Web2',
                url: web2,
                kind: 'web',
              }
            : null,
          web1 && chartContext?.symbol
            ? {
                link_id: 'signals-chart',
                label: 'Chart Terminal',
                url: `${web1}/?symbol=${encodeURIComponent(chartContext.symbol)}&freq=${encodeURIComponent(chartContext.freq || 'daily')}`,
                kind: 'chart',
              }
            : null,
          web1 && backtestSeedRaw
            ? {
                link_id: 'signals-backtest',
                label: 'Backtest In Terminal',
                url: `${web1}/?symbol=${encodeURIComponent(backtestSeedRaw)}&kind=stock&freq=daily`,
                kind: 'backtest',
              }
            : null,
        ].filter(Boolean)

        const backtestJobs = [
          backtestAnalysis
            ? {
                job_id: `backtest:${backtestSeed || 'daily'}`,
                status: 'ready',
                symbol: backtestSeedRaw,
                freq: stringValue(backtestAnalysis.freq) ?? 'daily',
                summary:
                  stringValue(recordValue(backtestAnalysis.sim_kpi).summary) ??
                  `Win rate ${numberValue(recordValue(backtestAnalysis.sim_kpi).win_rate) ?? 0}%`,
                updated_at: new Date().toISOString(),
                source: 'web2',
                metadata: {
                  forward_kpi: recordValue(backtestAnalysis.forward_kpi),
                  sim_kpi: recordValue(backtestAnalysis.sim_kpi),
                },
              }
            : null,
          ...recentRuns.slice(0, 3).map(run => ({
            job_id: run.run_id,
            status: run.status,
            symbol: stringValue(recordValue(run.metadata).symbol) ?? '',
            freq: stringValue(recordValue(run.metadata).freq) ?? '',
            summary: run.summary ?? run.run_id,
            updated_at: run.finished_at ?? run.created_at,
            source: 'state_root',
            metadata: recordValue(run.metadata),
          })),
        ].filter(Boolean)

        const status =
          diagnostics.some(item => item.status === 'degraded')
            ? 'degraded'
            : diagnostics.every(item => item.status === 'not_connected')
              ? 'not_connected'
              : 'healthy'
        const noticeParts = [
          !stateRootExists && stateRootConfigured ? 'Signals state root is empty.' : '',
          web1 && !(marketContext || indexReports) ? 'Signals web1 is configured but unavailable.' : '',
          web2 && !(clusterLatest || backtestAnalysis) ? 'Signals web2 is configured but unavailable.' : '',
        ].filter(Boolean)

        return SignalsDashboardSchema.parse({
          pack_id: 'signals',
          title: 'Signals',
          status,
          notice: noticeParts.join(' '),
          diagnostics,
          overview: {
            market_regime: recordValue(prediction.market_regime ?? marketContext),
            cluster_summary: {
              market_status: recordValue(clusterLatest?.market_status),
              industry_top: Array.isArray(recordValue(clusterLatest?.industry).top)
                ? recordValue(clusterLatest?.industry).top
                : [],
              concept_top: Array.isArray(recordValue(clusterLatest?.concept).top)
                ? recordValue(clusterLatest?.concept).top
                : [],
            },
            review_summary: {
              start_date: stringValue(review.start_date) ?? '',
              start_label: stringValue(review.start_label) ?? '',
              is_running: reviewRunning.is_running === true,
              completed: reviewRunning.completed === true,
              trade_summary: tradeSummary,
            },
            data_warning: stringValue(clusterLatest?.data_warning) ?? '',
          },
          recent_runs: recentRuns,
          review_runs: reviewRuns,
          buy_candidates: uniqueBuyCandidates,
          sell_warnings: sellWarnings,
          chart_context: chartContext,
          backtest_summary: {
            total: totalSignals,
            evaluated: evaluatedSignals,
            pending: pendingSignals,
          },
          backtest_jobs: backtestJobs,
          pending_backlog_preview: pendingBacklogPreview,
          connector_health: connectorHealth,
          deep_links: deepLinks,
          operator_actions: operatorActions,
        })
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Signals runtime is configured but currently unavailable.'
        return SignalsDashboardSchema.parse({
          ...degradedSignalsDashboard('degraded', message),
          diagnostics: [
            packDiagnostic(
              'signals-runtime',
              'degraded',
              'signals runtime',
              message,
              {
                state_root: stateRoot ?? '',
                web1: web1 ?? '',
                web2: web2 ?? '',
              },
            ),
          ],
          connector_health: [
            connectorHealthEntry(
              'signals-state-root',
              stateRoot ? 'degraded' : 'not_connected',
              stateRoot ?? 'not configured',
              { state_root: stateRoot ?? '' },
            ),
          ],
          operator_actions: [
            localAction(
              'pack:signals:config:path',
              'pack:signals',
              'open_path',
              'Open config',
              { path: join(runtimeDir, 'stack.env') },
            ),
            stateRoot
              ? localAction(
                  'pack:signals:state-root:path',
                  'pack:signals',
                  'open_path',
                  'Open state root',
                  { path: stateRoot },
                )
              : null,
          ].filter(Boolean),
        })
      }
    }

    if (packId === 'due_diligence') {
      const runtimeDir = join(process.env.HOME ?? '', '.longclaw', 'runtime-v2')
      return DueDiligenceDashboardSchema.parse({
        ...degradedDueDiligenceDashboard(
          'not_connected',
          'Due Diligence runtime is not configured for this Electron session.',
        ),
        diagnostics: [
          packDiagnostic(
            'due-runtime',
            'not_connected',
            'due-diligence runtime',
            'Due Diligence runtime is not configured for this Electron session.',
          ),
        ],
        operator_actions: [
          localAction(
            'pack:due_diligence:config:path',
            'pack:due_diligence',
            'open_path',
            'Open config',
            { path: join(runtimeDir, 'stack.env') },
          ),
        ],
      })
    }

    throw new Error(`Unknown pack: ${packId}`)
  }

  async executeAction(actionId: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    if (!this.hermesAgentOsBaseUrl) {
      if (this.dueDiligenceBaseUrl && actionId.startsWith('pack:due_diligence:review:decision:')) {
        const reviewId = actionId.split(':').slice(-2, -1)[0]
        return fetchJson(
          `${this.dueDiligenceBaseUrl}/manual-review/${encodeURIComponent(reviewId)}/decision`,
          value => value as Record<string, unknown>,
          this.fetchImpl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
      }
      if (this.dueDiligenceBaseUrl && actionId.startsWith('pack:due_diligence:run:retry:')) {
        const runId = actionId.split(':').at(-1)
        if (!runId) {
          throw new Error(`Invalid action id: ${actionId}`)
        }
        return fetchJson(
          `${this.dueDiligenceBaseUrl}/runs/${encodeURIComponent(runId)}/retry`,
          value => value as Record<string, unknown>,
          this.fetchImpl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
      }
      throw new Error(`Action requires Hermes Agent OS: ${actionId}`)
    }

    return fetchJson(
      `${this.hermesAgentOsBaseUrl}/agent-os/actions/${encodeURIComponent(actionId)}`,
      value => value as Record<string, unknown>,
      this.fetchImpl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.authHeaders() ?? {}),
        },
        body: JSON.stringify(payload),
      },
    )
  }

  async getOverview(): Promise<LongclawControlPlaneOverview> {
    if (this.hermesAgentOsBaseUrl) {
      try {
        return await fetchJson(
          `${this.hermesAgentOsBaseUrl}/agent-os/overview`,
          value => LongclawControlPlaneOverviewSchema.parse(value),
          this.fetchImpl,
          { headers: this.authHeaders() },
        )
      } catch {
        // Fall through to local overview synthesis when the configured control
        // plane is down or only partially rolled out.
      }
    }

    const [packs, runs, tasks, workItems] = await Promise.all([
      this.listPacks(),
      this.listRuns(),
      this.listTasks(200),
      this.listWorkItems(),
    ])
    const failedRuns = runs.filter(run =>
      ['failed', 'repair_required', 'partial'].includes(run.status),
    )
    return LongclawControlPlaneOverviewSchema.parse({
      packs,
      adapters: [],
      packHealth: [],
      adapterHealth: [],
      mode_summary: summarizeModes(tasks, runs, workItems),
      runs_summary: {
        total: runs.length,
        by_status: runs.reduce<Record<string, number>>((acc, run) => {
          acc[run.status] = (acc[run.status] ?? 0) + 1
          return acc
        }, {}),
        running: runs.filter(run => run.status === 'running').length,
        failed: runs.filter(run => ['failed', 'repair_required'].includes(run.status)).length,
        partial: runs.filter(run => run.status === 'partial').length,
        succeeded: runs.filter(run => run.status === 'succeeded').length,
      },
      work_items_summary: {
        total: workItems.length,
        open: workItems.filter(item => item.status === 'open').length,
        critical: workItems.filter(item => item.severity === 'critical').length,
        warning: workItems.filter(item => item.severity === 'warning').length,
        info: workItems.filter(item => item.severity === 'info').length,
      },
        recent_failures: failedRuns.slice(0, 8).map(run => ({
          run_id: run.run_id,
          pack_id: run.pack_id ?? String((run.metadata as Record<string, unknown>).pack_id ?? ''),
          status: run.status,
          work_mode: run.work_mode,
          runtime_profile: run.runtime_profile,
          runtime_target: run.runtime_target,
          interaction_surface: run.interaction_surface,
          model_plane: run.model_plane,
          execution_plane: run.execution_plane,
          summary: run.summary,
          created_at: run.created_at,
        })),
      memoryTargets: {
        raw: 'mempalace://raw',
        reviewed: 'obsidian://reviewed',
      },
    })
  }
}
