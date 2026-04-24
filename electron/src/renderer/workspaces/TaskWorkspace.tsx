import React from 'react'

import {
  buttonStyleForState,
  chromeStyles,
  palette,
  primaryButtonStyle,
  secondaryButtonStyle,
  segmentedButtonStyle,
  statusBadgeStyle,
  surfaceStyles,
  utilityStyles,
} from '../designSystem.js'
import { type LongclawLocale, humanizeTokenLocale, t } from '../i18n.js'
import { QueueRow, Section, StatusStrip } from './shared.js'

export type TaskWorkspaceWorkMode = 'local' | 'cloud_sandbox' | 'weclaw_dispatch'
export type TaskWorkspaceTaskFlowFilter = 'all' | 'running' | 'pending' | 'failed' | 'completed'
export type TaskWorkspaceLocalSeatPreference =
  | 'auto'
  | 'force_acp'
  | 'force_local_runtime_api'

export type TaskWorkspaceContextItem = {
  id: string
  label: string
  value: string
  meta?: string
  tone?: string
}

export type TaskWorkspaceStatusItem = {
  label: string
  value: number
  tone?: string
}

export type TaskWorkspaceOption<T extends string> = {
  value: T
  label: string
  description?: string
}

export type TaskWorkspaceModeSpec = {
  label: string
  summary: string
  detail: string
  workspaceLabel: string
  surfaceLabel: string
  launchButtonLabel: string
  placeholder: string
  launchHint?: string
}

export type TaskWorkspaceCapabilitySuggestion = {
  id: string
  mention: string
  label?: string
}

export type TaskWorkspaceQueueItem = {
  id: string
  title: string
  meta?: string
  description?: string
  status?: string
  nextActionLabel?: string
  active?: boolean
}

type AsyncHandler = () => void | Promise<void>
type DisabledLaunchAttemptHandler = (reason?: string | null) => void | Promise<void>

export type TaskWorkspaceProps = {
  locale: LongclawLocale
  loading?: boolean
  onRefresh: AsyncHandler
  contextItems: TaskWorkspaceContextItem[]
  statusItems?: TaskWorkspaceStatusItem[]
  workModeOptions: TaskWorkspaceOption<TaskWorkspaceWorkMode>[]
  selectedWorkMode: TaskWorkspaceWorkMode
  onSelectWorkMode: (mode: TaskWorkspaceWorkMode) => void
  selectedModeSpec: TaskWorkspaceModeSpec
  selectedModeNotice?: string | null
  launchInput: string
  onLaunchInputChange: (value: string) => void
  onSubmitLaunch: AsyncHandler
  launchBusy?: boolean
  launchDisabled?: boolean
  onDisabledLaunchAttempt?: DisabledLaunchAttemptHandler
  onClearDraft: () => void
  onResetRuntime: AsyncHandler
  resetRuntimeDisabled?: boolean
  capabilitySuggestions: TaskWorkspaceCapabilitySuggestion[]
  onUseCapability: (item: TaskWorkspaceCapabilitySuggestion) => void
  localSeatPreference?: TaskWorkspaceLocalSeatPreference
  localSeatPreferenceOptions?: TaskWorkspaceOption<TaskWorkspaceLocalSeatPreference>[]
  onSelectLocalSeatPreference?: (preference: TaskWorkspaceLocalSeatPreference) => void
  localSeatBannerMessage?: string | null
  taskFlowFilter: TaskWorkspaceTaskFlowFilter
  onSelectTaskFlowFilter: (filter: TaskWorkspaceTaskFlowFilter) => void
  taskFlowItems: TaskWorkspaceQueueItem[]
  onOpenTaskFlowItem: (item: TaskWorkspaceQueueItem) => void
  continueThreads: TaskWorkspaceQueueItem[]
  onSelectContinueThread: (item: TaskWorkspaceQueueItem) => void
  pendingItems: TaskWorkspaceQueueItem[]
  onSelectPendingItem: (item: TaskWorkspaceQueueItem) => void
}

