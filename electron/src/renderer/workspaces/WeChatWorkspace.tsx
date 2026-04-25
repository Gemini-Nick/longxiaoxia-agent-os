import { toDataURL as qrToDataURL } from 'qrcode'
import React, { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'

import type {
  LongclawRun,
  LongclawTask,
  LongclawWorkItem,
} from '../../../../src/services/longclawControlPlane/models.js'
import type {
  PluginDevIssue,
  WeChatBindingStatus,
  WeChatRouteReceipt,
} from '../../runtime/wechatPluginDev.js'
import {
  fontStacks,
  statusBadgeStyle,
  tradingDeskTheme,
  utilityStyles,
} from '../designSystem.js'
import type { ViewportTier } from '../layout.js'
import { type LongclawLocale, humanizeTokenLocale, localizeSystemText, t } from '../i18n.js'

export type WeclawSessionVisibilityFilter = 'active' | 'hidden' | 'archived'
export type WeclawSessionSourceFilter = 'all' | 'wechat' | 'weclaw'

export type WeclawSessionAttachment = {
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

export type WeclawSessionMessage = {
  messageId: string
  role: string
  kind?: string
  text?: string
  agentName?: string
  createdAt?: string
  attachments: WeclawSessionAttachment[]
  metadata: Record<string, unknown>
}

export type WeclawSessionSummary = {
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

export type WeclawSessionDetail = WeclawSessionSummary & {
  messages: WeclawSessionMessage[]
  media: WeclawSessionAttachment[]
}

export type WeclawSessionSourceStatus = {
  workspaceRoot: string | null
  workspaceSource: 'config' | 'env' | 'default' | 'unresolved'
  sessionsDir: string | null
  sessionsDirExists: boolean
  sessionCount: number
}

export type WeChatArtifactPreview = {
  uri: string
  text: string
}

export type WeChatWorkspaceProps = {
  locale: LongclawLocale
  viewportTier: ViewportTier
  sessions: WeclawSessionSummary[]
  sourceStatus: WeclawSessionSourceStatus | null
  bindingStatus: WeChatBindingStatus | null
  routeReceipts: WeChatRouteReceipt[]
  pluginDevIssues: PluginDevIssue[]
  search: string
  sourceFilter: WeclawSessionSourceFilter
  visibilityFilter: WeclawSessionVisibilityFilter
  selectedSessionId: string | null
  selectedSession: WeclawSessionDetail | null
  linkedTasks: LongclawTask[]
  linkedRuns: LongclawRun[]
  linkedWorkItems: LongclawWorkItem[]
  canonicalJumpContext?: {
    canonicalSessionId?: string
    canonicalUserId?: string
    contextToken?: string
  } | null
  selectionError?: string | null
  loadingSession?: boolean
  preview?: WeChatArtifactPreview | null
  onSearchChange: (value: string) => void
  onSourceFilterChange: (filter: WeclawSessionSourceFilter) => void
  onVisibilityFilterChange: (filter: WeclawSessionVisibilityFilter) => void
  onSelectSession: (session: WeclawSessionSummary) => void
  onClearSelection: () => void
  onToggleHidden: (
    session: Pick<WeclawSessionSummary, 'canonicalSessionId' | 'sessionId' | 'hidden' | 'archived'>,
  ) => void | Promise<void>
  onToggleArchived: (
    session: Pick<WeclawSessionSummary, 'canonicalSessionId' | 'sessionId' | 'hidden' | 'archived'>,
  ) => void | Promise<void>
  onOpenLinkedTask: (task: LongclawTask) => void | Promise<void>
  onOpenLinkedRun: (run: LongclawRun) => void | Promise<void>
  onOpenLinkedWorkItem: (workItem: LongclawWorkItem) => void | Promise<void>
  onOpenAttachment: (uri: string) => void | Promise<void>
  onCreateBindingSession: () => void | Promise<void>
  onCreateLocalBindingSession: () => void | Promise<void>
  onCompleteBindingSession: () => void | Promise<void>
  onRevokeBinding: () => void | Promise<void>
  onRouteMessage: (text: string) => Promise<WeChatRouteReceipt | null>
  onOpenPluginIssue: (issue: PluginDevIssue) => void | Promise<void>
}

function formatTime(value?: string | null): string {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatModeMeta(parts: Array<string | undefined>): string | undefined {
  const values = parts.filter((part): part is string => Boolean(part && part.trim()))
  return values.length > 0 ? values.join(' · ') : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
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

function attachmentUri(attachment: WeclawSessionAttachment): string | undefined {
  return attachment.path ?? attachment.url ?? attachment.text
}

function emptyStateMessage(
  locale: LongclawLocale,
  status: WeclawSessionSourceStatus | null,
): string {
  if (!status?.sessionsDirExists) return t(locale, 'empty.weclaw_sessions_dir_missing')
  if (status.sessionCount === 0) return t(locale, 'empty.weclaw_sessions_dir_empty')
  return t(locale, 'empty.no_weclaw_sessions')
}

function sessionTone(
  session: Pick<WeclawSessionSummary, 'hidden' | 'archived'>,
): 'open' | 'degraded' | 'info' {
  if (session.archived) return 'info'
  if (session.hidden) return 'degraded'
  return 'open'
}

function sessionStateLabel(
  locale: LongclawLocale,
  session: Pick<WeclawSessionSummary, 'hidden' | 'archived'>,
): string {
  if (session.archived) return locale === 'zh-CN' ? '已归档' : 'Archived'
  if (session.hidden) return locale === 'zh-CN' ? '已隐藏' : 'Hidden'
  return t(locale, 'state.readonly')
}

function sessionVariantLabel(locale: LongclawLocale, count: number): string {
  return locale === 'zh-CN' ? `${count} 个变体` : `${count} variants`
}

function selectionPlaceholder(locale: LongclawLocale): string {
  return locale === 'zh-CN'
    ? '选择一条入站记录。'
    : 'Select an inbound record.'
}

function sessionLoadingLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN' ? '正在加载会话详情…' : 'Loading session details…'
}

function sessionUnavailableLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN'
    ? '未找到可用的会话详情。'
    : 'Session details are unavailable for the current selection.'
}

function compactInlineText(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`
}

function sessionSourceLabel(locale: LongclawLocale, sourceLabel: string): string {
  if (locale !== 'zh-CN') return sourceLabel
  const normalized = sourceLabel.toLowerCase()
  if (normalized.includes('wechat')) return '微信会话'
  if (normalized.includes('weclaw')) return '接力会话'
  return localizeSystemText(locale, sourceLabel)
}

function inspectTaskLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN' ? '查看任务' : 'Inspect task'
}

function inspectRunLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN' ? '查看运行' : 'Inspect run'
}

function inspectWorkItemLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN' ? '查看待办' : 'Inspect work item'
}

function hideSessionLabel(locale: LongclawLocale, hidden: boolean): string {
  if (hidden) return locale === 'zh-CN' ? '取消隐藏' : 'Unhide'
  return locale === 'zh-CN' ? '隐藏会话' : 'Hide session'
}

function archiveSessionLabel(locale: LongclawLocale, archived: boolean): string {
  if (archived) return locale === 'zh-CN' ? '取消归档' : 'Restore'
  return locale === 'zh-CN' ? '归档会话' : 'Archive session'
}

function WeChatSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section style={wechatSectionStyle}>
      <div style={wechatSectionHeaderStyle}>
        <div style={wechatSectionTitleBlockStyle}>
          <h2 style={wechatSectionTitleStyle}>{title}</h2>
          {subtitle && <div style={wechatMutedTextStyle}>{subtitle}</div>}
        </div>
      </div>
      {children}
    </section>
  )
}

function SearchToolbar({
  locale,
  search,
  sourceFilter,
  visibilityFilter,
  resultCount,
  onSearchChange,
  onSourceFilterChange,
  onVisibilityFilterChange,
}: {
  locale: LongclawLocale
  search: string
  sourceFilter: WeclawSessionSourceFilter
  visibilityFilter: WeclawSessionVisibilityFilter
  resultCount: number
  onSearchChange: (value: string) => void
  onSourceFilterChange: (filter: WeclawSessionSourceFilter) => void
  onVisibilityFilterChange: (filter: WeclawSessionVisibilityFilter) => void
}) {
  return (
    <div style={toolbarShellStyle}>
      <div style={toolbarHeaderStyle}>
        <div style={wechatEyebrowStyle}>
          {locale === 'zh-CN' ? '入站记录' : 'Inbound records'}
        </div>
        <span style={statusBadgeStyle(resultCount > 0 ? 'open' : 'degraded')}>
          {resultCount}
        </span>
      </div>
      <input
        value={search}
        placeholder={
          locale === 'zh-CN'
            ? '搜索标题 / 用户 / 内容'
            : 'Search title / user / content'
        }
        style={toolbarInputStyle}
        onChange={event => onSearchChange(event.target.value)}
      />
      <div style={toolbarGroupStyle}>
        <button
          type="button"
          style={wechatButtonStyle(sourceFilter === 'all')}
          onClick={() => onSourceFilterChange('all')}
        >
          {locale === 'zh-CN' ? '全部来源' : 'All'}
        </button>
        <button
          type="button"
          style={wechatButtonStyle(sourceFilter === 'wechat')}
          onClick={() => onSourceFilterChange('wechat')}
        >
          {locale === 'zh-CN' ? '微信' : 'WeChat'}
        </button>
        <button
          type="button"
          style={wechatButtonStyle(sourceFilter === 'weclaw')}
          onClick={() => onSourceFilterChange('weclaw')}
        >
          {locale === 'zh-CN' ? '接力' : 'WeClaw'}
        </button>
      </div>
      <div style={toolbarGroupStyle}>
        <button
          type="button"
          style={wechatButtonStyle(visibilityFilter === 'active')}
          onClick={() => onVisibilityFilterChange('active')}
        >
          {locale === 'zh-CN' ? '活跃' : 'Active'}
        </button>
        <button
          type="button"
          style={wechatButtonStyle(visibilityFilter === 'hidden')}
          onClick={() => onVisibilityFilterChange('hidden')}
        >
          {locale === 'zh-CN' ? '已隐藏' : 'Hidden'}
        </button>
        <button
          type="button"
          style={wechatButtonStyle(visibilityFilter === 'archived')}
          onClick={() => onVisibilityFilterChange('archived')}
        >
          {locale === 'zh-CN' ? '已归档' : 'Archived'}
        </button>
      </div>
    </div>
  )
}

function routeLabel(locale: LongclawLocale, route: string): string {
  const zh: Record<string, string> = {
    knowledge_note: '知识库',
    dev_issue: '开发需求',
    dev_plugin: '插件/技能',
    signals: '策略',
    backtest: '回测',
    unknown: '未知',
  }
  if (locale === 'zh-CN') return zh[route] ?? humanizeTokenLocale(locale, route)
  return humanizeTokenLocale(locale, route)
}

function identityLabel(locale: LongclawLocale, status?: string): string {
  const zh: Record<string, string> = {
    unconfigured: '未认证',
    local_runtime_bound: '本机测试已绑定',
    ilink_pending: '等待扫码',
    ilink_scanned: '手机已扫码',
    ilink_verified: '已认证',
    ilink_failed: '认证失败',
  }
  if (locale === 'zh-CN') return zh[status ?? 'unconfigured'] ?? humanizeTokenLocale(locale, status)
  return humanizeTokenLocale(locale, status)
}

function bindingStateLabel(locale: LongclawLocale, state?: string): string {
  const zh: Record<string, string> = {
    unbound: '未绑定',
    qr_pending: '扫码中',
    bound: '已绑定',
    expired: '已过期',
  }
  if (locale === 'zh-CN') return zh[state ?? 'unbound'] ?? humanizeTokenLocale(locale, state)
  return humanizeTokenLocale(locale, state)
}

function scanStatusLabel(locale: LongclawLocale, status?: string): string {
  const zh: Record<string, string> = {
    wait: '等待扫码',
    scaned: '已扫码，待确认',
    confirmed: '已确认',
    expired: '已过期',
  }
  if (locale === 'zh-CN') return zh[status ?? 'wait'] ?? humanizeTokenLocale(locale, status)
  return humanizeTokenLocale(locale, status ?? 'wait')
}

function bindingRuntimeHint(locale: LongclawLocale, status: WeChatBindingStatus): string {
  if (status.state === 'bound') {
    return locale === 'zh-CN'
      ? '绑定已完成，微信入口可用。'
      : 'Runtime is written and the WeChat entry is ready.'
  }
  if (status.state === 'expired' || status.scan_status === 'expired') {
    return locale === 'zh-CN'
      ? '二维码已过期，重新生成后再扫码。'
      : 'The QR code has expired. Generate a new one and scan again.'
  }
  if (status.identity_status === 'ilink_failed') {
    return locale === 'zh-CN'
      ? '认证失败，请重新生成二维码。'
      : 'Auth failed. Generate a new QR code.'
  }
  if (status.scan_status === 'scaned') {
    return locale === 'zh-CN'
      ? '手机已扫码，请在微信里确认授权。'
      : 'The phone scanned the QR. Confirm authorization in WeChat.'
  }
  if (status.state === 'qr_pending') {
    return locale === 'zh-CN'
      ? '打开微信扫一扫，在二维码有效期内完成确认。'
      : 'Open WeChat Scan and confirm before the QR expires.'
  }
  return locale === 'zh-CN'
    ? '点击开始扫码绑定，生成微信授权二维码。'
    : 'Start QR binding to create a WeChat authorization QR.'
}

function formatRemainingTime(locale: LongclawLocale, seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const minutes = Math.floor(safeSeconds / 60)
  const rest = safeSeconds % 60
  if (locale === 'zh-CN') return `${minutes}:${String(rest).padStart(2, '0')} 后过期`
  return `Expires in ${minutes}:${String(rest).padStart(2, '0')}`
}

function identityTone(status?: string): 'open' | 'running' | 'degraded' | 'info' {
  if (status === 'ilink_verified') return 'open'
  if (status === 'ilink_pending' || status === 'ilink_scanned') return 'running'
  if (status === 'ilink_failed') return 'degraded'
  return 'info'
}

function bindingStepTone(
  status: WeChatBindingStatus,
  step: 'qr' | 'scan' | 'runtime' | 'identity',
): 'open' | 'running' | 'degraded' | 'info' {
  if (status.state === 'expired' || status.identity_status === 'ilink_failed') return 'degraded'
  if (step === 'qr') return status.qr_url || status.state === 'bound' ? 'open' : 'info'
  if (step === 'scan') {
    if (status.state === 'bound' || status.scan_status === 'scaned' || status.scan_status === 'confirmed') {
      return 'open'
    }
    return status.state === 'qr_pending' ? 'running' : 'info'
  }
  if (step === 'runtime') return status.state === 'bound' ? 'open' : status.state === 'qr_pending' ? 'running' : 'info'
  return status.identity_status === 'ilink_verified'
    ? 'open'
    : status.identity_status === 'local_runtime_bound'
      ? 'info'
      : status.state === 'qr_pending'
        ? 'running'
        : 'degraded'
}

function WeChatBindingPanel({
  locale,
  bindingStatus,
  onCreateBindingSession,
  onCompleteBindingSession,
  onRevokeBinding,
}: {
  locale: LongclawLocale
  bindingStatus: WeChatBindingStatus | null
  onCreateBindingSession: () => void | Promise<void>
  onCompleteBindingSession: () => void | Promise<void>
  onRevokeBinding: () => void | Promise<void>
}) {
  const status = bindingStatus ?? {
    state: 'unbound',
    provider: 'ilink_service_account',
    identity_status: 'unconfigured',
    allowed_routes: [],
    recent_inbound: [],
  }
  const bound = status.state === 'bound'
  const pending = status.state === 'qr_pending'
  const ilinkMode = status.provider === 'ilink_service_account'
  const [clock, setClock] = useState(() => Date.now())
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [qrError, setQrError] = useState('')

  useEffect(() => {
    if (!pending) return undefined
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [pending])

  const expiresAtMs = status.expires_at ? new Date(status.expires_at).getTime() : Number.NaN
  const secondsRemaining =
    pending && Number.isFinite(expiresAtMs)
      ? Math.max(0, Math.ceil((expiresAtMs - clock) / 1000))
      : null
  const primaryActionLabel = pending
    ? locale === 'zh-CN'
      ? '刷新二维码'
      : 'Refresh QR'
    : bound
      ? locale === 'zh-CN'
        ? '重新验证'
        : 'Scan again'
      : status.state === 'expired'
        ? locale === 'zh-CN'
          ? '重新生成二维码'
          : 'Generate new QR'
        : locale === 'zh-CN'
          ? '扫码绑定'
          : 'Start QR binding'

  useEffect(() => {
    let cancelled = false
    if (!pending || !status.qr_url) {
      setQrDataUrl('')
      setQrError('')
      return () => {
        cancelled = true
      }
    }
    qrToDataURL(status.qr_url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 196,
      color: {
        dark: tradingDeskTheme.colors.control,
        light: tradingDeskTheme.colors.white,
      },
    })
      .then(value => {
        if (!cancelled) {
          setQrDataUrl(value)
          setQrError('')
        }
      })
      .catch(error => {
        if (!cancelled) {
          setQrDataUrl('')
          setQrError(error instanceof Error ? error.message : String(error))
        }
      })
    return () => {
      cancelled = true
    }
  }, [pending, status.qr_url])

  return (
    <WeChatSection
      title={locale === 'zh-CN' ? '绑定' : 'Binding'}
    >
      <div style={utilityStyles.stackedList}>
        <div style={wechatRowStyle}>
          <div style={queueLeadStyle}>
            <div style={queueTitleStyle}>
              {bound
                ? locale === 'zh-CN'
                  ? '已绑定'
                  : 'Bound WeChat user'
                : pending
                  ? locale === 'zh-CN'
                    ? '等待扫码'
                    : 'Waiting for scan'
                  : locale === 'zh-CN'
                    ? '未绑定'
                    : 'Unbound'}
            </div>
            <div style={wechatMutedTextStyle}>
              {formatModeMeta([
                identityLabel(locale, status.identity_status),
                bound
                  ? locale === 'zh-CN'
                    ? '可用'
                    : 'WeChat entry ready'
                  : pending
                    ? locale === 'zh-CN'
                      ? '等待确认'
                      : 'Waiting for phone confirmation'
                    : undefined,
              ])}
            </div>
          </div>
          <div style={bindingBadgeStackStyle}>
            <span style={statusBadgeStyle(bound ? 'open' : pending ? 'running' : 'degraded')}>
              {bindingStateLabel(locale, status.state)}
            </span>
          </div>
        </div>
        {pending && (
          <div style={qrPanelStyle}>
            <div style={qrImageShellStyle}>
              {qrDataUrl ? (
                <img
                  alt={locale === 'zh-CN' ? '微信绑定二维码' : 'WeChat binding QR code'}
                  src={qrDataUrl}
                  style={qrImageStyle}
                />
              ) : (
                <div style={qrPlaceholderStyle}>
                  {qrError ||
                    (locale === 'zh-CN' ? '正在生成二维码...' : 'Generating QR code...')}
                </div>
              )}
            </div>
            <div style={queueLeadStyle}>
              <div style={queueTitleStyle}>
                {ilinkMode
                  ? locale === 'zh-CN'
                    ? '扫码并在手机确认授权'
                    : 'Scan and confirm authorization'
                  : locale === 'zh-CN'
                    ? '扫码绑定本机 Agent OS'
                    : 'Scan to bind this Agent OS'}
              </div>
              <div style={queueDescriptionStyle}>
                {ilinkMode
                  ? locale === 'zh-CN'
                    ? '二维码约 2 分钟有效。扫码并确认后，微信入口会变为可用。'
                    : 'The QR expires in about 2 minutes. Scan and confirm to enable the WeChat entry.'
                  : locale === 'zh-CN'
                    ? '二维码 10 分钟有效。手机需与本机在同一局域网；用于验证本机扫码链路。'
                    : 'QR code expires in 10 minutes. The phone must be on the same LAN; this verifies the local scan path.'}
              </div>
              {secondsRemaining !== null && (
                <div style={qrCountdownStyle}>
                  {formatRemainingTime(locale, secondsRemaining)}
                </div>
              )}
            </div>
          </div>
        )}
        <div style={utilityStyles.buttonCluster}>
          <button
            type="button"
            style={wechatButtonStyle()}
            onClick={() => {
              void onCreateBindingSession()
            }}
          >
            {primaryActionLabel}
          </button>
          {pending && !ilinkMode && (
            <button
              type="button"
              style={wechatButtonStyle()}
              onClick={() => {
                void onCompleteBindingSession()
              }}
            >
              {locale === 'zh-CN' ? '完成本机测试' : 'Complete local test'}
            </button>
          )}
          {status.state !== 'unbound' && (
            <button
              type="button"
              style={wechatButtonStyle()}
              onClick={() => {
                void onRevokeBinding()
              }}
            >
              {locale === 'zh-CN' ? '解除绑定' : 'Revoke binding'}
            </button>
          )}
          <span style={statusBadgeStyle('info')}>
            {locale === 'zh-CN'
              ? `${status.allowed_routes.length} 入口`
              : `${status.allowed_routes.length} routes`}
          </span>
        </div>
      </div>
    </WeChatSection>
  )
}

function RouteMapPanel({ locale }: { locale: LongclawLocale }) {
  const rows = [
    {
      command: '/kb',
      target: locale === 'zh-CN' ? '知识库审核' : 'Knowledge review',
      note: locale === 'zh-CN' ? '小作文、复盘笔记先人工审核再晋升。' : 'Long notes and retros go through review before promotion.',
      tone: 'info',
    },
    {
      command: '/issue',
      target: locale === 'zh-CN' ? '执行页任务' : 'Execution task',
      note: locale === 'zh-CN' ? '普通开发需求，涉及 git/自动开发前必须确认。' : 'General dev work; git and automation require confirmation.',
      tone: 'running',
    },
    {
      command: '/plugin /skill',
      target: locale === 'zh-CN' ? '插件流水线' : 'Plugin pipeline',
      note: locale === 'zh-CN' ? '可复用能力进入 issue、分支、CI、合并、注册。' : 'Reusable capability issue, branch, CI, merge, and registration.',
      tone: 'open',
    },
    {
      command: '/signals',
      target: 'Signals',
      note: locale === 'zh-CN' ? '进入策略工作台，不混入知识库。' : 'Routes to the strategy workbench.',
      tone: 'info',
    },
    {
      command: '/backtest',
      target: locale === 'zh-CN' ? '回测工作台' : 'Backtest workbench',
      note: locale === 'zh-CN' ? '执行回测前确认标的、周期、参数和风险。' : 'Requires symbol, period, parameters, and risk confirmation.',
      tone: 'degraded',
    },
  ] as const

  return (
    <WeChatSection
      title={locale === 'zh-CN' ? '功能映射' : 'Command map'}
      subtitle={
        locale === 'zh-CN'
          ? '微信只做移动入口，左侧工作台承接实际处理面。'
          : 'WeChat is the mobile entry; the left workspaces own execution.'
      }
    >
      <div style={routeMapGridStyle}>
        {rows.map(row => (
          <div key={row.command} style={routeMapItemStyle}>
            <div style={routeMapHeaderStyle}>
              <span style={wechatMonoTextStyle}>{row.command}</span>
              <span style={statusBadgeStyle(row.tone)}>{row.target}</span>
            </div>
            <div style={queueDescriptionStyle}>{row.note}</div>
          </div>
        ))}
      </div>
    </WeChatSection>
  )
}

function RouteComposer({
  locale,
  routeReceipts,
  pluginDevIssues,
  onRouteMessage,
  onOpenPluginIssue,
}: {
  locale: LongclawLocale
  routeReceipts: WeChatRouteReceipt[]
  pluginDevIssues: PluginDevIssue[]
  onRouteMessage: (text: string) => Promise<WeChatRouteReceipt | null>
  onOpenPluginIssue: (issue: PluginDevIssue) => void | Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [localReceipt, setLocalReceipt] = useState<WeChatRouteReceipt | null>(null)

  async function submit() {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    const receipt = await onRouteMessage(text)
    setLocalReceipt(receipt)
    setBusy(false)
    if (receipt) setDraft('')
  }

  const latestReceipts = Array.from(
    new Map(
      [localReceipt, ...routeReceipts]
        .filter((receipt): receipt is WeChatRouteReceipt => Boolean(receipt))
        .map(receipt => [receipt.route_id, receipt]),
    ).values(),
  ).slice(0, 1)

  return (
    <WeChatSection
      title={locale === 'zh-CN' ? '移动指令台' : 'Mobile command desk'}
      subtitle={
        locale === 'zh-CN'
          ? '选择路由，发送。'
          : 'Route WeChat messages to the right workspace.'
      }
    >
      <div style={routeGridStyle}>
        {[
          ['/kb', locale === 'zh-CN' ? '知识' : 'Knowledge'],
          ['/issue', locale === 'zh-CN' ? '任务' : 'Task'],
          ['/plugin', locale === 'zh-CN' ? '插件' : 'Plugin'],
          ['/skill', locale === 'zh-CN' ? '技能' : 'Skill'],
          ['/signals', locale === 'zh-CN' ? '策略' : 'Strategy'],
          ['/backtest', locale === 'zh-CN' ? '回测' : 'Backtest'],
        ].map(([command, label]) => (
          <button
            key={command}
            type="button"
            style={wechatButtonStyle()}
            onClick={() => setDraft(`${command} `)}
          >
            {command} {label}
          </button>
        ))}
      </div>
      <textarea
        value={draft}
        rows={3}
        style={routeTextareaStyle}
        placeholder={
          locale === 'zh-CN'
            ? '例：/plugin 把微信复盘整理成知识卡片…'
            : '/plugin Create a reusable skill from a WeChat request'
        }
        onChange={event => setDraft(event.target.value)}
      />
      <div style={utilityStyles.buttonCluster}>
        <button
          type="button"
          style={wechatButtonStyle(false, busy || !draft.trim())}
          disabled={busy || !draft.trim()}
          onClick={() => {
            void submit()
          }}
        >
          {busy
            ? locale === 'zh-CN'
              ? '路由中…'
              : 'Routing…'
            : locale === 'zh-CN'
              ? '发送到路由'
              : 'Route inbound message'}
        </button>
      </div>
      {latestReceipts.length > 0 && (
        <div style={utilityStyles.stackedList}>
          {latestReceipts.map(receipt => (
            <div key={receipt.route_id} style={wechatRowStyle}>
              <div style={queueLeadStyle}>
                <div style={queueTitleStyle}>{routeLabel(locale, receipt.route)}</div>
                <div style={wechatMutedTextStyle}>
                  {formatModeMeta([
                    `${Math.round(receipt.confidence * 100)}%`,
                    receipt.requires_confirmation
                      ? locale === 'zh-CN'
                        ? '需要确认'
                        : 'confirmation required'
                      : undefined,
                  ])}
                </div>
                <div style={queueDescriptionStyle}>{localizeSystemText(locale, receipt.reply_preview)}</div>
              </div>
              <span
                style={statusBadgeStyle(
                  receipt.status === 'unsupported'
                    ? 'degraded'
                    : receipt.status === 'needs_confirmation'
                      ? 'warning'
                      : 'open',
                )}
              >
                {humanizeTokenLocale(locale, receipt.status)}
              </span>
            </div>
          ))}
        </div>
      )}
      {pluginDevIssues.length > 0 && (
        <div style={utilityStyles.stackedList}>
          {pluginDevIssues.slice(0, 3).map(issue => (
            <button
              key={issue.issue_id}
              type="button"
              style={wechatInteractiveRowStyle}
              onClick={() => {
                void onOpenPluginIssue(issue)
              }}
            >
              <div style={queueLeadStyle}>
                <div style={queueTitleStyle}>{issue.title}</div>
                <div style={wechatMutedTextStyle}>
                  {formatModeMeta([
                    humanizeTokenLocale(locale, issue.kind),
                    issue.branch_name,
                    humanizeTokenLocale(locale, issue.status),
                  ])}
                </div>
              </div>
              <span style={statusBadgeStyle(issue.status === 'registered' ? 'open' : 'running')}>
                {routeLabel(locale, 'dev_plugin')}
              </span>
            </button>
          ))}
        </div>
      )}
    </WeChatSection>
  )
}

function WeclawAttachmentList({
  locale,
  attachments,
  onOpen,
}: {
  locale: LongclawLocale
  attachments: WeclawSessionAttachment[]
  onOpen: (uri: string) => void | Promise<void>
}) {
  if (attachments.length === 0) return null

  return (
    <div style={utilityStyles.stackedList}>
      {attachments.map(attachment => {
        const uri = attachmentUri(attachment)
        return (
          <div key={attachment.attachmentId} style={wechatRowStyle}>
            <div style={attachmentLeadStyle}>
              <div style={attachmentTitleStyle}>{attachment.title}</div>
              <div style={wechatMutedTextStyle}>
                {formatModeMeta([
                  humanizeTokenLocale(locale, attachment.kind),
                  attachment.mimeType,
                  attachment.origin === 'message'
                    ? locale === 'zh-CN'
                      ? '来自消息'
                      : 'From message'
                    : undefined,
                ])}
              </div>
              {uri && (
                <div style={wechatMutedTextStyle}>
                  {locale === 'zh-CN' ? '附件已就绪' : 'Attachment ready'}
                </div>
              )}
              {attachment.text && <div style={attachmentTextStyle}>{attachment.text}</div>}
            </div>
            {uri && (
              <button
                type="button"
                style={wechatButtonStyle()}
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

function WeChatLinkedRow({
  locale,
  title,
  meta,
  status,
  description,
  nextAction,
  onSelect,
}: {
  locale: LongclawLocale
  title: string
  meta?: string
  status: string
  description?: string
  nextAction: string
  onSelect: () => void
}) {
  return (
    <button type="button" style={linkedRowStyle} onClick={onSelect}>
      <div style={queueLeadStyle}>
        <div style={queueTitleStyle}>{title}</div>
        {meta && <div style={wechatMutedTextStyle}>{meta}</div>}
        {description && <div style={queueDescriptionStyle}>{description}</div>}
      </div>
      <div style={linkedRowAsideStyle}>
        <span style={statusBadgeStyle(status)}>{humanizeTokenLocale(locale, status)}</span>
        <span style={linkedRowActionStyle}>{nextAction}</span>
      </div>
    </button>
  )
}

function SessionDetail({
  locale,
  selectedSession,
  linkedTasks,
  linkedRuns,
  linkedWorkItems,
  preview,
  onClearSelection,
  onToggleHidden,
  onToggleArchived,
  onOpenLinkedTask,
  onOpenLinkedRun,
  onOpenLinkedWorkItem,
  onOpenAttachment,
}: {
  locale: LongclawLocale
  selectedSession: WeclawSessionDetail
  linkedTasks: LongclawTask[]
  linkedRuns: LongclawRun[]
  linkedWorkItems: LongclawWorkItem[]
  preview?: WeChatArtifactPreview | null
  onClearSelection: () => void
  onToggleHidden: (
    session: Pick<WeclawSessionSummary, 'canonicalSessionId' | 'sessionId' | 'hidden' | 'archived'>,
  ) => void | Promise<void>
  onToggleArchived: (
    session: Pick<WeclawSessionSummary, 'canonicalSessionId' | 'sessionId' | 'hidden' | 'archived'>,
  ) => void | Promise<void>
  onOpenLinkedTask: (task: LongclawTask) => void | Promise<void>
  onOpenLinkedRun: (run: LongclawRun) => void | Promise<void>
  onOpenLinkedWorkItem: (workItem: LongclawWorkItem) => void | Promise<void>
  onOpenAttachment: (uri: string) => void | Promise<void>
}) {
  return (
    <div style={detailStackStyle}>
      <section style={detailHeroStyle}>
        <div style={detailHeroHeaderStyle}>
          <div style={detailHeroTitleBlockStyle}>
            <div style={wechatEyebrowStyle}>{t(locale, 'section.detail.weclaw_session.title')}</div>
            <h2 style={detailHeroTitleStyle}>{selectedSession.title}</h2>
            <div style={wechatMutedTextStyle}>{t(locale, 'section.detail.weclaw_session.subtitle')}</div>
          </div>
          <div style={utilityStyles.buttonCluster}>
            <button type="button" style={wechatButtonStyle()} onClick={onClearSelection}>
              {locale === 'zh-CN' ? '取消选中' : 'Clear selection'}
            </button>
            <button
              type="button"
              style={wechatButtonStyle()}
              onClick={() => {
                void onToggleHidden(selectedSession)
              }}
            >
              {hideSessionLabel(locale, selectedSession.hidden)}
            </button>
            <button
              type="button"
              style={wechatButtonStyle()}
              onClick={() => {
                void onToggleArchived(selectedSession)
              }}
            >
              {archiveSessionLabel(locale, selectedSession.archived)}
            </button>
          </div>
        </div>

        <div style={detailHeroMetaRowStyle}>
          <span style={statusBadgeStyle(sessionTone(selectedSession))}>
            {sessionStateLabel(locale, selectedSession)}
          </span>
          <span style={statusBadgeStyle('open')}>
            {sessionSourceLabel(locale, selectedSession.sourceLabel)}
          </span>
          {selectedSession.duplicateSessionIds.length > 0 && (
            <span style={statusBadgeStyle('info')}>
              {sessionVariantLabel(locale, selectedSession.duplicateSessionIds.length + 1)}
            </span>
          )}
        </div>

        <div style={detailFactsGridStyle}>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.user_id')}</div>
            <div style={detailFactValueStyle}>
              {selectedSession.userId
                ? locale === 'zh-CN'
                  ? '已识别微信用户'
                  : 'Recognized WeChat user'
                : humanizeTokenLocale(locale, 'unknown')}
            </div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.updated')}</div>
            <div style={detailFactValueStyle}>{formatTime(selectedSession.updatedAt)}</div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.message_count')}</div>
            <div style={detailFactValueStyle}>{selectedSession.messageCount}</div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.agent_reply_count')}</div>
            <div style={detailFactValueStyle}>{selectedSession.agentReplyCount}</div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.media_count')}</div>
            <div style={detailFactValueStyle}>{selectedSession.mediaCount}</div>
          </div>
        </div>
      </section>

      {(linkedTasks.length > 0 || linkedRuns.length > 0 || linkedWorkItems.length > 0) && (
        <WeChatSection
          title={t(locale, 'section.detail.weclaw_links.title')}
          subtitle={t(locale, 'section.detail.weclaw_links.subtitle')}
        >
          <div style={utilityStyles.stackedList}>
            {linkedTasks.map(task => (
              <WeChatLinkedRow
                key={task.task_id}
                locale={locale}
                title={readMetadataString(task as unknown as Record<string, unknown>, 'requested_outcome') ?? task.capability}
                meta={formatModeMeta([
                  task.work_mode ? humanizeTokenLocale(locale, task.work_mode) : undefined,
                  humanizeTokenLocale(locale, task.status),
                ])}
                status={task.status}
                nextAction={inspectTaskLabel(locale)}
                onSelect={() => {
                  void onOpenLinkedTask(task)
                }}
              />
            ))}
            {linkedRuns.map(run => (
              <WeChatLinkedRow
                key={run.run_id}
                locale={locale}
                title={run.summary || run.run_id}
                meta={formatModeMeta([
                  humanizeTokenLocale(locale, run.domain),
                  formatTime(run.created_at),
                ])}
                status={run.status}
                nextAction={inspectRunLabel(locale)}
                onSelect={() => {
                  void onOpenLinkedRun(run)
                }}
              />
            ))}
            {linkedWorkItems.map(workItem => (
              <WeChatLinkedRow
                key={workItem.work_item_id}
                locale={locale}
                title={workItem.title}
                meta={formatModeMeta([
                  humanizeTokenLocale(locale, workItem.pack_id),
                  humanizeTokenLocale(locale, workItem.kind),
                ])}
                status={workItem.severity}
                description={workItem.summary}
                nextAction={inspectWorkItemLabel(locale)}
                onSelect={() => {
                  void onOpenLinkedWorkItem(workItem)
                }}
              />
            ))}
          </div>
        </WeChatSection>
      )}

      <WeChatSection
        title={t(locale, 'section.detail.weclaw_messages.title')}
        subtitle={t(locale, 'section.detail.weclaw_messages.subtitle')}
      >
        {selectedSession.messages.length === 0 ? (
          <div style={darkEmptyStyle}>{t(locale, 'empty.no_weclaw_messages')}</div>
        ) : (
          <div style={utilityStyles.stackedList}>
            {selectedSession.messages.map(message => (
              <div key={message.messageId} style={messageCardStyle}>
                <div style={messageHeaderStyle}>
                  <span
                    style={statusBadgeStyle(
                      ['agent', 'assistant'].includes(message.role) ? 'open' : 'info',
                    )}
                  >
                    {humanizeTokenLocale(locale, message.role)}
                  </span>
                  <div style={wechatMutedTextStyle}>
                    {formatModeMeta([
                      message.agentName,
                      message.kind ? humanizeTokenLocale(locale, message.kind) : undefined,
                      message.createdAt ? formatTime(message.createdAt) : undefined,
                    ])}
                  </div>
                </div>
                {message.text && <div style={messageBodyStyle}>{message.text}</div>}
                <WeclawAttachmentList
                  locale={locale}
                  attachments={message.attachments}
                  onOpen={onOpenAttachment}
                />
              </div>
            ))}
          </div>
        )}
      </WeChatSection>

      <WeChatSection
        title={t(locale, 'section.detail.weclaw_media.title')}
        subtitle={t(locale, 'section.detail.weclaw_media.subtitle')}
      >
        {selectedSession.media.length === 0 ? (
          <div style={darkEmptyStyle}>{t(locale, 'empty.no_weclaw_media')}</div>
        ) : (
          <WeclawAttachmentList
            locale={locale}
            attachments={selectedSession.media}
            onOpen={onOpenAttachment}
          />
        )}
      </WeChatSection>

      {preview && (
        <WeChatSection
          title={t(locale, 'section.detail.preview.title')}
          subtitle={locale === 'zh-CN' ? '附件预览' : 'Attachment preview'}
        >
          <pre style={darkPreStyle}>{preview.text}</pre>
        </WeChatSection>
      )}
    </div>
  )
}

export function WeChatWorkspace({
  locale,
  viewportTier,
  sessions,
  sourceStatus,
  bindingStatus,
  routeReceipts,
  pluginDevIssues,
  search,
  sourceFilter,
  visibilityFilter,
  selectedSessionId,
  selectedSession,
  linkedTasks,
  linkedRuns,
  linkedWorkItems,
  selectionError,
  loadingSession = false,
  preview,
  onSearchChange,
  onSourceFilterChange,
  onVisibilityFilterChange,
  onSelectSession,
  onClearSelection,
  onToggleHidden,
  onToggleArchived,
  onOpenLinkedTask,
  onOpenLinkedRun,
  onOpenLinkedWorkItem,
  onOpenAttachment,
  onCreateBindingSession,
  onCompleteBindingSession,
  onRevokeBinding,
  onRouteMessage,
  onOpenPluginIssue,
}: WeChatWorkspaceProps) {
  const filteredSessions = useMemo(() => {
    const query = search.trim().toLowerCase()
    return sessions.filter(session => {
      if (visibilityFilter === 'active' && (session.hidden || session.archived)) return false
      if (visibilityFilter === 'hidden' && !session.hidden) return false
      if (visibilityFilter === 'archived' && !session.archived) return false

      const source = session.sourceLabel.toLowerCase()
      if (sourceFilter === 'wechat' && !source.includes('wechat')) return false
      if (sourceFilter === 'weclaw' && !source.includes('weclaw')) return false

      if (!query) return true
      return [
        session.title,
        session.preview,
        session.userId,
        session.sessionId,
        session.canonicalSessionId,
      ]
        .filter((value): value is string => Boolean(value))
        .some(value => value.toLowerCase().includes(query))
    })
  }, [search, sessions, sourceFilter, visibilityFilter])

  const selectedSummary =
    sessions.find(session => session.sessionId === selectedSessionId) ?? null
  const effectiveSelection = selectedSession ?? null
  const hasDetailContext = Boolean(
    selectedSessionId || effectiveSelection || selectionError || loadingSession,
  )
  const splitDetail = viewportTier === 'wide' && hasDetailContext

  let detailBody: React.ReactNode
  if (selectionError) {
    detailBody = <div style={darkErrorStyle}>{selectionError}</div>
  } else if (!selectedSessionId) {
    detailBody = <div style={darkEmptyStyle}>{selectionPlaceholder(locale)}</div>
  } else if (loadingSession && !effectiveSelection) {
    detailBody = <div style={darkNoticeStyle}>{sessionLoadingLabel(locale)}</div>
  } else if (!effectiveSelection) {
    detailBody = <div style={darkWarningStyle}>{sessionUnavailableLabel(locale)}</div>
  } else {
    detailBody = (
      <SessionDetail
        locale={locale}
        selectedSession={effectiveSelection}
        linkedTasks={linkedTasks}
        linkedRuns={linkedRuns}
        linkedWorkItems={linkedWorkItems}
        preview={preview}
        onClearSelection={onClearSelection}
        onToggleHidden={onToggleHidden}
        onToggleArchived={onToggleArchived}
        onOpenLinkedTask={onOpenLinkedTask}
        onOpenLinkedRun={onOpenLinkedRun}
        onOpenLinkedWorkItem={onOpenLinkedWorkItem}
        onOpenAttachment={onOpenAttachment}
      />
    )
  }

  return (
    <div style={workspaceRootStyle(splitDetail)}>
      <div style={listColumnStyle}>
        <WeChatBindingPanel
          locale={locale}
          bindingStatus={bindingStatus}
          onCreateBindingSession={onCreateBindingSession}
          onCompleteBindingSession={onCompleteBindingSession}
          onRevokeBinding={onRevokeBinding}
        />
        <RouteComposer
          locale={locale}
          routeReceipts={routeReceipts}
          pluginDevIssues={pluginDevIssues}
          onRouteMessage={onRouteMessage}
          onOpenPluginIssue={onOpenPluginIssue}
        />
        <div style={sourceCardStyle}>
          <div style={sourceCardLeadStyle}>
            <div style={wechatEyebrowStyle}>{locale === 'zh-CN' ? '入站' : 'Inbound'}</div>
            <div style={sourceCardPathStyle}>
              {locale === 'zh-CN' ? '最近入站' : 'Recent inbound'}
            </div>
            <div style={wechatMutedTextStyle}>
              {locale === 'zh-CN'
                ? '接续消息与附件。'
                : 'Recent inbound messages appear here. Raw data is not shown in the UI.'}
            </div>
          </div>
          <span style={statusBadgeStyle(sourceStatus?.sessionsDirExists ? 'available' : 'degraded')}>
            {sourceStatus?.sessionsDirExists
              ? locale === 'zh-CN'
                ? '已连接'
                : 'Connected'
              : humanizeTokenLocale(locale, 'unresolved')}
          </span>
        </div>

        <section style={sessionListSectionStyle}>
          <SearchToolbar
            locale={locale}
            search={search}
            sourceFilter={sourceFilter}
            visibilityFilter={visibilityFilter}
            resultCount={filteredSessions.length}
            onSearchChange={onSearchChange}
            onSourceFilterChange={onSourceFilterChange}
            onVisibilityFilterChange={onVisibilityFilterChange}
          />

          <div style={sessionListBodyStyle}>
            {filteredSessions.length === 0 ? (
              <div style={darkEmptyStyle}>{emptyStateMessage(locale, sourceStatus)}</div>
            ) : (
              filteredSessions.map(session => {
                const active = session.sessionId === selectedSessionId
                const variantCount = session.duplicateSessionIds.length + 1
                const rowTitle = compactInlineText(session.title, 42)
                const rowPreview = compactInlineText(session.preview, 88)
                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    style={sessionRowStyle(active)}
                    onClick={() => onSelectSession(session)}
                  >
                    <div style={sessionRowTopStyle}>
                      <div style={sessionTitleStyle}>{rowTitle || session.sessionId}</div>
                      <span style={statusBadgeStyle(sessionTone(session))}>
                        {sessionStateLabel(locale, session)}
                      </span>
                    </div>
                    <div style={wechatMutedTextStyle}>
                      {formatModeMeta([
                        sessionSourceLabel(locale, session.sourceLabel),
                        session.updatedAt ? formatTime(session.updatedAt) : undefined,
                        variantCount > 1 ? sessionVariantLabel(locale, variantCount) : undefined,
                      ])}
                    </div>
                    {rowPreview && <div style={sessionPreviewStyle}>{rowPreview}</div>}
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>

      {hasDetailContext && (
      <div style={detailColumnStyle(splitDetail)}>
        {!splitDetail && selectedSummary && !effectiveSelection && !selectionError && !loadingSession && (
          <div style={darkNoticeStyle}>
            {locale === 'zh-CN'
              ? `已选中 ${selectedSummary.title}，等待详情数据。`
              : `Selected ${selectedSummary.title}; waiting for detail data.`}
          </div>
        )}
        {detailBody}
      </div>
      )}
    </div>
  )
}

export default WeChatWorkspace

const wechatDark = tradingDeskTheme.colors

const wechatSectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 10,
  background: wechatDark.panel,
  color: wechatDark.text,
  border: 'none',
  borderRadius: 0,
  minWidth: 0,
}

const wechatSectionHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
}

const wechatSectionTitleBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
}

const wechatSectionTitleStyle: CSSProperties = {
  margin: 0,
  color: wechatDark.textStrong,
  fontSize: 15,
  lineHeight: 1.15,
  fontWeight: 800,
  letterSpacing: 0,
}

const wechatEyebrowStyle: CSSProperties = {
  color: wechatDark.mutedStrong,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
}

const wechatMutedTextStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 12,
  lineHeight: 1.35,
}

const wechatMonoTextStyle: CSSProperties = {
  color: wechatDark.mono,
  fontFamily: fontStacks.mono,
  fontSize: 12,
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
}

const wechatRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 5,
  border: `1px solid ${wechatDark.border}`,
  background: wechatDark.panelSoft,
  color: wechatDark.text,
  minWidth: 0,
}

const wechatInteractiveRowStyle: CSSProperties = {
  ...wechatRowStyle,
  width: '100%',
  cursor: 'pointer',
  textAlign: 'left',
  fontFamily: fontStacks.ui,
}

const linkedRowStyle: CSSProperties = {
  ...wechatInteractiveRowStyle,
  alignItems: 'center',
}

const darkPreStyle: CSSProperties = {
  margin: 0,
  padding: 10,
  borderRadius: 5,
  border: `1px solid ${wechatDark.border}`,
  background: wechatDark.root,
  color: wechatDark.mono,
  fontFamily: fontStacks.mono,
  fontSize: 12,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
  overflow: 'auto',
}

const darkEmptyStyle: CSSProperties = {
  border: `1px dashed ${wechatDark.borderMuted}`,
  borderRadius: 5,
  background: wechatDark.empty,
  color: wechatDark.muted,
  padding: '12px 10px',
  textAlign: 'center',
  fontSize: 13,
}

const darkNoticeStyle: CSSProperties = {
  border: `1px solid ${tradingDeskTheme.alpha.infoBorder}`,
  background: tradingDeskTheme.alpha.infoSurface,
  color: wechatDark.infoText,
  padding: '8px 10px',
  fontSize: 13,
  lineHeight: 1.4,
}

const darkWarningStyle: CSSProperties = {
  ...darkNoticeStyle,
  border: `1px solid ${tradingDeskTheme.alpha.accentBorder}`,
  background: tradingDeskTheme.alpha.accentSurface,
  color: wechatDark.accentText,
}

const darkErrorStyle: CSSProperties = {
  ...darkNoticeStyle,
  border: `1px solid ${tradingDeskTheme.alpha.errorBorder}`,
  background: tradingDeskTheme.alpha.errorSurface,
  color: wechatDark.errorText,
}

function wechatButtonStyle(active = false, disabled = false): CSSProperties {
  return {
    height: 28,
    border: `1px solid ${active ? wechatDark.accent : wechatDark.borderStrong}`,
    borderRadius: 5,
    background: active ? wechatDark.accentSoft : wechatDark.control,
    color: active ? wechatDark.accentText : wechatDark.controlText,
    padding: '0 9px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: fontStacks.ui,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }
}

const workspaceRootStyle = (splitDetail: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: splitDetail ? 'minmax(320px, 420px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
  gap: 1,
  alignItems: 'start',
  minHeight: 0,
  background: wechatDark.border,
  color: wechatDark.text,
  border: `1px solid ${wechatDark.border}`,
})

const listColumnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minWidth: 0,
}

const detailColumnStyle = (splitDetail: boolean): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  minWidth: 0,
  ...(splitDetail ? { alignSelf: 'stretch' } : {}),
})

const sourceCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  padding: 10,
  background: wechatDark.panel,
  border: 'none',
  borderRadius: 0,
}

const sourceCardLeadStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const sourceCardPathStyle: CSSProperties = {
  color: wechatDark.textStrong,
  fontSize: 13,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
}

const sessionListSectionStyle: CSSProperties = {
  padding: 0,
  overflow: 'hidden',
  background: wechatDark.panel,
  border: 'none',
  borderRadius: 0,
}

const toolbarShellStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 10,
  borderBottom: `1px solid ${wechatDark.border}`,
  background: wechatDark.panel,
}

const toolbarHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const toolbarInputStyle: CSSProperties = {
  borderRadius: 5,
  border: `1px solid ${wechatDark.borderStrong}`,
  background: wechatDark.root,
  padding: '8px 10px',
  color: wechatDark.textStrong,
  fontSize: 13,
  fontFamily: fontStacks.ui,
  outline: 'none',
}

const toolbarGroupStyle: CSSProperties = {
  ...utilityStyles.buttonCluster,
}

const sessionListBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 16,
}

const routeGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
  gap: 8,
}

const routeMapGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
}

const routeMapItemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10,
  borderRadius: 5,
  border: `1px solid ${wechatDark.border}`,
  background: wechatDark.panelSoft,
  minWidth: 0,
}

const routeMapHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  flexWrap: 'wrap',
}

const routeTextareaStyle: CSSProperties = {
  width: '100%',
  minHeight: 96,
  resize: 'vertical',
  borderRadius: 5,
  border: `1px solid ${wechatDark.borderStrong}`,
  background: wechatDark.root,
  color: wechatDark.textStrong,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.5,
  fontFamily: fontStacks.ui,
  boxSizing: 'border-box',
}

const qrPanelStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: 14,
  alignItems: 'center',
  padding: 12,
  borderRadius: 5,
  border: `1px solid ${wechatDark.border}`,
  background: wechatDark.panelSoft,
}

const bindingStepGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
  gap: 8,
}

const bindingStepStyle: CSSProperties = {
  minWidth: 0,
}

const bindingHintStyle: CSSProperties = {
  color: wechatDark.infoText,
  fontSize: 13,
  lineHeight: 1.45,
}

const bindingRuntimeGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 8,
}

const bindingRuntimeTileStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '8px 10px',
  borderRadius: 5,
  border: `1px solid ${wechatDark.border}`,
  background: wechatDark.empty,
}

const bindingRuntimeTileLabelStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 12,
  lineHeight: 1.35,
}

const bindingRuntimeTileValueStyle: CSSProperties = {
  color: wechatDark.textStrong,
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 700,
}

const bindingBadgeStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
}

const linkedRowAsideStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 6,
  flexShrink: 0,
}

const linkedRowActionStyle: CSSProperties = {
  color: wechatDark.accentText,
  fontSize: 12,
  fontWeight: 700,
}

const qrImageShellStyle: CSSProperties = {
  width: 208,
  minHeight: 208,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 5,
  border: `1px solid ${wechatDark.borderStrong}`,
  background: wechatDark.white,
}

const qrImageStyle: CSSProperties = {
  width: 196,
  height: 196,
  display: 'block',
}

const qrPlaceholderStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 12,
  lineHeight: 1.4,
  padding: 12,
  textAlign: 'center',
}

const qrCountdownStyle: CSSProperties = {
  color: wechatDark.accentText,
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 700,
}

const queueLeadStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
}

const queueTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1.3,
  color: wechatDark.textStrong,
}

const queueDescriptionStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 13,
  lineHeight: 1.45,
}

const sessionRowStyle = (active: boolean): CSSProperties => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '10px 12px',
  borderRadius: 5,
  border: `1px solid ${active ? wechatDark.accent : wechatDark.border}`,
  background: active ? wechatDark.accentSoft : wechatDark.panelSoft,
  color: wechatDark.text,
  textAlign: 'left',
  cursor: 'pointer',
})

const sessionRowTopStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
}

const sessionTitleStyle: CSSProperties = {
  fontSize: 15,
  lineHeight: 1.3,
  fontWeight: 600,
  color: wechatDark.textStrong,
}

const sessionPreviewStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 13,
  lineHeight: 1.45,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const detailStackStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const detailHeroStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  padding: 10,
  background: wechatDark.panel,
  border: 'none',
  borderRadius: 0,
}

const detailHeroHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
  flexWrap: 'wrap',
}

const detailHeroTitleBlockStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const detailHeroTitleStyle: CSSProperties = {
  margin: 0,
  fontFamily: fontStacks.ui,
  fontSize: 20,
  lineHeight: 1.05,
  fontWeight: 800,
  color: wechatDark.textStrong,
  letterSpacing: 0,
}

const detailHeroMetaRowStyle: CSSProperties = {
  ...utilityStyles.buttonCluster,
}

const detailFactsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
  gap: 12,
}

const detailFactStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '8px 10px',
  borderRadius: 5,
  background: wechatDark.panelSoft,
  border: `1px solid ${wechatDark.border}`,
}

const detailFactLabelStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 12,
  lineHeight: 1.35,
}

const detailFactValueStyle: CSSProperties = {
  color: wechatDark.text,
  fontSize: 14,
  lineHeight: 1.45,
}

const messageCardStyle: CSSProperties = {
  ...wechatRowStyle,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 10,
}

const messageHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
}

const messageBodyStyle: CSSProperties = {
  color: wechatDark.text,
  whiteSpace: 'pre-wrap',
  lineHeight: 1.6,
}

const attachmentLeadStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
}

const attachmentTitleStyle: CSSProperties = {
  fontSize: 14,
  lineHeight: 1.3,
  fontWeight: 600,
  color: wechatDark.textStrong,
}

const attachmentTextStyle: CSSProperties = {
  color: wechatDark.muted,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
}
