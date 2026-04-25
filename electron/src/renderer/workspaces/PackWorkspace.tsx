import React from 'react'

import type {
  DueDiligenceDashboard,
  LongclawOperatorAction,
  LongclawPackDashboard,
  LongclawRun,
  SignalsDashboard,
} from '../../../../src/services/longclawControlPlane/models.js'
import {
  chromeStyles,
  palette,
  segmentedButtonStyle,
  statusBadgeStyle,
  surfaceStyles,
  utilityStyles,
} from '../designSystem.js'
import { type LongclawLocale, humanizeTokenLocale, t } from '../i18n.js'
import {
  ActionButtons,
  PackListSection,
  Section,
  StatusStrip,
  normalizePackRows,
} from './shared.js'
import { BacktestWorkbench } from './BacktestWorkbench.js'
import { StrategyChartTerminal } from './StrategyChartTerminal.js'

type SignalsPanel = 'overview' | 'chart' | 'review' | 'backtest' | 'connectors'

export type PackSurface = 'execution' | 'strategy' | 'backtest' | 'factory'

type PackWorkspaceProps = {
  locale: LongclawLocale
  surface: PackSurface
  dashboard: LongclawPackDashboard | null
  signalsWebBaseUrl?: string
  localizedNotice?: string | null
  onRunAction: (action: LongclawOperatorAction) => Promise<void>
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (
    title: string,
    record: Record<string, unknown>,
    actions?: LongclawOperatorAction[],
  ) => void
}

const packGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
}

const strategyPackShellStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
}

const denseListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}

const statCardStyle: React.CSSProperties = {
  ...surfaceStyles.listRow,
  alignItems: 'center',
}

const terminalWorkbenchStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(220px, 0.9fr) minmax(0, 1.5fr) minmax(260px, 1fr)',
  gap: 12,
  alignItems: 'start',
}

const terminalColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  minWidth: 0,
}

const chartHeroStyle: React.CSSProperties = {
  ...surfaceStyles.mutedSection,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const chartHeroHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const chartTickerStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 24,
  lineHeight: 1.15,
  fontWeight: 700,
}

const chartStatGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 10,
}

const chartStatCardStyle: React.CSSProperties = {
  ...surfaceStyles.listRow,
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
}

const chartBarsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
  gap: 8,
}

const chartBarCardStyle: React.CSSProperties = {
  ...surfaceStyles.listRow,
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 4,
  minWidth: 0,
}

function operatorActionsFromRecord(record: Record<string, unknown>): LongclawOperatorAction[] {
  return Array.isArray(record.operator_actions)
    ? (record.operator_actions as LongclawOperatorAction[])
    : []
}

function signalTone(value?: string | null): string {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return 'open'
  if (normalized.includes('sell') || normalized.includes('short') || normalized.includes('exit')) {
    return 'warning'
  }
  if (normalized.includes('buy') || normalized.includes('long') || normalized.includes('entry')) {
    return 'success'
  }
  return 'open'
}

function normalizeDueDashboard(
  dashboard: LongclawPackDashboard | null,
  locale: LongclawLocale,
): DueDiligenceDashboard {
  const degradedNotice =
    locale === 'zh-CN'
      ? '当前专业工作面的远端数据暂时不可用，请稍后刷新。'
      : 'The remote specialist runtime is currently unavailable. Try refreshing later.'
  const candidate = (dashboard ?? {}) as Partial<DueDiligenceDashboard>
  return {
    pack_id: 'due_diligence',
    title: candidate.title ?? 'Due Diligence',
    status: candidate.status ?? 'degraded',
    notice: candidate.notice ?? degradedNotice,
    diagnostics: normalizePackRows(candidate.diagnostics),
    recent_runs: normalizePackRows(candidate.recent_runs),
    manual_review_queue: normalizePackRows(candidate.manual_review_queue),
    repair_cases: normalizePackRows(candidate.repair_cases),
    site_health: normalizePackRows(candidate.site_health),
    operator_actions: normalizePackRows(candidate.operator_actions),
  }
}