export type GlobalLauncherProps = Pick<
  TaskWorkspaceProps,
  | 'locale'
  | 'loading'
  | 'onRefresh'
  | 'contextItems'
  | 'statusItems'
  | 'workModeOptions'
  | 'selectedWorkMode'
  | 'onSelectWorkMode'
  | 'selectedModeSpec'
  | 'selectedModeNotice'
  | 'launchInput'
  | 'onLaunchInputChange'
  | 'onSubmitLaunch'
  | 'launchBusy'
  | 'launchDisabled'
  | 'onDisabledLaunchAttempt'
  | 'onClearDraft'
  | 'onResetRuntime'
  | 'resetRuntimeDisabled'
  | 'capabilitySuggestions'
  | 'onUseCapability'
  | 'localSeatPreference'
  | 'localSeatPreferenceOptions'
  | 'onSelectLocalSeatPreference'
  | 'localSeatBannerMessage'
>

export type ExecutionConsoleVM = {
  taskFlowFilter: TaskWorkspaceTaskFlowFilter
  taskFlowItems: TaskWorkspaceQueueItem[]
  continueThreads: TaskWorkspaceQueueItem[]
  pendingItems: TaskWorkspaceQueueItem[]
}

export type ExecutionConsoleProps = {
  locale: LongclawLocale
  taskFlowFilter: TaskWorkspaceTaskFlowFilter
  onSelectTaskFlowFilter: (filter: TaskWorkspaceTaskFlowFilter) => void
  taskFlowItems: TaskWorkspaceQueueItem[]
  onOpenTaskFlowItem: (item: TaskWorkspaceQueueItem) => void
  continueThreads: TaskWorkspaceQueueItem[]
  onSelectContinueThread: (item: TaskWorkspaceQueueItem) => void
  pendingItems: TaskWorkspaceQueueItem[]
  onSelectPendingItem: (item: TaskWorkspaceQueueItem) => void
}

const FILTER_ORDER: TaskWorkspaceTaskFlowFilter[] = ['all', 'running', 'pending', 'failed', 'completed']

function launcherTone(
  locale: LongclawLocale,
  selectedWorkMode: TaskWorkspaceWorkMode,
  selectedModeNotice?: string | null,
): { status: string; label: string } {
  if (!selectedModeNotice) {
    return { status: 'running', label: t(locale, 'state.ready') }
  }
  if (selectedWorkMode === 'local') {
    return { status: 'unavailable', label: t(locale, 'state.unavailable') }
  }
  return { status: 'degraded', label: t(locale, 'state.degraded') }
}

function matchesFilterStatus(
  status: string | undefined,
  filter: Exclude<TaskWorkspaceTaskFlowFilter, 'all'>,
): boolean {
  const normalized = status?.trim().toLowerCase()
  if (!normalized) return false
  if (filter === 'running') return ['running', 'active', 'open'].includes(normalized)
  if (filter === 'pending') {
    return ['pending', 'warning', 'needs_review', 'needs retry', 'needs_retry'].includes(
      normalized,
    )
  }
  if (filter === 'failed') {
    return ['failed', 'critical', 'repair_required', 'delivery_failed'].includes(normalized)
  }
  return ['completed', 'succeeded', 'approved', 'reviewed_insight', 'success'].includes(
    normalized,
  )
}

