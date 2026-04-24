import React, { useMemo } from 'react'
import type { CSSProperties } from 'react'

import type {
  LongclawRun,
  LongclawTask,
  LongclawWorkItem,
} from '../../../../src/services/longclawControlPlane/models.js'
import {
  chromeStyles,
  fontStacks,
  palette,
  secondaryButtonStyle,
  segmentedButtonStyle,
  statusBadgeStyle,
  surfaceStyles,
  utilityStyles,
} from '../designSystem.js'
import type { ViewportTier } from '../layout.js'
import { type LongclawLocale, humanizeTokenLocale, t } from '../i18n.js'
import { QueueRow, Section } from './shared.js'

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

function canonicalSessionId(
  session: Pick<WeclawSessionSummary, 'canonicalMetadata' | 'canonicalSessionId'> | null | undefined,
): string | undefined {
  return (
    stringValue(session?.canonicalSessionId) ??
    stringValue(session?.canonicalMetadata.canonical_session_id) ??
    stringValue(session?.canonicalMetadata.canonicalSessionID)
  )
}

function canonicalUserId(
  session: Pick<WeclawSessionSummary, 'canonicalMetadata'> | null | undefined,
): string | undefined {
  return (
    stringValue(session?.canonicalMetadata.canonical_user_id) ??
    stringValue(session?.canonicalMetadata.canonicalUserID)
  )
}

function contextToken(
  session: Pick<WeclawSessionSummary, 'canonicalMetadata'> | null | undefined,
): string | undefined {
  return (
    stringValue(session?.canonicalMetadata.context_token) ??
    stringValue(session?.canonicalMetadata.contextToken)
  )
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
    ? '选择一个会话，在这里查看消息、附件和关联任务。'
    : 'Select a session to inspect messages, attachments, and linked records here.'
}

function sessionLoadingLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN' ? '正在加载会话详情...' : 'Loading session details...'
}