function normalizeSignalsDashboard(
  dashboard: LongclawPackDashboard | null,
  locale: LongclawLocale,
): SignalsDashboard {
  const degradedNotice =
    locale === 'zh-CN'
      ? 'Signals 监控数据暂时不可用，当前展示的是降级面板。'
      : 'Signals monitoring data is currently unavailable. Showing a degraded shell.'
  const candidate = (dashboard ?? {}) as Partial<SignalsDashboard>
  return {
    pack_id: 'signals',
    title: candidate.title ?? 'Signals',
    status: candidate.status ?? 'degraded',
    notice: candidate.notice ?? degradedNotice,
    diagnostics: normalizePackRows(candidate.diagnostics),
    overview: candidate.overview ?? {
      market_regime: {},
      cluster_summary: {},
      review_summary: {},
      data_warning: '',
    },
    recent_runs: normalizePackRows(candidate.recent_runs),
    review_runs: normalizePackRows(candidate.review_runs),
    buy_candidates: normalizePackRows(candidate.buy_candidates),
    sell_warnings: normalizePackRows(candidate.sell_warnings),
    chart_context: candidate.chart_context ?? null,
    backtest_summary: candidate.backtest_summary ?? {
      total: 0,
      evaluated: 0,
      pending: 0,
    },
    backtest_jobs: normalizePackRows(candidate.backtest_jobs),
    pending_backlog_preview: normalizePackRows(candidate.pending_backlog_preview),
    connector_health: normalizePackRows(candidate.connector_health),
    deep_links: normalizePackRows(candidate.deep_links),
    operator_actions: normalizePackRows(candidate.operator_actions),
  }
}

