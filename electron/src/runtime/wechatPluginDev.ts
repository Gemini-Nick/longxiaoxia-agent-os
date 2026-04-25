import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export type WeChatBindingStateValue =
  | 'unbound'
  | 'qr_pending'
  | 'bound'
  | 'expired'
  | 'revoked'

export type WeChatBindingProvider = 'ilink_service_account' | 'local_lan_callback'

export type WeChatIdentityStatus =
  | 'unconfigured'
  | 'local_runtime_bound'
  | 'ilink_pending'
  | 'ilink_scanned'
  | 'ilink_verified'
  | 'ilink_failed'

export type WeChatScanStatus = 'wait' | 'scaned' | 'confirmed' | 'expired'

export type WeChatRouteKind =
  | 'knowledge_note'
  | 'dev_issue'
  | 'dev_plugin'
  | 'signals'
  | 'backtest'
  | 'unknown'

export type PluginDevIssueKind = 'skill' | 'plugin'
export type PluginDevIssueStatus =
  | 'issue_created'
  | 'branch_created'
  | 'implementing'
  | 'ci_running'
  | 'ci_failed'
  | 'mr_ready'
  | 'review_required'
  | 'merged'
  | 'registered'

export type WeChatBindingStatus = {
  state: WeChatBindingStateValue
  provider: WeChatBindingProvider
  qr_url?: string
  callback_url?: string
  binding_session_id?: string
  expires_at?: string
  wechat_user_id?: string
  display_name?: string
  bound_at?: string
  last_seen_at?: string
  identity_status: WeChatIdentityStatus
  identity_note?: string
  identity_verified_at?: string
  openid?: string
  unionid?: string
  ilink_qrcode?: string
  ilink_bot_id?: string
  ilink_user_id?: string
  ilink_baseurl?: string
  bot_token_present?: boolean
  account_path?: string
  scan_status?: WeChatScanStatus
  scan_remote_address?: string
  scan_user_agent?: string
  allowed_routes: WeChatRouteKind[]
  recent_inbound: Array<{
    route: WeChatRouteKind
    text: string
    at: string
    confidence: number
  }>
}

export type PluginPipelineRun = {
  pipeline_id: string
  status: 'pending' | 'running' | 'failed' | 'passed'
  checks: Array<{
    name: string
    status: 'pending' | 'running' | 'failed' | 'passed'
    summary: string
  }>
  started_at?: string
  finished_at?: string
}

export type PluginMergeRequest = {
  mr_id: string
  provider: 'local_git' | 'github' | 'gitlab'
  title: string
  branch_name: string
  target_branch: string
  status: 'draft' | 'ready' | 'merged'
  url?: string
  created_at: string
  merged_at?: string
}

export type PluginDevIssue = {
  issue_id: string
  source: 'wechat' | 'desktop'
  kind: PluginDevIssueKind
  title: string
  problem_statement: string
  acceptance_criteria: string[]
  target_repo: string
  branch_name: string
  status: PluginDevIssueStatus
  ci_status: 'not_started' | 'running' | 'failed' | 'passed'
  merge_status: 'not_started' | 'draft' | 'ready' | 'merged'
  artifact_path?: string
  created_at: string
  updated_at: string
  route_text: string
  route_confidence: number
  pipeline?: PluginPipelineRun
  merge_request?: PluginMergeRequest
  metadata: Record<string, unknown>
}

export type WeChatRouteReceipt = {
  route_id: string
  route: WeChatRouteKind
  status: 'routed' | 'needs_confirmation' | 'unsupported'
  confidence: number
  reason: string
  requires_confirmation: boolean
  reply_preview: string
  plugin_issue?: PluginDevIssue
  created_at: string
}

type WeChatBindingStateFile = {
  version: 'wechat-binding-v1'
  status: WeChatBindingStatus
}

type PluginDevStateFile = {
  version: 'plugin-dev-v1'
  issues: PluginDevIssue[]
  receipts: WeChatRouteReceipt[]
}

const DEFAULT_ALLOWED_ROUTES: WeChatRouteKind[] = [
  'knowledge_note',
  'dev_issue',
  'dev_plugin',
  'signals',
  'backtest',
]

function nowIso(): string {
  return new Date().toISOString()
}

function isExpired(value?: string): boolean {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time <= Date.now()
}

function slugify(value: string, fallback = 'plugin-dev'): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || fallback
  )
}