function deriveStatusItems(
  locale: LongclawLocale,
  taskFlowItems: TaskWorkspaceQueueItem[],
  continueThreads: TaskWorkspaceQueueItem[],
  pendingItems: TaskWorkspaceQueueItem[],
): TaskWorkspaceStatusItem[] {
  const countFor = (filter: TaskWorkspaceTaskFlowFilter) =>
    taskFlowItems.filter(item => {
      if (filter === 'all') return true
      return matchesFilterStatus(item.status, filter)
    }).length

  return [
    {
      label: t(locale, 'task_flow_filter.running'),
      value: countFor('running'),
      tone: 'running',
    },
    {
      label: t(locale, 'task_flow_filter.pending'),
      value: Math.max(countFor('pending'), pendingItems.length),
      tone: 'pending',
    },
    {
      label: t(locale, 'task_flow_filter.failed'),
      value: countFor('failed'),
      tone: 'failed',
    },
    {
      label: t(locale, 'section.continue_threads.title'),
      value: continueThreads.length,
      tone: continueThreads.length > 0 ? 'running' : 'open',
    },
  ]
}

export function onComposerKeyDown(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  params: {
    onSubmitLaunch: AsyncHandler
    launchDisabled?: boolean
    disabledReason?: string
    onDisabledLaunchAttempt?: DisabledLaunchAttemptHandler
  },
) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    if (params.launchDisabled) {
      if (params.disabledReason?.trim()) {
        void params.onDisabledLaunchAttempt?.(params.disabledReason)
      }
      return
    }
    void params.onSubmitLaunch()
  }
}