function RuntimeDiagnostics({
  locale,
  diagnostics,
}: {
  locale: LongclawLocale
  diagnostics: Array<{ diagnostic_id: string; label: string; detail: string; status: string }>
}) {
  if (diagnostics.length === 0) return null
  return (
    <Section
      title={locale === 'zh-CN' ? '运行诊断' : 'Runtime diagnostics'}
      subtitle={
        locale === 'zh-CN'
          ? '服务未连通时也要明确暴露当前状态和排查入口。'
          : 'Expose runtime state and operator entry points even when the service is degraded.'
      }
    >
      <div style={denseListStyle}>
        {diagnostics.map(item => (
          <div key={item.diagnostic_id} style={surfaceStyles.listRow}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <div style={{ fontWeight: 600, color: palette.ink }}>{item.label}</div>
              <div style={chromeStyles.quietMeta}>{item.detail}</div>
            </div>
            <span style={statusBadgeStyle(item.status)}>
              {humanizeTokenLocale(locale, item.status)}
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}

function DueDiligencePackView({
  locale,
  dashboard,
  onOpenRun,
  onOpenRecord,
}: {
  locale: LongclawLocale
  dashboard: DueDiligenceDashboard
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (
    title: string,
    record: Record<string, unknown>,
    actions?: LongclawOperatorAction[],
  ) => void
}) {
  return (
    <div style={packGridStyle}>
      <Section
        title={locale === 'zh-CN' ? 'Agent 执行台' : 'Agent execution cockpit'}
        subtitle={
          locale === 'zh-CN'
            ? 'RPA 以大模型可推进的步骤、人工确认边界和失败修复为核心，而不是只做人工监控。'
            : 'RPA is organized around model-executable steps, human confirmation boundaries, and failure repair instead of pure human monitoring.'
        }
      >
        <StatusStrip
          locale={locale}
          items={[
            {
              label: locale === 'zh-CN' ? '可自动推进' : 'Auto-progress',
              value: dashboard.recent_runs.length,
              tone: 'running',
            },
            {
              label: locale === 'zh-CN' ? '待模型判断' : 'Needs judgment',
              value: dashboard.manual_review_queue.length,
              tone: 'needs_review',
            },
            {
              label: locale === 'zh-CN' ? '待修复' : 'Repair queue',
              value: dashboard.repair_cases.length,
              tone: 'warning',
            },
            {
              label: locale === 'zh-CN' ? '站点风险' : 'Site risks',
              value: dashboard.site_health.length,
              tone: 'degraded',
            },
          ]}
        />
      </Section>
      <RuntimeDiagnostics locale={locale} diagnostics={dashboard.diagnostics} />
      <PackListSection
        locale={locale}
        title={locale === 'zh-CN' ? '可自动推进的流程' : 'Auto-progress flows'}
        subtitle={
          locale === 'zh-CN'
            ? '最近成功或仍在运行的流程，可以作为模型继续推进的轨迹。'
            : 'Recently successful or active flows that the model can continue from.'
        }
        rows={dashboard.recent_runs as Array<Record<string, unknown>>}
        onOpen={run => {
          void onOpenRun(run as LongclawRun)
        }}
      />
      <PackListSection
        locale={locale}
        title={locale === 'zh-CN' ? '待模型判断 / 人工确认' : 'Judgment and confirmation queue'}
        subtitle={
          locale === 'zh-CN'
            ? '这些是模型需要结论、操作员需要授权，或两者需要交接的边界。'
            : 'These are the boundaries where the model needs a conclusion, the operator must authorize, or both need a handoff.'
        }
        rows={dashboard.manual_review_queue as Array<Record<string, unknown>>}
        onOpen={item =>
          onOpenRecord(
            `Review ${String(item.site_slug ?? item.review_id ?? 'record')}`,
            item,
            operatorActionsFromRecord(item),
          )
        }
      />
      <PackListSection
        locale={locale}
        title={locale === 'zh-CN' ? '失败修复与重试' : 'Repair and retry'}
        subtitle={
          locale === 'zh-CN'
            ? '流程失败后优先给模型修补、重放或明确交接。'
            : 'When a flow fails, prioritize model repair, replay, or explicit handoff.'
        }
        rows={dashboard.repair_cases as Array<Record<string, unknown>>}
        onOpen={item =>
          onOpenRecord(
            `Repair ${String(item.site_slug ?? item.case_id ?? 'record')}`,
            item,
            operatorActionsFromRecord(item),
          )
        }
      />
      <PackListSection
        locale={locale}
        title={locale === 'zh-CN' ? '执行环境与站点诊断' : 'Execution and site diagnostics'}
        subtitle={
          locale === 'zh-CN'
            ? '只有当流程无法继续推进时，才回到站点健康和环境排查。'
            : 'Only drop back to site health and environment diagnostics when the flow can no longer advance.'
        }
        rows={dashboard.site_health as Array<Record<string, unknown>>}
        onOpen={item =>
          onOpenRecord(
            `Site ${String(item.site_slug ?? 'record')}`,
            item,
            operatorActionsFromRecord(item),
          )
        }
      />
    </div>
  )
}

function SignalsPackView({
  locale,
  dashboard,
  panel,
  onChangePanel,
  onOpenRun,
  onOpenRecord,
}: {
  locale: LongclawLocale
  dashboard: SignalsDashboard
  panel: SignalsPanel
  onChangePanel: (panel: SignalsPanel) => void
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (
    title: string,
    record: Record<string, unknown>,
    actions?: LongclawOperatorAction[],
  ) => void
}) {
  const chartContext = dashboard.chart_context
  const panels: Array<{ id: SignalsPanel; label: string }> = [
    { id: 'overview', label: locale === 'zh-CN' ? '概览' : 'Overview' },
    { id: 'chart', label: locale === 'zh-CN' ? '图表' : 'Chart' },
    { id: 'review', label: locale === 'zh-CN' ? '复核' : 'Review' },
    { id: 'backtest', label: locale === 'zh-CN' ? '回测' : 'Backtest' },
    { id: 'connectors', label: locale === 'zh-CN' ? '连接器' : 'Connectors' },
  ]

  return (
    <div style={packGridStyle}>
      <Section
        title={locale === 'zh-CN' ? '策略终端' : 'Signals Terminal'}
        subtitle={
          locale === 'zh-CN'
            ? '按 TradingView 的工作台心智来组织观察、图表、review 和回测，但仍然坚持状态驱动原生渲染。'
            : 'Organized like a TradingView-style terminal for observation, charting, review, and backtesting while staying state-driven and native.'
        }
      >
        <div style={utilityStyles.buttonCluster}>
          {panels.map(item => (
            <button
              key={item.id}
              type="button"
              style={segmentedButtonStyle(panel === item.id)}
              onClick={() => onChangePanel(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <StatusStrip
            locale={locale}
            items={[
              {
                label: locale === 'zh-CN' ? '观察列表' : 'Watchlist',
                value: dashboard.buy_candidates.length + dashboard.sell_warnings.length,
                tone: 'open',
              },
              {
                label: locale === 'zh-CN' ? 'Review' : 'Review',
                value: dashboard.review_runs.length,
                tone: 'running',
              },
              {
                label: locale === 'zh-CN' ? '回测' : 'Backtests',
                value: dashboard.backtest_jobs.length,
                tone: 'needs_review',
              },
              {
                label: locale === 'zh-CN' ? '连接器' : 'Connectors',
                value: dashboard.connector_health.length,
                tone: 'info',
              },
            ]}
          />
        </div>
      </Section>

      <RuntimeDiagnostics locale={locale} diagnostics={dashboard.diagnostics} />

      {panel === 'overview' && (
        <>
          <Section
            title={locale === 'zh-CN' ? '概览' : 'Overview'}
            subtitle={
              locale === 'zh-CN'
                ? '买卖候选、市场状态和待评估回测摘要。'
                : 'Buy/sell candidates, market state, and pending backtest summary.'
            }
          >
            <StatusStrip
              locale={locale}
              items={[
                {
                  label: locale === 'zh-CN' ? '买入候选' : 'Buy candidates',
                  value: dashboard.buy_candidates.length,
                  tone: 'success',
                },
                {
                  label: locale === 'zh-CN' ? '卖出预警' : 'Sell warnings',
                  value: dashboard.sell_warnings.length,
                  tone: 'warning',
                },
                {
                  label: locale === 'zh-CN' ? '待评估回测' : 'Backtests pending',
                  value: dashboard.backtest_summary.pending,
                  tone: 'needs_review',
                },
              ]}
            />
            <div style={{ ...denseListStyle, marginTop: 12 }}>
              <div style={statCardStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: palette.ink }}>
                    {locale === 'zh-CN' ? 'Market regime' : 'Market regime'}
                  </div>
                  <div style={chromeStyles.quietMeta}>
                    {String(
                      dashboard.overview.market_regime.label ??
                        dashboard.overview.market_regime.regime_mult ??
                        'N/A',
                    )}
                  </div>
                </div>
                <span style={statusBadgeStyle('open')}>
                  {String(
                    dashboard.overview.market_regime.lianban_max ??
                      dashboard.overview.market_regime.zt_total ??
                      0,
                  )}
                </span>
              </div>
              {dashboard.overview.data_warning ? (
                <div style={utilityStyles.warningBanner}>{dashboard.overview.data_warning}</div>
              ) : null}
            </div>
          </Section>
          <PackListSection
            locale={locale}
            title={locale === 'zh-CN' ? '买入候选' : 'Buy candidates'}
            subtitle={
              locale === 'zh-CN'
                ? '来自 review 和 prediction 的融合候选。'
                : 'Merged candidates from review and prediction.'
            }
            rows={dashboard.buy_candidates as Array<Record<string, unknown>>}
          onOpen={item =>
            onOpenRecord(
              locale === 'zh-CN'
                ? `买入 ${String(item.symbol ?? '候选')}`
                : `Buy ${String(item.symbol ?? 'candidate')}`,
              item,
            )
          }
          />
          <PackListSection
            locale={locale}
            title={locale === 'zh-CN' ? '卖出预警' : 'Sell warnings'}
            subtitle={
              locale === 'zh-CN'
                ? '优先暴露高风险减仓信号。'
                : 'Expose the highest-risk exit warnings first.'
            }
            rows={dashboard.sell_warnings as Array<Record<string, unknown>>}
            onOpen={item =>
              onOpenRecord(
                locale === 'zh-CN'
                  ? `卖出 ${String(item.symbol ?? '预警')}`
                  : `Sell ${String(item.symbol ?? 'warning')}`,
                item,
              )
            }
          />
        </>
      )}

      {panel === 'chart' && (
        <div style={terminalWorkbenchStyle}>
          <div style={terminalColumnStyle}>
            <PackListSection
              locale={locale}
              title={locale === 'zh-CN' ? '观察列表 / 买入' : 'Watchlist / Buy'}
              subtitle={
                locale === 'zh-CN'
                  ? '像 TradingView 一样，先从候选流里锁定标的。'
                  : 'Start with the live candidate flow, similar to a TradingView watchlist.'
              }
              rows={dashboard.buy_candidates as Array<Record<string, unknown>>}
              onOpen={item =>
                onOpenRecord(
                  locale === 'zh-CN'
                    ? `买入 ${String(item.symbol ?? '候选')}`
                    : `Buy ${String(item.symbol ?? 'candidate')}`,
                  item,
                )
              }
            />
            <PackListSection
              locale={locale}
              title={locale === 'zh-CN' ? '观察列表 / 卖出' : 'Watchlist / Sell'}
              subtitle={
                locale === 'zh-CN'
                  ? '把高风险减仓信号放进同一个观察列。'
                  : 'Keep high-risk exit signals in the same watch column.'
              }
              rows={dashboard.sell_warnings as Array<Record<string, unknown>>}
              onOpen={item =>
                onOpenRecord(
                  locale === 'zh-CN'
                    ? `卖出 ${String(item.symbol ?? '预警')}`
                    : `Sell ${String(item.symbol ?? 'warning')}`,
                  item,
                )
              }
            />
          </div>

          <div style={terminalColumnStyle}>
            <Section
              title={locale === 'zh-CN' ? 'Chart surface' : 'Chart surface'}
              subtitle={
                locale === 'zh-CN'
                  ? '中间工作区只服务当前 symbol、频率、关键位和最近信号。'
                  : 'The center workspace focuses on the current symbol, timeframe, key levels, and recent markers.'
              }
            >
              {!chartContext ? (
                <div style={utilityStyles.emptyState}>
                  {locale === 'zh-CN'
                    ? '当前没有可用的 chart context。'
                    : 'No chart context is available right now.'}
                </div>
              ) : (
                <div style={denseListStyle}>
                  <div style={chartHeroStyle}>
                    <div style={chartHeroHeaderStyle}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={chromeStyles.eyebrowLight}>
                          {locale === 'zh-CN' ? '当前标的' : 'Current symbol'}
                        </div>
                        <div style={chartTickerStyle}>{chartContext.symbol || 'N/A'}</div>
                        <div style={chromeStyles.quietMeta}>
                          {chartContext.freq} · {chartContext.latest_signal || 'No signal'}
                        </div>
                      </div>
                      <span style={statusBadgeStyle(signalTone(chartContext.latest_signal))}>
                        {chartContext.latest_signal || (locale === 'zh-CN' ? '观察中' : 'Watching')}
                      </span>
                    </div>
                    <div style={chartStatGridStyle}>
                      <div style={chartStatCardStyle}>
                        <div style={chromeStyles.eyebrowLight}>
                          {locale === 'zh-CN' ? '最近收盘' : 'Latest close'}
                        </div>
                        <div style={{ fontWeight: 700, color: palette.ink }}>
                          {String(
                            chartContext.ohlcv_preview[chartContext.ohlcv_preview.length - 1]
                              ?.close ?? 'N/A',
                          )}
                        </div>
                      </div>
                      <div style={chartStatCardStyle}>
                        <div style={chromeStyles.eyebrowLight}>
                          {locale === 'zh-CN' ? '关键位' : 'Key levels'}
                        </div>
                        <div style={{ fontWeight: 700, color: palette.ink }}>
                          {chartContext.key_levels.length}
                        </div>
                      </div>
                      <div style={chartStatCardStyle}>
                        <div style={chromeStyles.eyebrowLight}>
                          {locale === 'zh-CN' ? '信号点' : 'Markers'}
                        </div>
                        <div style={{ fontWeight: 700, color: palette.ink }}>
                          {chartContext.signal_markers.length}
                        </div>
                      </div>
                    </div>
                    {chartContext.conclusion ? (
                      <div style={utilityStyles.noticeBanner}>{chartContext.conclusion}</div>
                    ) : null}
                    <div style={chartBarsStyle}>
                      {chartContext.ohlcv_preview.slice(-8).map(bar => (
                        <div key={bar.time} style={chartBarCardStyle}>
                          <div style={chromeStyles.quietMeta}>{String(bar.time)}</div>
                          <div style={{ fontWeight: 600, color: palette.ink }}>{bar.close}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Section>
            <PackListSection
              locale={locale}
              title={locale === 'zh-CN' ? '关键位' : 'Key levels'}
              subtitle={
                locale === 'zh-CN'
                  ? '支撑、压力和位置关系。'
                  : 'Support, resistance, and relative positioning.'
              }
              rows={(chartContext?.key_levels ?? []) as Array<Record<string, unknown>>}
              onOpen={item => onOpenRecord(`Level ${String(item.name ?? 'level')}`, item)}
            />
          </div>

          <div style={terminalColumnStyle}>
            <PackListSection
              locale={locale}
              title={locale === 'zh-CN' ? 'Signal inspector' : 'Signal inspector'}
              subtitle={
                locale === 'zh-CN'
                  ? '右侧检查最近买卖点、置信度和 review 入口。'
                  : 'Inspect recent markers, confidence, and review entry points on the right.'
              }
              rows={(chartContext?.signal_markers ?? []) as Array<Record<string, unknown>>}
              onOpen={item => onOpenRecord(`Signal ${String(item.type ?? 'signal')}`, item)}
            />
            <PackListSection
              locale={locale}
              title={t(locale, 'section.pack.signals.review_runs.title')}
              subtitle={
                locale === 'zh-CN'
                  ? '把 review run 当成图表侧边检查器。'
                  : 'Keep review runs as the side inspector feed.'
              }
              rows={dashboard.review_runs as Array<Record<string, unknown>>}
              onOpen={run => {
                void onOpenRun(run as LongclawRun)
              }}
            />
            <Section
              title={locale === 'zh-CN' ? '深链入口' : 'Deep links'}
              subtitle={
                locale === 'zh-CN'
                  ? '完整分析保留为原生外跳入口，不嵌网页。'
                  : 'Full-fidelity analysis remains a native escape hatch, not an embedded web page.'
              }
            >
              <div style={denseListStyle}>
                {dashboard.deep_links.length === 0 ? (
                  <div style={utilityStyles.emptyState}>
                    {locale === 'zh-CN' ? '当前没有可用深链。' : 'No deep links are available.'}
                  </div>
                ) : (
                  dashboard.deep_links.map(link => (
                    <div key={link.link_id} style={surfaceStyles.listRow}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                        <div style={{ fontWeight: 600, color: palette.ink }}>{link.label}</div>
                        <div style={chromeStyles.monoMeta}>{link.url}</div>
                      </div>
                      <button
                        type="button"
                        style={segmentedButtonStyle(false)}
                        onClick={() =>
                          onOpenRecord(link.label, link as unknown as Record<string, unknown>)
                        }
                      >
                        {locale === 'zh-CN' ? '查看' : 'Inspect'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Section>
          </div>
        </div>
      )}

      {panel === 'review' && (
        <>
          <PackListSection
            locale={locale}
            title={t(locale, 'section.pack.signals.review_runs.title')}
            subtitle={t(locale, 'section.pack.signals.review_runs.subtitle')}
            rows={dashboard.review_runs as Array<Record<string, unknown>>}
            onOpen={run => {
              void onOpenRun(run as LongclawRun)
            }}
          />
          <PackListSection
            locale={locale}
            title={t(locale, 'section.pack.signals.recent_runs.title')}
            subtitle={t(locale, 'section.pack.signals.recent_runs.subtitle')}
            rows={dashboard.recent_runs as Array<Record<string, unknown>>}
            onOpen={run => {
              void onOpenRun(run as LongclawRun)
            }}
          />
        </>
      )}

      {panel === 'backtest' && (
        <>
          <Section
            title={t(locale, 'section.pack.signals.backtest_backlog.title')}
            subtitle={t(locale, 'section.pack.signals.backtest_backlog.subtitle')}
          >
            <StatusStrip
              locale={locale}
              items={[
                { label: t(locale, 'label.total'), value: dashboard.backtest_summary.total },
                {
                  label: t(locale, 'label.evaluated'),
                  value: dashboard.backtest_summary.evaluated,
                  tone: 'success',
                },
                {
                  label: t(locale, 'label.pending'),
                  value: dashboard.backtest_summary.pending,
                  tone: 'needs_review',
                },
              ]}
            />
            <div style={{ ...denseListStyle, marginTop: 12 }}>
              {dashboard.pending_backlog_preview.length === 0 ? (
                <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_backlog')}</div>
              ) : (
                dashboard.pending_backlog_preview.map(item => (
                  <div
                    key={`${item.symbol}-${item.signal_date}-${item.signal_type}`}
                    style={surfaceStyles.listRow}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: palette.ink }}>{item.symbol}</div>
                      <div style={chromeStyles.quietMeta}>
                        {item.signal_type} · {item.freq}
                      </div>
                    </div>
                    <div style={chromeStyles.monoMeta}>{item.signal_date}</div>
                  </div>
                ))
              )}
            </div>
          </Section>
          <PackListSection
            locale={locale}
            title={locale === 'zh-CN' ? '回测作业' : 'Backtest jobs'}
            subtitle={
              locale === 'zh-CN'
                ? '来自 Signals canonical 分析和本地运行记录的回测摘要。'
                : 'Backtest summaries from Signals canonical analysis and local runs.'
            }
            rows={dashboard.backtest_jobs as Array<Record<string, unknown>>}
            onOpen={item =>
              onOpenRecord(
                locale === 'zh-CN'
                  ? `回测 ${String(item.job_id ?? '任务')}`
                  : `Backtest ${String(item.job_id ?? 'job')}`,
                item,
              )
            }
          />
        </>
      )}

      {panel === 'connectors' && (
        <>
          <PackListSection
            locale={locale}
            title={t(locale, 'section.pack.signals.connector_health.title')}
            subtitle={t(locale, 'section.pack.signals.connector_health.subtitle')}
            rows={dashboard.connector_health as Array<Record<string, unknown>>}
            onOpen={item =>
              onOpenRecord(
                locale === 'zh-CN'
                  ? `连接器 ${humanizeTokenLocale(locale, String(item.connector_id ?? 'record'))}`
                  : `Connector ${String(item.connector_id ?? 'record')}`,
                item,
              )
            }
          />
          <Section
            title={locale === 'zh-CN' ? '深链入口' : 'Deep links'}
            subtitle={
              locale === 'zh-CN'
                ? '完整能力仍通过状态和入口联动，不嵌入网页。'
                : 'Full-fidelity escape hatches remain links, not embedded pages.'
            }
          >
            <div style={denseListStyle}>
              {dashboard.deep_links.length === 0 ? (
                <div style={utilityStyles.emptyState}>
                  {locale === 'zh-CN' ? '当前没有可用深链。' : 'No deep links are available.'}
                </div>
              ) : (
                dashboard.deep_links.map(link => (
                  <div key={link.link_id} style={surfaceStyles.listRow}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={{ fontWeight: 600, color: palette.ink }}>{link.label}</div>
                      <div style={chromeStyles.monoMeta}>{link.url}</div>
                    </div>
                    <button
                      type="button"
                      style={segmentedButtonStyle(false)}
                      onClick={() =>
                        onOpenRecord(link.label, link as unknown as Record<string, unknown>)
                      }
                    >
                      {locale === 'zh-CN' ? '查看' : 'Inspect'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  )
}

export type SignalsStrategyVM = Pick<
  SignalsDashboard,
  | 'overview'
  | 'buy_candidates'
  | 'sell_warnings'
  | 'chart_context'
  | 'review_runs'
  | 'connector_health'
  | 'deep_links'
>

export type SignalsBacktestVM = Pick<
  SignalsDashboard,
  'backtest_summary' | 'backtest_jobs' | 'pending_backlog_preview' | 'review_runs' | 'buy_candidates'
>

export type SignalsFactoryVM = Pick<
  SignalsDashboard,
  'diagnostics' | 'connector_health' | 'deep_links'
>

export type FactoryVM = SignalsFactoryVM

function toSignalsStrategyVM(dashboard: SignalsDashboard): SignalsStrategyVM {
  return {
    overview: dashboard.overview,
    buy_candidates: dashboard.buy_candidates,
    sell_warnings: dashboard.sell_warnings,
    chart_context: dashboard.chart_context,
    review_runs: dashboard.review_runs,
    connector_health: dashboard.connector_health,
    deep_links: dashboard.deep_links,
  }
}

function toSignalsBacktestVM(dashboard: SignalsDashboard): SignalsBacktestVM {
  return {
    backtest_summary: dashboard.backtest_summary,
    backtest_jobs: dashboard.backtest_jobs,
    pending_backlog_preview: dashboard.pending_backlog_preview,
    review_runs: dashboard.review_runs,
    buy_candidates: dashboard.buy_candidates,
  }
}

function toSignalsFactoryVM(dashboard: SignalsDashboard): SignalsFactoryVM {
  return {
    diagnostics: dashboard.diagnostics,
    connector_health: dashboard.connector_health,
    deep_links: dashboard.deep_links,
  }
}

function SignalsStrategyView({
  locale,
  dashboard,
  signalsWebBaseUrl,
  onOpenRecord,
}: {
  locale: LongclawLocale
  dashboard: SignalsStrategyVM
  signalsWebBaseUrl?: string
  onOpenRecord: (
    title: string,
    record: Record<string, unknown>,
    actions?: LongclawOperatorAction[],
  ) => void
}) {
  return (
    <StrategyChartTerminal
      locale={locale}
      dashboard={dashboard}
      signalsWebBaseUrl={signalsWebBaseUrl}
      onOpenRecord={onOpenRecord}
    />
  )
}

function SignalsBacktestView({
  locale,
  dashboard,
  signalsWebBaseUrl,
  onOpenRun,
  onOpenRecord,
}: {
  locale: LongclawLocale
  dashboard: SignalsBacktestVM
  signalsWebBaseUrl?: string
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (
    title: string,
    record: Record<string, unknown>,
    actions?: LongclawOperatorAction[],
  ) => void
}) {
  return (
    <BacktestWorkbench
      locale={locale}
      dashboard={dashboard}
      signalsWebBaseUrl={signalsWebBaseUrl}
      onOpenRun={onOpenRun}
      onOpenRecord={onOpenRecord}
    />
  )
}

function SignalsFactoryView({
  locale,
  dashboard,
  onOpenRecord,
}: {
  locale: LongclawLocale
  dashboard: SignalsFactoryVM
  onOpenRecord: (
    title: string,
    record: Record<string, unknown>,
    actions?: LongclawOperatorAction[],
  ) => void
}) {
  return (
    <div style={packGridStyle}>
      <RuntimeDiagnostics locale={locale} diagnostics={dashboard.diagnostics} />
      <PackListSection
        locale={locale}
        title={t(locale, 'section.pack.signals.connector_health.title')}
        subtitle={t(locale, 'section.pack.signals.connector_health.subtitle')}
        rows={dashboard.connector_health as Array<Record<string, unknown>>}
        onOpen={item =>
          onOpenRecord(
            locale === 'zh-CN'
              ? `连接器 ${humanizeTokenLocale(locale, String(item.connector_id ?? 'record'))}`
              : `Connector ${String(item.connector_id ?? 'record')}`,
            item,
          )
        }
      />
      <Section
        title={locale === 'zh-CN' ? '深链入口' : 'Deep links'}
        subtitle={
          locale === 'zh-CN'
            ? '完整能力仍通过状态和入口联动，不嵌入网页。'
            : 'Full-fidelity escape hatches remain links, not embedded pages.'
        }
      >
        <div style={denseListStyle}>
          {dashboard.deep_links.length === 0 ? (
            <div style={utilityStyles.emptyState}>
              {locale === 'zh-CN' ? '当前没有可用深链。' : 'No deep links are available.'}
            </div>
          ) : (
            dashboard.deep_links.map(link => (
              <div key={link.link_id} style={surfaceStyles.listRow}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: palette.ink }}>{link.label}</div>
                  <div style={chromeStyles.monoMeta}>{link.url}</div>
                </div>
                <button
                  type="button"
                  style={segmentedButtonStyle(false)}
                  onClick={() =>
                    onOpenRecord(link.label, link as unknown as Record<string, unknown>)
                  }
                >
                  {locale === 'zh-CN' ? '查看' : 'Inspect'}
                </button>
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  )
}

export function PackWorkspace({
  locale,
  surface,
  dashboard,
  signalsWebBaseUrl,
  localizedNotice,
  onRunAction,
  onOpenRun,
  onOpenRecord,
}: PackWorkspaceProps) {
  const isExecutionSurface = surface === 'execution'
  const normalizedDashboard = isExecutionSurface
    ? normalizeDueDashboard(dashboard, locale)
    : normalizeSignalsDashboard(dashboard, locale)
  const headerTitle =
    surface === 'strategy'
      ? t(locale, 'page.strategy.title')
      : surface === 'backtest'
        ? t(locale, 'page.backtest.title')
        : surface === 'factory'
          ? t(locale, 'page.plugins.title')
          : t(locale, 'page.execution.title')
  const headerSubtitle =
    surface === 'strategy'
      ? locale === 'zh-CN'
        ? '策略页围绕 chart、观察列表、买卖点和轻量连接器摘要来组织。'
        : 'Strategy is organized around charts, watchlists, signals, and a light connector summary.'
      : surface === 'backtest'
        ? locale === 'zh-CN'
          ? '回测页只承接 Signals canonical 回测、输入候选和作业列表。'
          : 'Backtest only carries Signals canonical backtests, input queues, and jobs.'
        : surface === 'factory'
          ? locale === 'zh-CN'
            ? '插件页承接连接器详情、运行诊断、能力底座和可复用能力治理。'
            : 'Plugins carries connector diagnostics, capability substrate state, and reusable capability governance.'
          : locale === 'zh-CN'
            ? '执行页服务 RPA 控制台、确认边界、失败修复与交接。'
            : 'Execution serves the RPA console, confirmation boundaries, repair, and handoff.'
  const actions = normalizePackRows(
    ('operator_actions' in normalizedDashboard
      ? normalizedDashboard.operator_actions
      : []) as LongclawOperatorAction[],
  )

  if (surface === 'strategy') {
    return (
      <div style={strategyPackShellStyle}>
        <SignalsStrategyView
          locale={locale}
          dashboard={toSignalsStrategyVM(normalizedDashboard as SignalsDashboard)}
          signalsWebBaseUrl={signalsWebBaseUrl}
          onOpenRecord={onOpenRecord}
        />
      </div>
    )
  }

  if (surface === 'backtest') {
    return (
      <div style={strategyPackShellStyle}>
        <SignalsBacktestView
          locale={locale}
          dashboard={toSignalsBacktestVM(normalizedDashboard as SignalsDashboard)}
          signalsWebBaseUrl={signalsWebBaseUrl}
          onOpenRun={onOpenRun}
          onOpenRecord={onOpenRecord}
        />
      </div>
    )
  }

  return (
    <Section
      title={headerTitle}
      subtitle={headerSubtitle}
      actions={actions.length > 0 ? <ActionButtons actions={actions} onRun={onRunAction} /> : undefined}
    >
      {localizedNotice || normalizedDashboard.notice ? (
        <div style={{ ...utilityStyles.warningBanner, marginBottom: 12 }}>
          {localizedNotice || normalizedDashboard.notice}
        </div>
      ) : null}
      {surface === 'execution' ? (
        <DueDiligencePackView
          locale={locale}
          dashboard={normalizedDashboard as DueDiligenceDashboard}
          onOpenRun={onOpenRun}
          onOpenRecord={onOpenRecord}
        />
      ) : surface === 'strategy' ? (
        <SignalsStrategyView
          locale={locale}
          dashboard={toSignalsStrategyVM(normalizedDashboard as SignalsDashboard)}
          signalsWebBaseUrl={signalsWebBaseUrl}
          onOpenRecord={onOpenRecord}
        />
      ) : surface === 'backtest' ? (
        <SignalsBacktestView
          locale={locale}
          dashboard={toSignalsBacktestVM(normalizedDashboard as SignalsDashboard)}
          signalsWebBaseUrl={signalsWebBaseUrl}
          onOpenRun={onOpenRun}
          onOpenRecord={onOpenRecord}
        />
      ) : (
        <SignalsFactoryView
          locale={locale}
          dashboard={toSignalsFactoryVM(normalizedDashboard as SignalsDashboard)}
          onOpenRecord={onOpenRecord}
        />
      )}
    </Section>
  )
}