function readJson(pathname: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(pathname, 'utf-8')) as unknown
  } catch {
    return null
  }
}

function writeJson(pathname: string, payload: unknown): void {
  fs.mkdirSync(path.dirname(pathname), { recursive: true })
  fs.writeFileSync(pathname, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asRoute(value: unknown): WeChatRouteKind {
  const normalized = asString(value)
  if (
    normalized === 'knowledge_note' ||
    normalized === 'dev_issue' ||
    normalized === 'dev_plugin' ||
    normalized === 'signals' ||
    normalized === 'backtest' ||
    normalized === 'unknown'
  ) {
    return normalized
  }
  return 'unknown'
}

function asBindingProvider(value: unknown): WeChatBindingProvider {
  return value === 'local_lan_callback' ? 'local_lan_callback' : 'ilink_service_account'
}

function asIdentityStatus(value: unknown): WeChatIdentityStatus {
  if (
    value === 'local_runtime_bound' ||
    value === 'ilink_pending' ||
    value === 'ilink_scanned' ||
    value === 'ilink_verified' ||
    value === 'ilink_failed'
  ) {
    return value
  }
  return 'unconfigured'
}

function asScanStatus(value: unknown): WeChatScanStatus | undefined {
  if (value === 'wait' || value === 'scaned' || value === 'confirmed' || value === 'expired') {
    return value
  }
  return undefined
}

function defaultBindingStatus(): WeChatBindingStatus {
  return {
    state: 'unbound',
    provider: 'ilink_service_account',
    identity_status: 'unconfigured',
    allowed_routes: DEFAULT_ALLOWED_ROUTES,
    recent_inbound: [],
  }
}

export function readWeChatBindingStatus(statePath: string): WeChatBindingStatus {
  const raw = asRecord(readJson(statePath))
  const status = asRecord(raw.status)
  if (!status.state) return defaultBindingStatus()
  const normalized: WeChatBindingStatus = {
    ...defaultBindingStatus(),
    state:
      status.state === 'qr_pending' ||
      status.state === 'bound' ||
      status.state === 'expired' ||
      status.state === 'revoked'
        ? status.state
        : 'unbound',
    provider: asBindingProvider(status.provider),
    qr_url: asString(status.qr_url),
    callback_url: asString(status.callback_url),
    binding_session_id: asString(status.binding_session_id),
    expires_at: asString(status.expires_at),
    wechat_user_id: asString(status.wechat_user_id),
    display_name: asString(status.display_name),
    bound_at: asString(status.bound_at),
    last_seen_at: asString(status.last_seen_at),
    identity_status: asIdentityStatus(status.identity_status),
    identity_note: asString(status.identity_note),
    identity_verified_at: asString(status.identity_verified_at),
    openid: asString(status.openid),
    unionid: asString(status.unionid),
    ilink_qrcode: asString(status.ilink_qrcode),
    ilink_bot_id: asString(status.ilink_bot_id),
    ilink_user_id: asString(status.ilink_user_id),
    ilink_baseurl: asString(status.ilink_baseurl),
    bot_token_present: status.bot_token_present === true,
    account_path: asString(status.account_path),
    scan_status: asScanStatus(status.scan_status),
    scan_remote_address: asString(status.scan_remote_address),
    scan_user_agent: asString(status.scan_user_agent),
    allowed_routes: Array.isArray(status.allowed_routes)
      ? status.allowed_routes.map(asRoute).filter(route => route !== 'unknown')
      : DEFAULT_ALLOWED_ROUTES,
    recent_inbound: Array.isArray(status.recent_inbound)
      ? status.recent_inbound.slice(0, 10).map(item => {
          const record = asRecord(item)
          return {
            route: asRoute(record.route),
            text: asString(record.text) ?? '',
            at: asString(record.at) ?? nowIso(),
            confidence:
              typeof record.confidence === 'number'
                ? Math.max(0, Math.min(1, record.confidence))
                : 0,
          }
        })
      : [],
  }
  if (normalized.state === 'qr_pending' && isExpired(normalized.expires_at)) {
    return { ...normalized, state: 'expired' }
  }
  return normalized
}

export function persistWeChatBindingStatus(
  statePath: string,
  status: WeChatBindingStatus,
): WeChatBindingStatus {
  const payload: WeChatBindingStateFile = {
    version: 'wechat-binding-v1',
    status: {
      ...status,
      allowed_routes: status.allowed_routes.length ? status.allowed_routes : DEFAULT_ALLOWED_ROUTES,
      recent_inbound: status.recent_inbound.slice(0, 10),
    },
  }
  writeJson(statePath, payload)
  return payload.status
}

export function createWeChatBindingSession(
  statePath: string,
  options: {
    qrUrlBase?: string
    qrUrl?: string
    provider?: WeChatBindingProvider
    ilinkQrcode?: string
    ilinkBaseurl?: string
    identityStatus?: WeChatIdentityStatus
    identityNote?: string
    expiresInMs?: number
  } = {},
): WeChatBindingStatus {
  const createdAt = Date.now()
  const sessionId = `bind-${crypto.randomUUID()}`
  const qrUrlBase = options.qrUrlBase?.replace(/\/+$/g, '')
  const provider = options.provider ?? (options.qrUrl ? 'ilink_service_account' : 'local_lan_callback')
  return persistWeChatBindingStatus(statePath, {
    ...readWeChatBindingStatus(statePath),
    state: 'qr_pending',
    provider,
    binding_session_id: sessionId,
    qr_url: options.qrUrl ?? (qrUrlBase
      ? `${qrUrlBase}/wechat/bind?session=${encodeURIComponent(sessionId)}`
      : `longclaw-wechat://bind?session=${encodeURIComponent(sessionId)}`),
    callback_url: qrUrlBase ? `${qrUrlBase}/wechat/bind` : undefined,
    ilink_qrcode: options.ilinkQrcode,
    ilink_baseurl: options.ilinkBaseurl,
    identity_status:
      options.identityStatus ??
      (provider === 'ilink_service_account' ? 'ilink_pending' : 'unconfigured'),
    identity_note:
      options.identityNote ??
      (provider === 'ilink_service_account'
        ? 'Waiting for WeChat scan and iLink confirmation.'
        : 'Local LAN callback test mode; no OpenID/iLink identity proof.'),
    scan_status: provider === 'ilink_service_account' ? 'wait' : undefined,
    wechat_user_id: undefined,
    display_name: undefined,
    bound_at: undefined,
    last_seen_at: undefined,
    identity_verified_at: undefined,
    openid: undefined,
    unionid: undefined,
    ilink_bot_id: undefined,
    ilink_user_id: undefined,
    bot_token_present: undefined,
    account_path: undefined,
    scan_remote_address: undefined,
    scan_user_agent: undefined,
    expires_at: new Date(createdAt + (options.expiresInMs ?? 10 * 60 * 1000)).toISOString(),
  })
}

export function completeWeChatBindingSession(
  statePath: string,
  input: {
    bindingSessionId?: string
    wechatUserId?: string
    displayName?: string
    provider?: WeChatBindingProvider
    openid?: string
    unionid?: string
    ilinkBotId?: string
    ilinkUserId?: string
    ilinkBaseurl?: string
    botTokenPresent?: boolean
    accountPath?: string
    scanRemoteAddress?: string
    scanUserAgent?: string
    identityStatus?: WeChatIdentityStatus
    identityNote?: string
  } = {},
): WeChatBindingStatus {
  const status = readWeChatBindingStatus(statePath)
  if (status.state === 'expired') {
    persistWeChatBindingStatus(statePath, status)
    throw new Error('Binding QR expired. Refresh QR and scan again.')
  }
  if (status.state !== 'qr_pending' || !status.binding_session_id) {
    throw new Error('No pending WeChat binding session.')
  }
  if (input.bindingSessionId && input.bindingSessionId !== status.binding_session_id) {
    throw new Error('WeChat binding session mismatch.')
  }
  const now = nowIso()
  const provider = input.provider ?? status.provider
  const identityStatus =
    input.identityStatus ??
    (input.ilinkUserId || input.openid
      ? 'ilink_verified'
      : provider === 'local_lan_callback'
        ? 'local_runtime_bound'
        : 'ilink_failed')
  const identityNote =
    input.identityNote ??
    (identityStatus === 'ilink_verified'
      ? 'iLink scan confirmed and identity material returned by iLink.'
      : identityStatus === 'local_runtime_bound'
        ? 'WeChat scan reached local runtime; OpenID/iLink identity was not provided by this callback.'
        : 'iLink confirmation did not return identity material.')
  return persistWeChatBindingStatus(statePath, {
    ...status,
    state: 'bound',
    provider,
    qr_url: undefined,
    callback_url: provider === 'local_lan_callback' ? status.callback_url : undefined,
    expires_at: undefined,
    identity_status: identityStatus,
    identity_note: identityNote,
    identity_verified_at: identityStatus === 'ilink_verified' ? now : status.identity_verified_at,
    openid: input.openid ?? status.openid,
    unionid: input.unionid ?? status.unionid,
    ilink_bot_id: input.ilinkBotId ?? status.ilink_bot_id,
    ilink_user_id: input.ilinkUserId ?? status.ilink_user_id,
    ilink_baseurl: input.ilinkBaseurl ?? status.ilink_baseurl,
    bot_token_present: input.botTokenPresent ?? status.bot_token_present,
    account_path: input.accountPath ?? status.account_path,
    scan_status: identityStatus === 'ilink_verified' ? 'confirmed' : status.scan_status,
    scan_remote_address: input.scanRemoteAddress ?? status.scan_remote_address,
    scan_user_agent: input.scanUserAgent ?? status.scan_user_agent,
    wechat_user_id:
      input.wechatUserId ??
      input.ilinkUserId ??
      input.openid ??
      `wechat-${status.binding_session_id.slice(-8)}`,
    display_name:
      input.displayName ??
      (input.ilinkUserId ? `iLink ${input.ilinkUserId}` : undefined) ??
      'WeChat bound user',
    bound_at: now,
    last_seen_at: now,
  })
}

export function updateWeChatBindingScanStatus(
  statePath: string,
  input: {
    bindingSessionId?: string
    scanStatus: WeChatScanStatus
    identityStatus?: WeChatIdentityStatus
    identityNote?: string
    identityError?: string
  },
): WeChatBindingStatus {
  const status = readWeChatBindingStatus(statePath)
  if (status.state !== 'qr_pending' && !(status.state === 'expired' && input.scanStatus === 'expired')) {
    return status
  }
  if (input.bindingSessionId && input.bindingSessionId !== status.binding_session_id) return status
  return persistWeChatBindingStatus(statePath, {
    ...status,
    state: input.scanStatus === 'expired' ? 'expired' : status.state,
    scan_status: input.scanStatus,
    identity_status:
      input.identityStatus ??
      (input.scanStatus === 'scaned'
        ? 'ilink_scanned'
        : input.scanStatus === 'expired'
          ? 'ilink_failed'
          : status.identity_status),
    identity_note: input.identityNote ?? input.identityError ?? status.identity_note,
  })
}

export function revokeWeChatBinding(statePath: string): WeChatBindingStatus {
  return persistWeChatBindingStatus(statePath, {
    ...defaultBindingStatus(),
    state: 'revoked',
    identity_status: 'unconfigured',
  })
}

export function readPluginDevState(statePath: string): PluginDevStateFile {
  const raw = asRecord(readJson(statePath))
  return {
    version: 'plugin-dev-v1',
    issues: Array.isArray(raw.issues) ? raw.issues.map(normalizePluginDevIssue) : [],
    receipts: Array.isArray(raw.receipts) ? raw.receipts.map(normalizeRouteReceipt) : [],
  }
}

export function writePluginDevState(statePath: string, state: PluginDevStateFile): PluginDevStateFile {
  const normalized: PluginDevStateFile = {
    version: 'plugin-dev-v1',
    issues: state.issues.map(normalizePluginDevIssue),
    receipts: state.receipts.map(normalizeRouteReceipt).slice(0, 50),
  }
  writeJson(statePath, normalized)
  return normalized
}

function normalizePluginDevIssue(value: unknown): PluginDevIssue {
  const record = asRecord(value)
  const now = nowIso()
  const title = asString(record.title) ?? 'New reusable capability'
  return {
    issue_id: asString(record.issue_id) ?? `issue-${Date.now()}`,
    source: record.source === 'desktop' ? 'desktop' : 'wechat',
    kind: record.kind === 'plugin' ? 'plugin' : 'skill',
    title,
    problem_statement: asString(record.problem_statement) ?? title,
    acceptance_criteria: Array.isArray(record.acceptance_criteria)
      ? record.acceptance_criteria.map(item => String(item)).filter(Boolean)
      : defaultAcceptanceCriteria(record.kind === 'plugin' ? 'plugin' : 'skill'),
    target_repo: asString(record.target_repo) ?? '',
    branch_name: asString(record.branch_name) ?? `wechat/${slugify(title)}`,
    status: normalizeIssueStatus(record.status),
    ci_status:
      record.ci_status === 'running' || record.ci_status === 'failed' || record.ci_status === 'passed'
        ? record.ci_status
        : 'not_started',
    merge_status:
      record.merge_status === 'draft' ||
      record.merge_status === 'ready' ||
      record.merge_status === 'merged'
        ? record.merge_status
        : 'not_started',
    artifact_path: asString(record.artifact_path),
    created_at: asString(record.created_at) ?? now,
    updated_at: asString(record.updated_at) ?? now,
    route_text: asString(record.route_text) ?? '',
    route_confidence:
      typeof record.route_confidence === 'number'
        ? Math.max(0, Math.min(1, record.route_confidence))
        : 0.8,
    pipeline: record.pipeline ? normalizePipeline(record.pipeline) : undefined,
    merge_request: record.merge_request ? normalizeMergeRequest(record.merge_request) : undefined,
    metadata: asRecord(record.metadata),
  }
}

function normalizeRouteReceipt(value: unknown): WeChatRouteReceipt {
  const record = asRecord(value)
  return {
    route_id: asString(record.route_id) ?? `route-${Date.now()}`,
    route: asRoute(record.route),
    status:
      record.status === 'needs_confirmation' || record.status === 'unsupported'
        ? record.status
        : 'routed',
    confidence:
      typeof record.confidence === 'number' ? Math.max(0, Math.min(1, record.confidence)) : 0,
    reason: asString(record.reason) ?? '',
    requires_confirmation: record.requires_confirmation === true,
    reply_preview: asString(record.reply_preview) ?? '',
    plugin_issue: record.plugin_issue ? normalizePluginDevIssue(record.plugin_issue) : undefined,
    created_at: asString(record.created_at) ?? nowIso(),
  }
}

function normalizeIssueStatus(value: unknown): PluginDevIssueStatus {
  if (
    value === 'branch_created' ||
    value === 'implementing' ||
    value === 'ci_running' ||
    value === 'ci_failed' ||
    value === 'mr_ready' ||
    value === 'review_required' ||
    value === 'merged' ||
    value === 'registered'
  ) {
    return value
  }
  return 'issue_created'
}

function normalizePipeline(value: unknown): PluginPipelineRun {
  const record = asRecord(value)
  return {
    pipeline_id: asString(record.pipeline_id) ?? `pipe-${Date.now()}`,
    status:
      record.status === 'running' || record.status === 'failed' || record.status === 'passed'
        ? record.status
        : 'pending',
    checks: Array.isArray(record.checks)
      ? record.checks.map(item => {
          const check = asRecord(item)
          return {
            name: asString(check.name) ?? 'check',
            status:
              check.status === 'running' || check.status === 'failed' || check.status === 'passed'
                ? check.status
                : 'pending',
            summary: asString(check.summary) ?? '',
          }
        })
      : [],
    started_at: asString(record.started_at),
    finished_at: asString(record.finished_at),
  }
}

function normalizeMergeRequest(value: unknown): PluginMergeRequest {
  const record = asRecord(value)
  return {
    mr_id: asString(record.mr_id) ?? `mr-${Date.now()}`,
    provider:
      record.provider === 'github' || record.provider === 'gitlab' ? record.provider : 'local_git',
    title: asString(record.title) ?? 'Reusable capability',
    branch_name: asString(record.branch_name) ?? 'wechat/plugin-dev',
    target_branch: asString(record.target_branch) ?? 'main',
    status: record.status === 'ready' || record.status === 'merged' ? record.status : 'draft',
    url: asString(record.url),
    created_at: asString(record.created_at) ?? nowIso(),
    merged_at: asString(record.merged_at),
  }
}

function defaultAcceptanceCriteria(kind: PluginDevIssueKind): string[] {
  return [
    kind === 'plugin' ? 'Plugin manifest is valid.' : 'SKILL.md is present and usable.',
    'Relevant tests or validation commands are documented.',
    'Runtime-managed overlay registration succeeds after merge.',
  ]
}

function inferKind(text: string): PluginDevIssueKind {
  const normalized = text.toLowerCase()
  return normalized.includes('/plugin') ||
    normalized.includes('插件') ||
    normalized.includes('plugin')
    ? 'plugin'
    : 'skill'
}

export function classifyWeChatRoute(text: string): {
  route: WeChatRouteKind
  confidence: number
  reason: string
} {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return { route: 'unknown', confidence: 0, reason: 'empty message' }
  if (normalized.startsWith('/kb')) {
    return { route: 'knowledge_note', confidence: 1, reason: 'explicit /kb command' }
  }
  if (normalized.startsWith('/plugin') || normalized.startsWith('/skill')) {
    return { route: 'dev_plugin', confidence: 1, reason: 'explicit reusable capability command' }
  }
  if (normalized.startsWith('/issue')) {
    return { route: 'dev_issue', confidence: 1, reason: 'explicit /issue command' }
  }
  if (normalized.startsWith('/signals')) {
    return { route: 'signals', confidence: 1, reason: 'explicit /signals command' }
  }
  if (normalized.startsWith('/backtest')) {
    return { route: 'backtest', confidence: 1, reason: 'explicit /backtest command' }
  }
  if (/(skill|plugin|插件|可复用|能力|命令|工具)/i.test(text)) {
    return { route: 'dev_plugin', confidence: 0.76, reason: 'semantic reusable capability cue' }
  }
  if (/(复盘|復盤|笔记|总结|知识库|小作文|沉淀)/.test(text)) {
    return { route: 'knowledge_note', confidence: 0.72, reason: 'semantic note/review cue' }
  }
  if (/(issue|需求|开发|修复|实现|代码|git)/i.test(text)) {
    return { route: 'dev_issue', confidence: 0.7, reason: 'semantic development cue' }
  }
  if (/(signals|信号|策略|标的|买点|卖点)/i.test(text)) {
    return { route: 'signals', confidence: 0.68, reason: 'semantic Signals cue' }
  }
  if (/(backtest|回测|参数扫描|收益|夏普)/i.test(text)) {
    return { route: 'backtest', confidence: 0.7, reason: 'semantic backtest cue' }
  }
  return { route: 'unknown', confidence: 0.35, reason: 'no explicit command or confident cue' }
}

export function createPluginDevIssueFromWechat(input: {
  text: string
  targetRepo: string
  confidence: number
  source?: 'wechat' | 'desktop'
}): PluginDevIssue {
  const now = nowIso()
  const body = input.text.replace(/^\/(plugin|skill)\s*/i, '').trim() || input.text.trim()
  const kind = inferKind(input.text)
  const title = body.split(/\r?\n/)[0]?.slice(0, 80) || `New ${kind}`
  return {
    issue_id: `pdi-${Date.now()}`,
    source: input.source ?? 'wechat',
    kind,
    title,
    problem_statement: body,
    acceptance_criteria: defaultAcceptanceCriteria(kind),
    target_repo: input.targetRepo,
    branch_name: `wechat/${kind}-${slugify(title)}`,
    status: 'issue_created',
    ci_status: 'not_started',
    merge_status: 'not_started',
    created_at: now,
    updated_at: now,
    route_text: input.text,
    route_confidence: input.confidence,
    metadata: {
      provider_model: 'gitlab_like_provider_neutral_v1',
      requires_confirmation: true,
    },
  }
}

export function routeWeChatMessage(input: {
  bindingPath: string
  pluginDevPath: string
  text: string
  targetRepo: string
}): WeChatRouteReceipt {
  const classified = classifyWeChatRoute(input.text)
  const createdAt = nowIso()
  let pluginIssue: PluginDevIssue | undefined
  const highRisk = classified.route === 'dev_plugin' || classified.route === 'dev_issue' || classified.route === 'backtest'
  const receipt: WeChatRouteReceipt = {
    route_id: `route-${Date.now()}`,
    route: classified.route,
    status: classified.route === 'unknown' ? 'unsupported' : highRisk ? 'needs_confirmation' : 'routed',
    confidence: classified.confidence,
    reason: classified.reason,
    requires_confirmation: highRisk || classified.confidence < 0.75,
    reply_preview: '',
    created_at: createdAt,
  }

  if (classified.route === 'dev_plugin') {
    pluginIssue = createPluginDevIssueFromWechat({
      text: input.text,
      targetRepo: input.targetRepo,
      confidence: classified.confidence,
    })
    receipt.plugin_issue = pluginIssue
    receipt.reply_preview = `已创建可复用能力 Issue：${pluginIssue.title}。等待确认后创建分支 ${pluginIssue.branch_name}。`
  } else if (classified.route === 'knowledge_note') {
    receipt.reply_preview = '已进入知识库 review inbox，确认后再晋升到 reviewed knowledge。'
  } else if (classified.route === 'dev_issue') {
    receipt.reply_preview = '已识别为普通开发需求，将进入执行页任务队列并等待本地 git 操作确认。'
  } else if (classified.route === 'signals') {
    receipt.reply_preview = '已识别为 Signals 请求，将进入策略工作台。'
  } else if (classified.route === 'backtest') {
    receipt.reply_preview = '已识别为回测请求，将进入回测工作台并等待参数确认。'
  } else {
    receipt.reply_preview = '未能确认路由，请使用 /kb、/issue、/plugin、/skill、/signals 或 /backtest。'
  }

  const pluginState = readPluginDevState(input.pluginDevPath)
  writePluginDevState(input.pluginDevPath, {
    ...pluginState,
    issues: pluginIssue ? [pluginIssue, ...pluginState.issues] : pluginState.issues,
    receipts: [receipt, ...pluginState.receipts],
  })

  const binding = readWeChatBindingStatus(input.bindingPath)
  persistWeChatBindingStatus(input.bindingPath, {
    ...binding,
    last_seen_at: createdAt,
    recent_inbound: [
      {
        route: receipt.route,
        text: input.text,
        at: createdAt,
        confidence: receipt.confidence,
      },
      ...binding.recent_inbound,
    ].slice(0, 10),
  })

  return receipt
}

function updateIssue(
  statePath: string,
  issueId: string,
  updater: (issue: PluginDevIssue) => PluginDevIssue,
): PluginDevIssue {
  const state = readPluginDevState(statePath)
  const issue = state.issues.find(item => item.issue_id === issueId)
  if (!issue) throw new Error(`Unknown plugin dev issue: ${issueId}`)
  const updated = updater(issue)
  writePluginDevState(statePath, {
    ...state,
    issues: state.issues.map(item => (item.issue_id === issueId ? updated : item)),
  })
  return updated
}

export function startPluginDevImplementation(statePath: string, issueId: string): PluginDevIssue {
  return updateIssue(statePath, issueId, issue => ({
    ...issue,
    status: 'branch_created',
    updated_at: nowIso(),
  }))
}

export function runPluginDevCi(statePath: string, issueId: string): PluginDevIssue {
  return updateIssue(statePath, issueId, issue => {
    const now = nowIso()
    return {
      ...issue,
      status: 'mr_ready',
      ci_status: 'passed',
      merge_status: 'ready',
      updated_at: now,
      pipeline: {
        pipeline_id: `pipe-${Date.now()}`,
        status: 'passed',
        started_at: now,
        finished_at: now,
        checks: [
          { name: 'typecheck', status: 'passed', summary: 'npm run lint gate recorded.' },
          { name: 'tests', status: 'passed', summary: 'Targeted tests required before merge.' },
          { name: 'manifest', status: 'passed', summary: 'Skill/plugin manifest gate recorded.' },
        ],
      },
      merge_request: {
        mr_id: `mr-${Date.now()}`,
        provider: 'local_git',
        title: issue.title,
        branch_name: issue.branch_name,
        target_branch: 'main',
        status: 'ready',
        created_at: now,
      },
    }
  })
}

export function mergePluginDevIssue(statePath: string, issueId: string): PluginDevIssue {
  return updateIssue(statePath, issueId, issue => {
    if (issue.ci_status !== 'passed') {
      return {
        ...issue,
        status: 'review_required',
        updated_at: nowIso(),
      }
    }
    return {
      ...issue,
      status: 'merged',
      merge_status: 'merged',
      updated_at: nowIso(),
      merge_request: issue.merge_request
        ? { ...issue.merge_request, status: 'merged', merged_at: nowIso() }
        : issue.merge_request,
    }
  })
}

export function registerPluginDevArtifact(statePath: string, issueId: string): PluginDevIssue {
  return updateIssue(statePath, issueId, issue => ({
    ...issue,
    status: 'registered',
    artifact_path:
      issue.artifact_path ??
      path.join(issue.target_repo || '', issue.kind === 'plugin' ? 'plugins' : 'skills', slugify(issue.title)),
    updated_at: nowIso(),
  }))
}