export function GlobalLauncher({
  locale,
  loading = false,
  onRefresh,
  contextItems,
  statusItems,
  workModeOptions,
  selectedWorkMode,
  onSelectWorkMode,
  selectedModeSpec,
  selectedModeNotice,
  launchInput,
  onLaunchInputChange,
  onSubmitLaunch,
  launchBusy = false,
  launchDisabled = false,
  onDisabledLaunchAttempt,
  onClearDraft,
  onResetRuntime,
  resetRuntimeDisabled = false,
  capabilitySuggestions,
  onUseCapability,
  localSeatPreference,
  localSeatPreferenceOptions = [],
  onSelectLocalSeatPreference,
  localSeatBannerMessage,
}: GlobalLauncherProps) {
  const resolvedStatusItems = statusItems ?? []
  const launchState = launcherTone(locale, selectedWorkMode, selectedModeNotice)
  const visibleCapabilitySuggestions = capabilitySuggestions.slice(0, 4)
  const compactContextItems = contextItems.slice(0, 2)
  const launchDisabledReason = launchDisabled && selectedModeNotice ? selectedModeNotice : undefined

  return (
    <Section
      title={t(locale, 'section.mode_launcher.title')}
      subtitle={
        locale === 'zh-CN'
          ? '只保留处理方式、输入框和少量推荐路由。'
          : 'Keep the launcher to mode selection, a prompt, and a few routing hints.'
      }
      actions={<span style={statusBadgeStyle(launchState.status)}>{launchState.label}</span>}
    >
      <div style={launcherSurfaceStyle}>
        <div style={launcherContextStripStyle}>
          {compactContextItems.map(item => (
            <div key={item.id} style={launcherContextChipStyle}>
              <div style={chromeStyles.eyebrowLight}>{item.label}</div>
              <div style={launcherContextValueStyle}>{item.value}</div>
              {item.meta && <div style={contextMetaStyle}>{item.meta}</div>}
            </div>
          ))}
          <div style={launcherStatusStripStyle}>
            <StatusStrip locale={locale} items={resolvedStatusItems} />
          </div>
        </div>

        <div style={modeSwitchRowStyle}>
          {workModeOptions.map(option => (
            <button
              key={option.value}
              type="button"
              aria-pressed={selectedWorkMode === option.value}
              style={segmentedButtonStyle(selectedWorkMode === option.value)}
              onClick={() => onSelectWorkMode(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div style={launcherSummaryLeadStyle}>
          <div style={launcherSummaryTextStyle}>{selectedModeSpec.summary}</div>
          <div style={chromeStyles.quietMeta}>
            {[
              selectedModeSpec.workspaceLabel,
              selectedModeSpec.surfaceLabel,
              selectedWorkMode === 'local' && localSeatPreference
                ? localSeatPreferenceOptions.find(option => option.value === localSeatPreference)
                    ?.label
                : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>

        {selectedWorkMode === 'local' &&
          localSeatPreference &&
          localSeatPreferenceOptions.length > 0 &&
          onSelectLocalSeatPreference && (
            <div style={localSeatShellStyle}>
              <div style={chromeStyles.quietMeta}>{t(locale, 'context.local_seat_strategy_desc')}</div>
              <div style={utilityStyles.buttonCluster}>
                {localSeatPreferenceOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={localSeatPreference === option.value}
                    style={segmentedButtonStyle(localSeatPreference === option.value)}
                    onClick={() => onSelectLocalSeatPreference(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}

        {localSeatBannerMessage && (
          <div style={utilityStyles.noticeBanner}>{localSeatBannerMessage}</div>
        )}

        <textarea
          value={launchInput}
          placeholder={selectedModeSpec.placeholder}
          style={composerTextareaStyle}
          onChange={event => onLaunchInputChange(event.target.value)}
          onKeyDown={event =>
            onComposerKeyDown(event, {
              onSubmitLaunch,
              launchDisabled,
              disabledReason: launchDisabledReason,
              onDisabledLaunchAttempt,
            })
          }
        />

        {selectedModeNotice && <div style={utilityStyles.warningBanner}>{selectedModeNotice}</div>}

        <div style={launcherFooterStyle}>
          <div style={launcherHintsBlockStyle}>
            <div style={chromeStyles.quietMeta}>
              {selectedModeSpec.launchHint ?? selectedModeSpec.detail}
            </div>
            {visibleCapabilitySuggestions.length > 0 && (
              <div style={launcherHintRowStyle}>
                {visibleCapabilitySuggestions.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    style={hintChipStyle}
                    onClick={() => onUseCapability(item)}
                    title={item.label ?? item.mention}
                  >
                    {item.mention}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={launcherActionsStyle}>
            {launchDisabledReason && (
              <div id="task-launch-disabled-reason" style={launchDisabledHintStyle}>
                {launchDisabledReason}
              </div>
            )}
            <div style={utilityStyles.buttonCluster}>
              <button
                type="button"
                style={buttonStyleForState(
                  secondaryButtonStyle,
                  resetRuntimeDisabled,
                  'secondary',
                )}
                disabled={resetRuntimeDisabled}
                onClick={() => {
                  void onResetRuntime()
                }}
              >
                {t(locale, 'action.reset_runtime')}
              </button>
              <button type="button" style={secondaryButtonStyle} onClick={onClearDraft}>
                {t(locale, 'action.clear_draft')}
              </button>
              <button
                type="button"
                style={buttonStyleForState(primaryButtonStyle, launchDisabled, 'primary')}
                disabled={launchDisabled}
                title={launchDisabledReason}
                aria-describedby={
                  launchDisabledReason ? 'task-launch-disabled-reason' : undefined
                }
                onClick={() => {
                  void onSubmitLaunch()
                }}
              >
                {launchBusy ? t(locale, 'action.launching') : selectedModeSpec.launchButtonLabel}
              </button>
            </div>
          </div>
        </div>

        <div style={pageHeaderActionsStyle}>
          <button
            type="button"
            style={buttonStyleForState(secondaryButtonStyle, loading)}
            disabled={loading}
            onClick={() => {
              void onRefresh()
            }}
          >
            {loading ? t(locale, 'action.refreshing') : t(locale, 'action.refresh')}
          </button>
        </div>
      </div>
    </Section>
  )
}

export function ExecutionConsole({
  locale,
  taskFlowFilter,
  onSelectTaskFlowFilter,
  taskFlowItems,
  onOpenTaskFlowItem,
  continueThreads,
  onSelectContinueThread,
  pendingItems,
  onSelectPendingItem,
}: ExecutionConsoleProps) {
  const inboxEmpty = continueThreads.length === 0 && pendingItems.length === 0

  return (
    <div style={workspaceGridStyle}>
      <div style={mainColumnStyle}>
        <Section
          title={t(locale, 'section.task_flow.title')}
          subtitle={t(locale, 'section.task_flow.subtitle')}
          actions={
            <div style={utilityStyles.buttonCluster}>
              {FILTER_ORDER.map(filter => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={taskFlowFilter === filter}
                  style={segmentedButtonStyle(taskFlowFilter === filter)}
                  onClick={() => onSelectTaskFlowFilter(filter)}
                >
                  {t(locale, `task_flow_filter.${filter}`)}
                </button>
              ))}
            </div>
          }
        >
          <div style={utilityStyles.stackedList}>
            {taskFlowItems.length === 0 ? (
              <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_task_flow')}</div>
            ) : (
              taskFlowItems.slice(0, 16).map(item => (
                <QueueRow
                  key={item.id}
                  locale={locale}
                  title={item.title}
                  meta={item.meta}
                  status={item.status}
                  description={item.description}
                  nextAction={item.nextActionLabel ?? t(locale, 'action.inspect_launch')}
                  onSelect={() => onOpenTaskFlowItem(item)}
                />
              ))
            )}
          </div>
        </Section>
      </div>

      <aside style={railColumnStyle}>
        <Section
          title={locale === 'zh-CN' ? '任务收件箱' : 'Task inbox'}
          subtitle={
            locale === 'zh-CN'
              ? '把继续中的任务和需要处理的事项放在一处。'
              : 'Keep resumable threads and action-required items in one place.'
          }
        >
          <div style={utilityStyles.stackedList}>
            {inboxEmpty ? (
              <div style={utilityStyles.emptyState}>
                {locale === 'zh-CN'
                  ? '当前没有需要继续或处理的任务。'
                  : 'There are no resumable or action-required tasks right now.'}
              </div>
            ) : (
              <>
                {continueThreads.length > 0 && (
                  <div style={inboxGroupStyle}>
                    <div style={inboxGroupLabelStyle}>{t(locale, 'section.continue_threads.title')}</div>
                    {continueThreads.slice(0, 4).map(item => (
                      <QueueRow
                        key={item.id}
                        locale={locale}
                        title={item.title}
                        meta={item.meta}
                        status={item.status}
                        description={item.description}
                        nextAction={item.nextActionLabel ?? t(locale, 'action.switch_context')}
                        active={item.active}
                        onSelect={() => onSelectContinueThread(item)}
                      />
                    ))}
                  </div>
                )}
                {pendingItems.length > 0 && (
                  <div style={inboxGroupStyle}>
                    <div style={inboxGroupLabelStyle}>{t(locale, 'section.pending_actions.title')}</div>
                    {pendingItems.slice(0, 4).map(item => (
                      <QueueRow
                        key={item.id}
                        locale={locale}
                        title={item.title}
                        meta={item.meta}
                        status={item.status}
                        description={item.description}
                        nextAction={item.nextActionLabel ?? t(locale, 'action.inspect_launch')}
                        onSelect={() => onSelectPendingItem(item)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Section>
      </aside>
    </div>
  )
}

export function TaskWorkspace({
  locale,
  loading = false,
  onRefresh,
  contextItems,
  statusItems,
  workModeOptions,
  selectedWorkMode,
  onSelectWorkMode,
  selectedModeSpec,
  selectedModeNotice,
  launchInput,
  onLaunchInputChange,
  onSubmitLaunch,
  launchBusy = false,
  launchDisabled = false,
  onDisabledLaunchAttempt,
  onClearDraft,
  onResetRuntime,
  resetRuntimeDisabled = false,
  capabilitySuggestions,
  onUseCapability,
  localSeatPreference,
  localSeatPreferenceOptions = [],
  onSelectLocalSeatPreference,
  localSeatBannerMessage,
  taskFlowFilter,
  onSelectTaskFlowFilter,
  taskFlowItems,
  onOpenTaskFlowItem,
  continueThreads,
  onSelectContinueThread,
  pendingItems,
  onSelectPendingItem,
}: TaskWorkspaceProps) {
  const resolvedStatusItems =
    statusItems ?? deriveStatusItems(locale, taskFlowItems, continueThreads, pendingItems)
  const launchState = launcherTone(locale, selectedWorkMode, selectedModeNotice)
  const visibleCapabilitySuggestions = capabilitySuggestions.slice(0, 4)
  const compactContextItems = contextItems.slice(0, 2)
  const inboxEmpty = continueThreads.length === 0 && pendingItems.length === 0
  const launchDisabledReason = launchDisabled && selectedModeNotice ? selectedModeNotice : undefined

  return (
    <div style={pageStackStyle}>
      <div style={pageHeaderShellStyle}>
        <div style={pageHeaderLeadStyle}>
          <div style={chromeStyles.eyebrow}>{t(locale, 'page.tasks.eyebrow')}</div>
          <h1 style={chromeStyles.headerTitle}>{t(locale, 'page.tasks.title')}</h1>
          <div style={chromeStyles.subtleText}>{t(locale, 'page.tasks.description')}</div>
        </div>
        <div style={pageHeaderActionsStyle}>
          <span style={statusBadgeStyle(selectedModeNotice ? 'degraded' : 'running')}>
            {selectedModeSpec.label}
          </span>
          <button
            type="button"
            style={buttonStyleForState(secondaryButtonStyle, loading)}
            disabled={loading}
            onClick={() => {
              void onRefresh()
            }}
          >
            {loading ? t(locale, 'action.refreshing') : t(locale, 'action.refresh')}
          </button>
        </div>
      </div>

      <div style={workspaceGridStyle}>
        <div style={mainColumnStyle}>
          <Section
            title={t(locale, 'section.mode_launcher.title')}
            subtitle={
              locale === 'zh-CN'
                ? '只保留处理方式、输入框和少量推荐路由。'
                : 'Keep the launcher to mode selection, a prompt, and a few routing hints.'
            }
            actions={<span style={statusBadgeStyle(launchState.status)}>{launchState.label}</span>}
          >
            <div style={launcherSurfaceStyle}>
              <div style={launcherContextStripStyle}>
                {compactContextItems.map(item => (
                  <div key={item.id} style={launcherContextChipStyle}>
                    <div style={chromeStyles.eyebrowLight}>{item.label}</div>
                    <div style={launcherContextValueStyle}>{item.value}</div>
                    {item.meta && <div style={contextMetaStyle}>{item.meta}</div>}
                  </div>
                ))}
                <div style={launcherStatusStripStyle}>
                  <StatusStrip locale={locale} items={resolvedStatusItems} />
                </div>
              </div>

              <div style={modeSwitchRowStyle}>
                {workModeOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selectedWorkMode === option.value}
                    style={segmentedButtonStyle(selectedWorkMode === option.value)}
                    onClick={() => onSelectWorkMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div style={launcherSummaryLeadStyle}>
                <div style={launcherSummaryTextStyle}>{selectedModeSpec.summary}</div>
                <div style={chromeStyles.quietMeta}>
                  {[
                    selectedModeSpec.workspaceLabel,
                    selectedModeSpec.surfaceLabel,
                    selectedWorkMode === 'local' && localSeatPreference
                      ? localSeatPreferenceOptions.find(option => option.value === localSeatPreference)
                          ?.label
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>

              {selectedWorkMode === 'local' &&
                localSeatPreference &&
                localSeatPreferenceOptions.length > 0 &&
                onSelectLocalSeatPreference && (
                  <div style={localSeatShellStyle}>
                    <div style={chromeStyles.quietMeta}>{t(locale, 'context.local_seat_strategy_desc')}</div>
                    <div style={utilityStyles.buttonCluster}>
                      {localSeatPreferenceOptions.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={localSeatPreference === option.value}
                          style={segmentedButtonStyle(localSeatPreference === option.value)}
                          onClick={() => onSelectLocalSeatPreference(option.value)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              {localSeatBannerMessage && (
                <div style={utilityStyles.noticeBanner}>{localSeatBannerMessage}</div>
              )}

              <textarea
                value={launchInput}
                placeholder={selectedModeSpec.placeholder}
                style={composerTextareaStyle}
                onChange={event => onLaunchInputChange(event.target.value)}
                onKeyDown={event =>
                  onComposerKeyDown(event, {
                    onSubmitLaunch,
                    launchDisabled,
                    disabledReason: launchDisabledReason,
                    onDisabledLaunchAttempt,
                  })
                }
              />

              {selectedModeNotice && <div style={utilityStyles.warningBanner}>{selectedModeNotice}</div>}

              <div style={launcherFooterStyle}>
                <div style={launcherHintsBlockStyle}>
                  <div style={chromeStyles.quietMeta}>
                    {selectedModeSpec.launchHint ?? selectedModeSpec.detail}
                  </div>
                  {visibleCapabilitySuggestions.length > 0 && (
                    <>
                      <div style={launcherHintRowStyle}>
                        {visibleCapabilitySuggestions.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            style={hintChipStyle}
                            onClick={() => onUseCapability(item)}
                            title={item.label ?? item.mention}
                          >
                            {item.mention}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div style={launcherActionsStyle}>
                  {launchDisabledReason && (
                    <div id="task-launch-disabled-reason" style={launchDisabledHintStyle}>
                      {launchDisabledReason}
                    </div>
                  )}
                  <div style={utilityStyles.buttonCluster}>
                    <button
                      type="button"
                      style={buttonStyleForState(secondaryButtonStyle, resetRuntimeDisabled, 'secondary')}
                      disabled={resetRuntimeDisabled}
                      onClick={() => {
                        void onResetRuntime()
                      }}
                    >
                      {t(locale, 'action.reset_runtime')}
                    </button>
                    <button type="button" style={secondaryButtonStyle} onClick={onClearDraft}>
                      {t(locale, 'action.clear_draft')}
                    </button>
                    <button
                      type="button"
                      style={buttonStyleForState(primaryButtonStyle, launchDisabled, 'primary')}
                      disabled={launchDisabled}
                      title={launchDisabledReason}
                      aria-describedby={launchDisabledReason ? 'task-launch-disabled-reason' : undefined}
                      onClick={() => {
                        void onSubmitLaunch()
                      }}
                    >
                      {launchBusy ? t(locale, 'action.launching') : selectedModeSpec.launchButtonLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title={t(locale, 'section.task_flow.title')}
            subtitle={t(locale, 'section.task_flow.subtitle')}
            actions={
              <div style={utilityStyles.buttonCluster}>
                {FILTER_ORDER.map(filter => (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={taskFlowFilter === filter}
                    style={segmentedButtonStyle(taskFlowFilter === filter)}
                    onClick={() => onSelectTaskFlowFilter(filter)}
                  >
                    {t(locale, `task_flow_filter.${filter}`)}
                  </button>
                ))}
              </div>
            }
          >
            <div style={utilityStyles.stackedList}>
              {taskFlowItems.length === 0 ? (
                <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_task_flow')}</div>
              ) : (
                taskFlowItems.slice(0, 16).map(item => (
                  <QueueRow
                    key={item.id}
                    locale={locale}
                    title={item.title}
                    meta={item.meta}
                    status={item.status}
                    description={item.description}
                    nextAction={item.nextActionLabel ?? t(locale, 'action.inspect_launch')}
                    onSelect={() => onOpenTaskFlowItem(item)}
                  />
                ))
              )}
            </div>
          </Section>
        </div>

        <aside style={railColumnStyle}>
          <Section
            title={locale === 'zh-CN' ? '任务收件箱' : 'Task inbox'}
            subtitle={
              locale === 'zh-CN'
                ? '把继续中的任务和需要处理的事项放在一处。'
                : 'Keep resumable threads and action-required items in one place.'
            }
          >
            <div style={utilityStyles.stackedList}>
              {inboxEmpty ? (
                <div style={utilityStyles.emptyState}>
                  {locale === 'zh-CN'
                    ? '当前没有需要继续或处理的任务。'
                    : 'There are no resumable or action-required tasks right now.'}
                </div>
              ) : (
                <>
                  {continueThreads.length > 0 && (
                    <div style={inboxGroupStyle}>
                      <div style={inboxGroupLabelStyle}>{t(locale, 'section.continue_threads.title')}</div>
                      {continueThreads.slice(0, 4).map(item => (
                        <QueueRow
                          key={item.id}
                          locale={locale}
                          title={item.title}
                          meta={item.meta}
                          status={item.status}
                          description={item.description}
                          nextAction={item.nextActionLabel ?? t(locale, 'action.switch_context')}
                          active={item.active}
                          onSelect={() => onSelectContinueThread(item)}
                        />
                      ))}
                    </div>
                  )}
                  {pendingItems.length > 0 && (
                    <div style={inboxGroupStyle}>
                      <div style={inboxGroupLabelStyle}>{t(locale, 'section.pending_actions.title')}</div>
                      {pendingItems.slice(0, 4).map(item => (
                        <QueueRow
                          key={item.id}
                          locale={locale}
                          title={item.title}
                          meta={item.meta}
                          status={item.status}
                          description={item.description}
                          nextAction={item.nextActionLabel ?? t(locale, 'action.inspect_launch')}
                          onSelect={() => onSelectPendingItem(item)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Section>
        </aside>
      </div>
    </div>
  )
}

const pageStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const pageHeaderShellStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
}

const pageHeaderLeadStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const pageHeaderActionsStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: 8,
}

const contextValueStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 16,
  lineHeight: 1.35,
  fontWeight: 600,
  wordBreak: 'break-word',
}

const contextMetaStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.45,
  wordBreak: 'break-word',
}

const workspaceGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.7fr) minmax(280px, 0.9fr)',
  gap: 12,
  alignItems: 'start',
}

const mainColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const railColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const launcherSurfaceStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
}

const launcherContextStripStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  gap: 10,
  alignItems: 'stretch',
}

const launcherContextChipStyle: React.CSSProperties = {
  ...surfaceStyles.mutedSection,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const launcherContextValueStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 600,
  wordBreak: 'break-word',
}

const launcherStatusStripStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
}

const modeSwitchRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const launcherSummaryLeadStyle: React.CSSProperties = {
  ...surfaceStyles.mutedSection,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const launcherSummaryTextStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 15,
  lineHeight: 1.5,
  fontWeight: 600,
}

const localSeatShellStyle: React.CSSProperties = {
  ...surfaceStyles.mutedSection,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const composerTextareaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 120,
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

const launcherFooterStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 16,
  flexWrap: 'wrap',
}

const launcherHintsBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
}

const launcherActionsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  alignItems: 'flex-end',
  maxWidth: '100%',
}

const launchDisabledHintStyle: React.CSSProperties = {
  maxWidth: 360,
  padding: '8px 10px',
  borderRadius: 12,
  background: 'rgba(199, 146, 47, 0.1)',
  border: '1px solid rgba(199, 146, 47, 0.18)',
  color: palette.warning,
  fontSize: 12,
  lineHeight: 1.45,
  textAlign: 'right',
}

const launcherHintRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  flexWrap: 'wrap',
}

const inboxGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const inboxGroupLabelStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const hintChipStyle: React.CSSProperties = {
  borderRadius: 999,
  border: `1px solid ${palette.border}`,
  background: palette.panel,
  color: palette.textMuted,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
}

export default TaskWorkspace