function sessionUnavailableLabel(locale: LongclawLocale): string {
  return locale === 'zh-CN'
    ? '未找到可用的会话详情。'
    : 'Session details are unavailable for the current selection.'
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
        <div style={chromeStyles.eyebrowLight}>
          {locale === 'zh-CN' ? '会话工作台' : 'Session workbench'}
        </div>
        <span style={statusBadgeStyle(resultCount > 0 ? 'open' : 'degraded')}>
          {resultCount}
        </span>
      </div>
      <input
        value={search}
        placeholder={
          locale === 'zh-CN'
            ? '搜索标题 / 用户 / session'
            : 'Search title / user / session'
        }
        style={toolbarInputStyle}
        onChange={event => onSearchChange(event.target.value)}
      />
      <div style={toolbarGroupStyle}>
        <button
          type="button"
          style={segmentedButtonStyle(sourceFilter === 'all')}
          onClick={() => onSourceFilterChange('all')}
        >
          {locale === 'zh-CN' ? '全部来源' : 'All'}
        </button>
        <button
          type="button"
          style={segmentedButtonStyle(sourceFilter === 'wechat')}
          onClick={() => onSourceFilterChange('wechat')}
        >
          WeChat
        </button>
        <button
          type="button"
          style={segmentedButtonStyle(sourceFilter === 'weclaw')}
          onClick={() => onSourceFilterChange('weclaw')}
        >
          WeClaw
        </button>
      </div>
      <div style={toolbarGroupStyle}>
        <button
          type="button"
          style={segmentedButtonStyle(visibilityFilter === 'active')}
          onClick={() => onVisibilityFilterChange('active')}
        >
          {locale === 'zh-CN' ? '活跃' : 'Active'}
        </button>
        <button
          type="button"
          style={segmentedButtonStyle(visibilityFilter === 'hidden')}
          onClick={() => onVisibilityFilterChange('hidden')}
        >
          {locale === 'zh-CN' ? '已隐藏' : 'Hidden'}
        </button>
        <button
          type="button"
          style={segmentedButtonStyle(visibilityFilter === 'archived')}
          onClick={() => onVisibilityFilterChange('archived')}
        >
          {locale === 'zh-CN' ? '已归档' : 'Archived'}
        </button>
      </div>
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
  onOpen: (uri: string) => void | Promise<void>
}) {
  if (attachments.length === 0) return null

  return (
    <div style={utilityStyles.stackedList}>
      {attachments.map(attachment => {
        const uri = attachmentUri(attachment)
        return (
          <div key={attachment.attachmentId} style={surfaceStyles.listRow}>
            <div style={attachmentLeadStyle}>
              <div style={attachmentTitleStyle}>{attachment.title}</div>
              <div style={chromeStyles.quietMeta}>
                {formatModeMeta([
                  humanizeTokenLocale(locale, attachment.kind),
                  attachment.mimeType,
                  attachment.messageId ? `#${attachment.messageId}` : undefined,
                ])}
              </div>
              {uri && <div style={chromeStyles.monoMeta}>{uri}</div>}
              {attachment.text && <div style={attachmentTextStyle}>{attachment.text}</div>}
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
  const canonicalSession = canonicalSessionId(selectedSession)
  const canonicalUser = canonicalUserId(selectedSession)
  const token = contextToken(selectedSession)

  return (
    <div style={detailStackStyle}>
      <section style={detailHeroStyle}>
        <div style={detailHeroHeaderStyle}>
          <div style={detailHeroTitleBlockStyle}>
            <div style={chromeStyles.eyebrowLight}>{t(locale, 'section.detail.weclaw_session.title')}</div>
            <h2 style={detailHeroTitleStyle}>{selectedSession.title}</h2>
            <div style={chromeStyles.subtleText}>{t(locale, 'section.detail.weclaw_session.subtitle')}</div>
          </div>
          <div style={utilityStyles.buttonCluster}>
            <button type="button" style={secondaryButtonStyle} onClick={onClearSelection}>
              {locale === 'zh-CN' ? '取消选中' : 'Clear selection'}
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                void onToggleHidden(selectedSession)
              }}
            >
              {hideSessionLabel(locale, selectedSession.hidden)}
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
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
          <span style={statusBadgeStyle('open')}>{selectedSession.sourceLabel}</span>
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
              {selectedSession.userId ?? humanizeTokenLocale(locale, 'unknown')}
            </div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.updated')}</div>
            <div style={detailFactValueStyle}>{formatTime(selectedSession.updatedAt)}</div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.session_id')}</div>
            <div style={detailFactMonoStyle}>{selectedSession.sessionId}</div>
          </div>
          <div style={detailFactStyle}>
            <div style={detailFactLabelStyle}>{t(locale, 'label.file_path')}</div>
            <div style={detailFactMonoStyle}>{selectedSession.filePath}</div>
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
          {canonicalSession && (
            <div style={detailFactStyle}>
              <div style={detailFactLabelStyle}>{t(locale, 'label.canonical_session')}</div>
              <div style={detailFactMonoStyle}>{canonicalSession}</div>
            </div>
          )}
          {canonicalUser && (
            <div style={detailFactStyle}>
              <div style={detailFactLabelStyle}>{t(locale, 'label.canonical_user')}</div>
              <div style={detailFactMonoStyle}>{canonicalUser}</div>
            </div>
          )}
          {token && (
            <div style={detailFactStyle}>
              <div style={detailFactLabelStyle}>{t(locale, 'label.context_token')}</div>
              <div style={detailFactMonoStyle}>{token}</div>
            </div>
          )}
        </div>
      </section>

      {(linkedTasks.length > 0 || linkedRuns.length > 0 || linkedWorkItems.length > 0) && (
        <Section
          title={t(locale, 'section.detail.weclaw_links.title')}
          subtitle={t(locale, 'section.detail.weclaw_links.subtitle')}
        >
          <div style={utilityStyles.stackedList}>
            {linkedTasks.map(task => (
              <QueueRow
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
              <QueueRow
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
                nextAction={inspectWorkItemLabel(locale)}
                onSelect={() => {
                  void onOpenLinkedWorkItem(workItem)
                }}
              />
            ))}
          </div>
        </Section>
      )}

      <Section
        title={t(locale, 'section.detail.weclaw_messages.title')}
        subtitle={t(locale, 'section.detail.weclaw_messages.subtitle')}
      >
        {selectedSession.messages.length === 0 ? (
          <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_weclaw_messages')}</div>
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
                  <div style={chromeStyles.quietMeta}>
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
      </Section>

      <Section
        title={t(locale, 'section.detail.weclaw_media.title')}
        subtitle={t(locale, 'section.detail.weclaw_media.subtitle')}
      >
        {selectedSession.media.length === 0 ? (
          <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_weclaw_media')}</div>
        ) : (
          <WeclawAttachmentList
            locale={locale}
            attachments={selectedSession.media}
            onOpen={onOpenAttachment}
          />
        )}
      </Section>

      <Section
        title={t(locale, 'section.detail.record_payload.title')}
        subtitle={t(locale, 'section.detail.record_payload.subtitle')}
      >
        <pre style={surfaceStyles.drawerPre}>
          {JSON.stringify(selectedSession.canonicalMetadata, null, 2)}
        </pre>
      </Section>

      {preview && (
        <Section title={t(locale, 'section.detail.preview.title')} subtitle={preview.uri}>
          <pre style={surfaceStyles.drawerPre}>{preview.text}</pre>
        </Section>
      )}
    </div>
  )
}

export function WeChatWorkspace({
  locale,
  viewportTier,
  sessions,
  sourceStatus,
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
  const splitDetail = viewportTier === 'wide'

  let detailBody: React.ReactNode
  if (selectionError) {
    detailBody = <div style={utilityStyles.errorBanner}>{selectionError}</div>
  } else if (!selectedSessionId) {
    detailBody = <div style={utilityStyles.emptyState}>{selectionPlaceholder(locale)}</div>
  } else if (loadingSession && !effectiveSelection) {
    detailBody = <div style={utilityStyles.noticeBanner}>{sessionLoadingLabel(locale)}</div>
  } else if (!effectiveSelection) {
    detailBody = <div style={utilityStyles.warningBanner}>{sessionUnavailableLabel(locale)}</div>
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
        <div style={sourceCardStyle}>
          <div style={sourceCardLeadStyle}>
            <div style={chromeStyles.eyebrowLight}>{t(locale, 'section.wechat_sessions.source.title')}</div>
            <div style={sourceCardPathStyle}>
              {sourceStatus?.sessionsDir ??
                sourceStatus?.workspaceRoot ??
                t(locale, 'empty.weclaw_sessions_dir_missing')}
            </div>
            <div style={chromeStyles.quietMeta}>
              {locale === 'zh-CN'
                ? `本地会话文件 ${sourceStatus?.sessionCount ?? 0} 条`
                : `${sourceStatus?.sessionCount ?? 0} local session files`}
            </div>
          </div>
          <span style={statusBadgeStyle(sourceStatus?.sessionsDirExists ? 'available' : 'degraded')}>
            {humanizeTokenLocale(locale, sourceStatus?.workspaceSource ?? 'unresolved')}
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
              <div style={utilityStyles.emptyState}>{emptyStateMessage(locale, sourceStatus)}</div>
            ) : (
              filteredSessions.map(session => {
                const active = session.sessionId === selectedSessionId
                const variantCount = session.duplicateSessionIds.length + 1
                return (
                  <button
                    key={session.sessionId}
                    type="button"
                    style={sessionRowStyle(active)}
                    onClick={() => onSelectSession(session)}
                  >
                    <div style={sessionRowTopStyle}>
                      <div style={sessionTitleStyle}>{session.title}</div>
                      <span style={statusBadgeStyle(sessionTone(session))}>
                        {sessionStateLabel(locale, session)}
                      </span>
                    </div>
                    <div style={chromeStyles.quietMeta}>
                      {formatModeMeta([
                        session.sourceLabel,
                        session.userId,
                        session.updatedAt ? formatTime(session.updatedAt) : undefined,
                        variantCount > 1 ? sessionVariantLabel(locale, variantCount) : undefined,
                      ])}
                    </div>
                    {session.preview && <div style={sessionPreviewStyle}>{session.preview}</div>}
                  </button>
                )
              })
            )}
          </div>
        </section>
      </div>

      <div style={detailColumnStyle(splitDetail)}>
        {!splitDetail && selectedSummary && !effectiveSelection && !selectionError && !loadingSession && (
          <div style={utilityStyles.noticeBanner}>
            {locale === 'zh-CN'
              ? `已选中 ${selectedSummary.title}，等待详情数据。`
              : `Selected ${selectedSummary.title}; waiting for detail data.`}
          </div>
        )}
        {detailBody}
      </div>
    </div>
  )
}

export default WeChatWorkspace

const workspaceRootStyle = (splitDetail: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: splitDetail ? 'minmax(320px, 420px) minmax(0, 1fr)' : 'minmax(0, 1fr)',
  gap: 16,
  alignItems: 'start',
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
  ...surfaceStyles.section,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
}

const sourceCardLeadStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const sourceCardPathStyle: CSSProperties = {
  color: palette.ink,
  fontSize: 13,
  lineHeight: 1.45,
  fontFamily: fontStacks.mono,
  overflowWrap: 'anywhere',
}

const sessionListSectionStyle: CSSProperties = {
  ...surfaceStyles.section,
  padding: 0,
  overflow: 'hidden',
}

const toolbarShellStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  borderBottom: `1px solid ${palette.border}`,
  background: palette.panelRaised,
}

const toolbarHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
}

const toolbarInputStyle: CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.panel,
  padding: '10px 14px',
  color: palette.ink,
  fontSize: 13,
  fontFamily: fontStacks.ui,
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

const sessionRowStyle = (active: boolean): CSSProperties => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 16px',
  borderRadius: 14,
  border: `1px solid ${active ? 'rgba(184, 100, 59, 0.42)' : palette.border}`,
  background: active ? 'rgba(184, 100, 59, 0.08)' : palette.panel,
  color: palette.ink,
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
  color: palette.ink,
}

const sessionPreviewStyle: CSSProperties = {
  color: palette.textMuted,
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
  ...surfaceStyles.section,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
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
  fontFamily: chromeStyles.sectionTitle.fontFamily,
  fontSize: 28,
  lineHeight: 1.05,
  fontWeight: 600,
  color: palette.ink,
  letterSpacing: '-0.03em',
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
  padding: '12px 14px',
  borderRadius: 12,
  background: palette.panel,
  border: `1px solid ${palette.border}`,
}

const detailFactLabelStyle: CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.35,
}

const detailFactValueStyle: CSSProperties = {
  color: palette.ink,
  fontSize: 14,
  lineHeight: 1.45,
}

const detailFactMonoStyle: CSSProperties = {
  ...detailFactValueStyle,
  fontFamily: fontStacks.mono,
  overflowWrap: 'anywhere',
}

const messageCardStyle: CSSProperties = {
  ...surfaceStyles.listRow,
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
  color: palette.ink,
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
  color: palette.ink,
}

const attachmentTextStyle: CSSProperties = {
  color: palette.textMuted,
  fontSize: 13,
  lineHeight: 1.45,
  whiteSpace: 'pre-wrap',
}
