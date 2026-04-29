import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  dispose,
  init,
  IndicatorSeries,
  registerIndicator,
  registerOverlay,
  type Chart,
  type DeepPartial,
  type IndicatorStyle,
  type KLineData,
  type OverlayCreateFiguresCallbackParams,
  type Styles,
} from 'klinecharts'

import type { SignalsDashboard } from '../../../../src/services/longclawControlPlane/models.js'
import { fontStacks, interaction, motion, palette, statusBadgeStyle, tradingDeskTheme } from '../designSystem.js'
import { type LongclawLocale, humanizeTokenLocale, localizeSystemText } from '../i18n.js'
import { observedFetchJson, recordObservationEvent } from '../observation.js'
import { tagsForWatchlist } from './StrategyChartTags.js'

type StrategyDashboard = Pick<
  SignalsDashboard,
  | 'buy_candidates'
  | 'sell_warnings'
  | 'chart_context'
  | 'review_runs'
  | 'connector_health'
  | 'deep_links'
  | 'daily_brief'
  | 'decision_queue'
  | 'strategy_kpis'
  | 'source_confidence'
  | 'cache_status'
>

type StrategyChartTerminalProps = {
  locale: LongclawLocale
  dashboard: StrategyDashboard
  signalsWebBaseUrl?: string
  onOpenRecord: (title: string, record: Record<string, unknown>) => void
}

type WorkbenchSession = {
  ready?: boolean
  running?: boolean
  label?: string
  mode?: string
  a_live?: boolean
  hk_live?: boolean
  us_live?: boolean
  active_markets?: string[]
  market_timezone?: string
  data_as_of?: string
  next_refresh_at?: string
  error?: string
}

type WorkbenchShell = {
  session?: WorkbenchSession
  indices?: Record<string, unknown>[]
  buy_candidates?: Record<string, unknown>[]
  watchlist?: Record<string, unknown>[]
  watchlist_groups?: {
    macro_indices?: Record<string, unknown>[]
    sector_boards?: Record<string, unknown>[]
    buy_candidates?: Record<string, unknown>[]
    focus_stocks?: Record<string, unknown>[]
    risk_stocks?: Record<string, unknown>[]
    watch_stocks?: Record<string, unknown>[]
  }
  watchlist_groups_meta?: Record<string, unknown>
  kline_cache_coverage?: Record<string, unknown>
  watchlist_range_columns?: Record<string, unknown>[]
  cluster_summary?: Record<string, unknown>
  sync_lanes?: Record<string, unknown>
  decision_queue?: Record<string, unknown>[]
  strategy_kpis?: Record<string, unknown>[] | Record<string, unknown>
  source_confidence?: Record<string, unknown>[] | Record<string, unknown>
  default_target?: {
    kind?: string
    label?: string
    freq?: string
  }
  notices?: string[]
}

type WorkbenchTarget = {
  kind?: string
  label?: string
  symbol?: string
  requested_freq?: string
  effective_freq?: string
  available_freqs?: string[]
  carrier_kind?: string
  carrier_symbol?: string
  market?: string
  market_timezone?: string
}

type StrategySignal = {
  dt?: number
  time?: number
  timestamp?: number
  date_str?: string
  signal_date?: string
  type?: string
  signal_type?: string
  price?: number
  confidence?: number
  freq?: string
  details?: string
  source?: string
  pool_status?: string
  chart_aligned?: boolean
  symbol?: string
  name?: string
  relation?: string
  target_kind?: string
}

type StrategyKeyLevel = {
  name?: string
  value?: number
  position?: string
  distance_pct?: number | null
  direction?: string
  role?: string
  timeframe?: string
}

type WorkbenchSymbolData = {
  target?: WorkbenchTarget
  chart?: Record<string, unknown>
  summary?: Record<string, unknown>
  signals?: StrategySignal[]
  plan?: Record<string, unknown> | null
  review?: Record<string, unknown>
  trade?: Record<string, unknown>
  analysis_target?: string
  candidate_groups?: Record<string, unknown>
  candidate_stocks?: Record<string, unknown>[]
  stock_analysis?: Record<string, unknown>
  custom_signal_count?: number
  direct_custom_signal_count?: number
  visible_custom_signal_count?: number
  hidden_custom_signal_count?: number
  available_custom_signal_freqs?: string[]
  hidden_reasons?: string[]
  related_custom_signals?: StrategySignal[]
}

type ChartTarget = {
  label: string
  kind: string
  freq: string
}

type FrequencyOption = {
  value: string
  label: string
}

type WatchlistRangeColumn = {
  key: string
  label: string
  aliases?: string[]
}

type WatchlistSignalBadge = {
  label: string
  side: 'buy' | 'sell' | 'neutral'
}

type WatchlistRow = {
  id: string
  kind: string
  label: string
  name: string
  code: string
  typeLabel: string
  latest: string
  dayChange: string
  rangeValues: string[]
  signal: string
  signalBadges: WatchlistSignalBadge[]
  tags: string[]
  lane: string
  freshness: string
  traderAction: string
  invalidatesWhen: string
  explanation: string
  traceSummary: string
  targetKind: string
  targetLabel: string
  targetFreq: string
  raw: Record<string, unknown>
}

type WatchlistTabKey = 'macro_indices' | 'sector_boards' | 'focus_stocks' | 'risk_stocks' | 'watch_stocks' | 'buy_candidates'
type TerminalLayoutMode = 'cinema' | 'desk' | 'balanced' | 'focus'

type ApiError = Error & {
  status?: number
  payload?: Record<string, unknown>
}

type SignalOverlayData = {
  label: string
  side: 'buy' | 'sell' | 'neutral'
  color: string
  isCustom?: boolean
  freq?: string
  sourceLabel?: string
  details?: string
}

type DivergenceOverlayData = {
  label: string
  side: 'top' | 'bottom'
  color: string
  compact?: boolean
}

type MacdPoint = {
  timestamp: number
  dif?: number
  dea?: number
  histogram?: number
}

type PivotPoint = {
  index: number
  timestamp: number
  price: number
  dif: number
  histogram: number
}

type MacdDivergenceSignal = {
  id: string
  type: 'bearish' | 'bullish'
  timestamp: number
  price: number
  previousTimestamp: number
  previousPrice: number
  macdValue: number
  previousMacdValue: number
  confidence: number
  metric: 'dif' | 'histogram'
}

const FREQ_OPTIONS: FrequencyOption[] = [
  { value: '5min', label: '5m' },
  { value: '15min', label: '15m' },
  { value: '30min', label: '30m' },
  { value: 'daily', label: '日' },
  { value: 'weekly', label: '周' },
]
const DEFAULT_TERMINAL_FREQ = '30min'
const DEFAULT_AVAILABLE_FREQS = FREQ_OPTIONS.map(option => option.value)
const WATCHLIST_RANGE_COLUMNS: WatchlistRangeColumn[] = [
  { key: '5d', label: '5日', aliases: ['5d', '5日', 'week', '1w', '1week', 'weekly'] },
  { key: '20d', label: '20日', aliases: ['20d', '20日', 'month', '1m', '1month', 'monthly'] },
  { key: '60d', label: '60日', aliases: ['60d', '60日', 'quarter', '3m', '3month', 'quarterly'] },
]
const SIGNAL_OVERLAY_NAME = 'longclawSignalMarker'
const SIGNAL_OVERLAY_GROUP = 'longclaw-signals'
const DIVERGENCE_OVERLAY_NAME = 'longclawMacdDivergenceMarker'
const DIVERGENCE_OVERLAY_GROUP = 'longclaw-macd-divergence'
const LEVEL_OVERLAY_GROUP = 'longclaw-levels'
const CANDLE_PANE_ID = 'candle_pane'
const MACD_PANE_ID = 'macd_pane'
const MACD_ZERO_INDICATOR_NAME = 'LONGCLAW_MACD_ZERO'
const MACD_PARAMS = [12, 26, 9]
const MAX_CHART_SIGNAL_OVERLAYS = 10
const MAX_CHART_DIVERGENCE_OVERLAYS = 3
const MAX_CHART_LEVEL_OVERLAYS = 4
const MAX_EVIDENCE_SIGNAL_ROWS = 6
const CHART_SIGNAL_LOOKBACK_BARS = 140
const MA_COLORS = [
  tradingDeskTheme.chart.orange,
  tradingDeskTheme.chart.line,
  tradingDeskTheme.chart.violet,
  tradingDeskTheme.market.down,
  tradingDeskTheme.chart.gold,
  tradingDeskTheme.colors.textStrong,
]
const MACD_LINE_COLORS = [tradingDeskTheme.chart.line, tradingDeskTheme.chart.orange]

let signalOverlayRegistered = false
let divergenceOverlayRegistered = false
let macdZeroIndicatorRegistered = false
const terminalTheme = tradingDeskTheme.colors

function terminalLayoutMode(width: number): TerminalLayoutMode {
  if (width >= 1550) return 'cinema'
  if (width >= 1250) return 'desk'
  if (width >= 1050) return 'balanced'
  return 'focus'
}

function terminalCompactMode(mode: TerminalLayoutMode): boolean {
  return mode === 'balanced' || mode === 'focus'
}

function terminalStackedTopBar(mode: TerminalLayoutMode): boolean {
  return mode === 'focus'
}

function chartBarSpaceForMode(mode: TerminalLayoutMode): number {
  if (mode === 'cinema') return 8
  if (mode === 'desk') return 7
  if (mode === 'balanced') return 6
  return 5
}

function chartRightOffsetForMode(mode: TerminalLayoutMode): number {
  if (mode === 'cinema') return 42
  if (mode === 'desk') return 36
  if (mode === 'balanced') return 28
  return 20
}

function solidLineStyle(color: string, size = 1) {
  return { color, size, style: 'solid' as const, dashedValue: [0, 0] }
}

const terminalRootStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  background: terminalTheme.root,
  color: terminalTheme.text,
  fontFamily: fontStacks.ui,
}

function terminalTopBarStyle(mode: TerminalLayoutMode): React.CSSProperties {
  const stacked = terminalStackedTopBar(mode)
  return {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: stacked ? '4px 6px' : 6,
    padding: stacked ? '4px 7px' : '3px 7px',
    borderBottom: `1px solid ${terminalTheme.grid}`,
    background: terminalTheme.panel,
    boxShadow: `inset 0 -1px ${tradingDeskTheme.alpha.textHairline}`,
  }
}

function searchFormStyle(mode: TerminalLayoutMode): React.CSSProperties {
  const stacked = terminalStackedTopBar(mode)
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 1fr) auto',
    gap: 6,
    flex: stacked ? '1 0 100%' : '1 1 330px',
    minWidth: 0,
    maxWidth: mode === 'cinema' ? 540 : stacked ? 'none' : 460,
  }
}

function topBarButtonGroupStyle(mode: TerminalLayoutMode): React.CSSProperties {
  const stacked = terminalStackedTopBar(mode)
  return {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    flex: stacked ? '1 1 220px' : '0 1 auto',
    minWidth: 0,
    justifyContent: 'flex-start',
  }
}

const searchInputStyle: React.CSSProperties = {
  height: 28,
  minWidth: 0,
  border: `1px solid ${terminalTheme.borderStrong}`,
  borderRadius: 5,
  background: terminalTheme.root,
  color: terminalTheme.textStrong,
  padding: '0 8px',
  fontFamily: fontStacks.mono,
  fontSize: 13,
  outline: 'none',
}

function terminalGridLayoutStyle(leftCollapsed: boolean, rightCollapsed: boolean, mode: TerminalLayoutMode): React.CSSProperties {
  const leftExpanded: Record<TerminalLayoutMode, string> = {
    cinema: 'clamp(286px, 17vw, 332px)',
    desk: 'clamp(258px, 18vw, 298px)',
    balanced: 'clamp(224px, 22vw, 256px)',
    focus: 'clamp(214px, 28vw, 242px)',
  }
  const rightExpanded: Record<TerminalLayoutMode, string> = {
    cinema: 'clamp(224px, 14vw, 260px)',
    desk: 'clamp(204px, 15vw, 232px)',
    balanced: 'clamp(188px, 18vw, 210px)',
    focus: 'clamp(178px, 22vw, 196px)',
  }
  const collapsed = mode === 'focus' ? '36px' : '40px'
  const leftColumn = leftCollapsed ? collapsed : leftExpanded[mode]
  const rightColumn = rightCollapsed ? collapsed : rightExpanded[mode]
  return {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: `${leftColumn} minmax(0, 1fr) ${rightColumn}`,
    gridTemplateRows: 'minmax(0, 1fr)',
    gap: 1,
    alignItems: 'stretch',
    minHeight: 0,
    overflow: 'hidden',
    transition: `grid-template-columns ${motion.short}`,
  }
}

const fallbackGridStyle: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: 1,
  minHeight: 0,
  overflow: 'auto',
  background: terminalTheme.grid,
}

const terminalSideStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  background: terminalTheme.grid,
  fontSize: 10,
  scrollbarGutter: 'stable',
}

const collapsedSideStyle: React.CSSProperties = {
  display: 'flex',
  minWidth: 0,
  minHeight: 0,
  alignItems: 'stretch',
  justifyContent: 'center',
  background: terminalTheme.panel,
}

const verticalCollapseButtonStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 0,
  background: terminalTheme.control,
  color: terminalTheme.controlText,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 12,
  fontWeight: 800,
  writingMode: 'vertical-rl',
  letterSpacing: 0,
}

const panelActionButtonStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 4,
  background: terminalTheme.control,
  color: terminalTheme.controlText,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 11,
  fontWeight: 800,
  padding: '2px 6px',
  transition: interaction.transition,
}

const terminalPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  minHeight: 0,
  flexShrink: 0,
  padding: 4,
  border: 'none',
  borderRadius: 0,
  background: terminalTheme.panel,
  color: terminalTheme.text,
  overflow: 'hidden',
  boxShadow: `inset 0 1px ${tradingDeskTheme.alpha.textHairline}`,
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 6,
}

const panelTitleStyle: React.CSSProperties = {
  color: terminalTheme.textStrong,
  fontSize: 10,
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const mutedTextStyle: React.CSSProperties = {
  color: terminalTheme.muted,
  fontSize: 11,
  lineHeight: 1.35,
}

const mutedLineStyle: React.CSSProperties = {
  ...mutedTextStyle,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const mutedTwoLineStyle: React.CSSProperties = {
  ...mutedTextStyle,
  minWidth: 0,
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
}

const monoTextStyle: React.CSSProperties = {
  color: terminalTheme.mono,
  fontFamily: fontStacks.mono,
  fontSize: 11,
  lineHeight: 1.35,
}

const eyebrowDarkStyle: React.CSSProperties = {
  color: terminalTheme.mutedStrong,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
}

const rowTitleStyle: React.CSSProperties = {
  color: terminalTheme.textStrong,
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const dataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.panelSoft,
  padding: '3px 5px',
  minWidth: 0,
  boxShadow: `inset 2px 0 ${tradingDeskTheme.alpha.textHairline}`,
}

const emptyStateDarkStyle: React.CSSProperties = {
  border: `1px dashed ${terminalTheme.borderMuted}`,
  borderRadius: 5,
  background: terminalTheme.empty,
  color: terminalTheme.muted,
  padding: '8px 8px',
  textAlign: 'center',
  fontSize: 11,
}

const noticeDarkStyle: React.CSSProperties = {
  border: `1px solid ${tradingDeskTheme.alpha.infoBorder}`,
  background: tradingDeskTheme.alpha.infoSurface,
  color: terminalTheme.infoText,
  padding: '3px 7px',
  fontSize: 11,
}

const warningDarkStyle: React.CSSProperties = {
  ...noticeDarkStyle,
  border: `1px solid ${tradingDeskTheme.alpha.accentBorder}`,
  background: tradingDeskTheme.alpha.accentSurface,
  color: terminalTheme.accentText,
}

const errorDarkStyle: React.CSSProperties = {
  ...noticeDarkStyle,
  border: `1px solid ${tradingDeskTheme.alpha.errorBorder}`,
  background: tradingDeskTheme.alpha.errorSurface,
  color: terminalTheme.errorText,
}

const cacheMonitorStripStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  padding: '3px 5px 4px',
  borderBottom: `1px solid ${terminalTheme.grid}`,
  background: `linear-gradient(180deg, ${terminalTheme.panelInset}, ${terminalTheme.panel})`,
}

const cacheMonitorToolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  minWidth: 0,
}

const cacheMonitorToolbarTitleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  color: terminalTheme.textStrong,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0,
}

const cacheMonitorToolbarMetaStyle: React.CSSProperties = {
  ...mutedLineStyle,
  fontSize: 9,
  whiteSpace: 'nowrap',
}

function cacheMonitorGridStyle(mode: TerminalLayoutMode): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: mode === 'focus'
      ? 'repeat(2, minmax(0, 1fr))'
      : 'repeat(4, minmax(0, 1fr))',
    gap: 4,
  }
}

const cacheMonitorCellStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
  padding: '4px 5px',
  border: `1px solid ${tradingDeskTheme.alpha.textBorder}`,
  borderRadius: tradingDeskTheme.radius.compact,
  background: `linear-gradient(180deg, ${terminalTheme.panelRaised}, ${terminalTheme.panel})`,
  boxShadow: `inset 0 1px ${tradingDeskTheme.alpha.textHairline}`,
}

const cacheMonitorHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 6,
  minWidth: 0,
}

const cacheMonitorTitleStyle: React.CSSProperties = {
  color: terminalTheme.mutedStrong,
  fontSize: 9,
  fontWeight: 800,
  letterSpacing: 0,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cacheMonitorValueStyle: React.CSSProperties = {
  color: terminalTheme.mono,
  fontFamily: fontStacks.mono,
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1,
  whiteSpace: 'nowrap',
}

const cacheProgressTrackStyle: React.CSSProperties = {
  height: 5,
  overflow: 'hidden',
  borderRadius: tradingDeskTheme.radius.pill,
  background: terminalTheme.panelInset,
  border: `1px solid ${tradingDeskTheme.alpha.textBorder}`,
}

function cacheProgressFillStyle(value: number, color: string): React.CSSProperties {
  return {
    height: '100%',
    width: `${Math.max(0, Math.min(100, value))}%`,
    minWidth: value > 0 ? 3 : 0,
    background: `linear-gradient(90deg, ${color}, rgba(255,255,255,0.72))`,
    transition: `width ${motion.medium}`,
  }
}

const cacheMonitorToplineStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  minWidth: 0,
}

function cacheStatusDotStyle(color: string): React.CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: 999,
    flex: '0 0 auto',
    background: color,
    boxShadow: `0 0 0 2px ${terminalTheme.panelInset}, 0 0 12px ${color}`,
  }
}

const cacheMonitorMetaStyle: React.CSSProperties = {
  ...mutedLineStyle,
  fontSize: 9,
  lineHeight: 1.18,
  minHeight: 12,
}

const cacheMonitorDetailStrongStyle: React.CSSProperties = {
  color: terminalTheme.text,
  fontFamily: fontStacks.mono,
  fontSize: 9,
  fontWeight: 700,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const cacheStatusChipStyle = (color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: 112,
  padding: '2px 6px',
  borderRadius: tradingDeskTheme.radius.pill,
  border: `1px solid ${color}`,
  background: `${color}20`,
  color,
  fontFamily: fontStacks.mono,
  fontSize: 10,
  fontWeight: 800,
  lineHeight: 1.15,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

const compactListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const candidateGroupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 6,
  color: terminalTheme.mutedStrong,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: 'uppercase',
}

const targetButtonStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  padding: '4px 6px',
  textAlign: 'left',
  cursor: 'pointer',
  width: '100%',
  background: terminalTheme.panelSoft,
  color: terminalTheme.text,
  fontFamily: fontStacks.ui,
  fontSize: 11,
  transition: interaction.transition,
}

const watchlistTableStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  overflowX: 'auto',
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 4,
  background: terminalTheme.panelInset,
  boxShadow: `inset 0 1px ${tradingDeskTheme.alpha.textHairline}`,
}

const watchlistGridRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(126px, 1.35fr) 58px 52px 76px repeat(4, 56px)',
  minWidth: 0,
}

const watchlistButtonRowStyle: React.CSSProperties = {
  ...watchlistGridRowStyle,
  width: '100%',
  border: 'none',
  borderRadius: 0,
  background: 'transparent',
  padding: 0,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
}

const watchlistButtonActiveRowStyle: React.CSSProperties = {
  ...watchlistButtonRowStyle,
  background: terminalTheme.accentSoft,
}

const watchlistHeaderCellStyle: React.CSSProperties = {
  padding: '5px 4px',
  borderBottom: `1px solid ${terminalTheme.borderStrong}`,
  color: terminalTheme.mutedStrong,
  fontSize: 10,
  fontWeight: 800,
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const watchlistNameHeaderCellStyle: React.CSSProperties = {
  ...watchlistHeaderCellStyle,
  textAlign: 'left',
  paddingLeft: 6,
}

const watchlistCellStyle: React.CSSProperties = {
  minWidth: 0,
  padding: '5px 4px',
  borderBottom: `1px solid ${terminalTheme.borderMuted}`,
  color: terminalTheme.text,
  fontFamily: fontStacks.mono,
  fontSize: 11,
  lineHeight: 1.2,
  textAlign: 'right',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const watchlistNameCellStyle: React.CSSProperties = {
  ...watchlistCellStyle,
  textAlign: 'left',
  fontFamily: fontStacks.ui,
  paddingLeft: 6,
}

const watchlistNameStyle: React.CSSProperties = {
  color: terminalTheme.textStrong,
  fontSize: 12,
  fontWeight: 750,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const watchlistSubStyle: React.CSSProperties = {
  color: terminalTheme.muted,
  fontFamily: fontStacks.mono,
  fontSize: 10,
  marginTop: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const indicatorLegendStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '3px 6px',
  alignItems: 'center',
  color: terminalTheme.muted,
  fontFamily: fontStacks.mono,
  fontSize: 9,
  lineHeight: 1.2,
  maxHeight: 28,
  overflow: 'hidden',
}

const indicatorLegendItemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  whiteSpace: 'nowrap',
}

const watchlistTabsStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 4,
  minWidth: 252,
  flex: '1 1 252px',
}

const watchlistControlRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  flexWrap: 'wrap',
  gap: 6,
  minWidth: 0,
}

const chainVizShellStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.panelInset,
  padding: 6,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
}

const chainVizGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(148px, 1fr))',
  gap: 5,
}

const chainVizNodeStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.borderMuted}`,
  borderRadius: 5,
  background: terminalTheme.panelSoft,
  color: terminalTheme.text,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  padding: 6,
  minWidth: 0,
  textAlign: 'left',
}

const chainVizNodeActiveStyle: React.CSSProperties = {
  ...chainVizNodeStyle,
  border: `1px solid ${terminalTheme.accent}`,
  background: terminalTheme.accentSoft,
}

const chainVizTopLineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
}

const chainVizTitleStyle: React.CSSProperties = {
  color: terminalTheme.textStrong,
  fontSize: 11,
  fontWeight: 800,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const chainVizMetricStyle: React.CSSProperties = {
  fontFamily: fontStacks.mono,
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: 'nowrap',
}

const chainVizMetaStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 4,
  marginTop: 5,
  minWidth: 0,
}

const chainVizChipStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.borderMuted}`,
  borderRadius: 4,
  padding: '1px 4px',
  color: terminalTheme.mutedStrong,
  fontFamily: fontStacks.mono,
  fontSize: 9,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const chainVizMapStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 12px minmax(0, 0.8fr) 12px minmax(0, 1.2fr)',
  alignItems: 'center',
  gap: 3,
  marginTop: 6,
  minWidth: 0,
}

const chainVizNodePillStyle: React.CSSProperties = {
  ...chainVizChipStyle,
  color: terminalTheme.text,
  borderColor: terminalTheme.borderMuted,
  background: tradingDeskTheme.alpha.textHairline,
}

const chainVizDomainRailStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 3,
  minWidth: 0,
  overflow: 'hidden',
}

const chainVizConnectorStyle: React.CSSProperties = {
  height: 1,
  minWidth: 10,
  background: terminalTheme.borderMuted,
}

const chainVizBarTrackStyle: React.CSSProperties = {
  height: 4,
  borderRadius: 2,
  marginTop: 6,
  background: tradingDeskTheme.alpha.textHairline,
  overflow: 'hidden',
}

const chainVizBarStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 2,
}

const watchlistTabButtonStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.control,
  color: terminalTheme.controlText,
  height: 28,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 11,
  fontWeight: 800,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const watchlistTabButtonActiveStyle: React.CSSProperties = {
  ...watchlistTabButtonStyle,
  border: `1px solid ${terminalTheme.accent}`,
  background: terminalTheme.accentSoft,
  color: terminalTheme.accentText,
}

const watchlistRangeSelectLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flex: '1 1 176px',
  minWidth: 0,
  color: terminalTheme.mutedStrong,
  fontFamily: fontStacks.ui,
  fontSize: 10,
  fontWeight: 800,
}

const watchlistRangeSelectStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 120,
  maxWidth: 170,
  height: 28,
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.control,
  color: terminalTheme.controlText,
  fontFamily: fontStacks.ui,
  fontSize: 11,
  fontWeight: 800,
  outline: 'none',
}

const signalBadgeRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 3,
  justifyContent: 'flex-end',
  alignItems: 'center',
  minWidth: 0,
  overflow: 'hidden',
}

const miniSignalBadgeStyle: React.CSSProperties = {
  border: `1px solid ${tradingDeskTheme.alpha.infoBorder}`,
  borderRadius: 3,
  background: tradingDeskTheme.alpha.infoSurface,
  color: terminalTheme.infoText,
  padding: '1px 3px',
  fontFamily: fontStacks.mono,
  fontSize: 9,
  lineHeight: 1.2,
  fontWeight: 800,
}

const miniSellSignalBadgeStyle: React.CSSProperties = {
  ...miniSignalBadgeStyle,
  border: `1px solid ${tradingDeskTheme.alpha.errorBorder}`,
  background: tradingDeskTheme.alpha.errorSurface,
  color: tradingDeskTheme.market.down,
}

const miniNeutralSignalBadgeStyle: React.CSSProperties = {
  ...miniSignalBadgeStyle,
  border: `1px solid ${terminalTheme.borderStrong}`,
  background: terminalTheme.surfaceSoft,
  color: terminalTheme.textMuted,
}

const indicatorLegendSwatchStyle: React.CSSProperties = {
  width: 14,
  height: 2,
  borderRadius: 1,
  background: terminalTheme.muted,
}

const chartStageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 3,
  minWidth: 0,
  minHeight: 0,
  padding: 5,
  border: 'none',
  borderRadius: 0,
  background: terminalTheme.root,
  overflow: 'hidden',
  boxShadow: `inset 0 1px ${tradingDeskTheme.alpha.textHairline}`,
}

const chartHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 6,
  flexWrap: 'wrap',
  minWidth: 0,
}

function chartTitleStyle(mode: TerminalLayoutMode): React.CSSProperties {
  return {
    color: terminalTheme.textStrong,
    fontSize: mode === 'focus' ? 13 : mode === 'cinema' ? 15 : 14,
    lineHeight: 1.1,
    fontWeight: 800,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

const chartSubtitleStyle: React.CSSProperties = {
  ...mutedTextStyle,
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 10,
}

const chartMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 6,
}

function chartHeaderRightStyle(mode: TerminalLayoutMode): React.CSSProperties {
  const compact = terminalCompactMode(mode)
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 6,
    justifyContent: compact ? 'space-between' : 'flex-end',
    flexWrap: 'wrap',
    flex: compact ? '1 1 100%' : '0 1 300px',
    minWidth: 0,
    maxWidth: compact ? '100%' : 'min(100%, 300px)',
  }
}

function headerMetricsStyle(mode: TerminalLayoutMode): React.CSSProperties {
  return {
    display: 'grid',
    gridTemplateColumns: mode === 'focus'
      ? 'repeat(3, minmax(42px, 1fr))'
      : mode === 'balanced'
        ? 'repeat(3, minmax(46px, 60px))'
        : 'repeat(3, minmax(48px, 64px))',
    gap: 4,
    minWidth: mode === 'focus' ? 0 : undefined,
    flex: mode === 'focus' ? '1 1 180px' : '0 0 auto',
  }
}

const headerMetricStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 4,
  background: terminalTheme.panelInset,
  padding: '2px 4px',
  minWidth: 0,
}

const headerMetricValueStyle: React.CSSProperties = {
  color: terminalTheme.textStrong,
  fontWeight: 800,
  fontSize: 10,
  lineHeight: 1.12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
}

const chartConclusionStyle: React.CSSProperties = {
  ...noticeDarkStyle,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
}

const chartCanvasShellStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: 0,
  flex: 1,
  overflow: 'hidden',
  border: `1px solid ${terminalTheme.chartBorder}`,
  borderRadius: 3,
  background: terminalTheme.chartPanel,
  boxShadow: tradingDeskTheme.shadows.glow,
}

const chartCanvasStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  minHeight: 0,
}

const chartOverlayMessageStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 18,
  color: terminalTheme.text,
  textAlign: 'center',
  background: 'rgba(8, 11, 18, 0.88)',
  zIndex: 2,
}

const signalRowStyle: React.CSSProperties = {
  display: 'flex',
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.panelSoft,
  padding: '4px 6px',
  alignItems: 'center',
  minWidth: 0,
}

const signalBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  padding: '4px 0 2px',
  borderTop: `1px solid ${terminalTheme.borderMuted}`,
}

const customSignalBadgeStyle: React.CSSProperties = {
  ...miniNeutralSignalBadgeStyle,
  border: `1px solid ${tradingDeskTheme.chart.line}`,
  background: 'rgba(14, 116, 144, 0.18)',
  color: tradingDeskTheme.chart.line,
}

const quickChipStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.borderStrong}`,
  borderRadius: 5,
  background: terminalTheme.control,
  color: terminalTheme.controlText,
  padding: '5px 7px',
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 13,
  fontWeight: 600,
  justifyContent: 'center',
  minHeight: 26,
}

const quickChipActiveStyle: React.CSSProperties = {
  ...quickChipStyle,
  border: `1px solid ${terminalTheme.accent}`,
  background: terminalTheme.accentSoft,
  color: terminalTheme.accentText,
  justifyContent: 'center',
  minHeight: 26,
}

function terminalButtonStyle(active = false, disabled = false): React.CSSProperties {
  return {
    height: 28,
    minWidth: 42,
    border: `1px solid ${active ? terminalTheme.accent : terminalTheme.borderStrong}`,
    borderRadius: 5,
    background: active ? terminalTheme.accentSoft : terminalTheme.control,
    color: active ? terminalTheme.accentText : terminalTheme.controlText,
    padding: '0 9px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: fontStacks.ui,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
    flex: '0 0 auto',
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function compactText(value: unknown, fallback = ''): string {
  return stringValue(value) ?? (typeof value === 'number' ? String(value) : fallback)
}

function percentValue(value: unknown): number {
  const parsed = numberValue(value)
  if (parsed === undefined) return 0
  return Math.max(0, Math.min(100, parsed))
}

function countText(value: unknown): string {
  const parsed = numberValue(value)
  return parsed === undefined ? '0' : Math.round(parsed).toLocaleString()
}

function compactDuration(value: unknown, locale: LongclawLocale): string {
  const seconds = numberValue(value)
  if (seconds === undefined || seconds <= 0) return ''
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return locale === 'zh-CN' ? `ETA ${minutes}分` : `ETA ${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return locale === 'zh-CN' ? `ETA ${hours}时${rest}分` : `ETA ${hours}h ${rest}m`
}

function compactClock(value: unknown, locale: LongclawLocale): string {
  const text = compactText(value)
  if (!text) return ''
  const dt = new Date(text)
  if (Number.isNaN(dt.getTime())) return text.slice(11, 16)
  return dt.toLocaleTimeString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: locale === 'zh-CN' ? 'Asia/Shanghai' : undefined,
  })
}

function firstRecord(rows: Record<string, unknown>[], key: string, value: string): Record<string, unknown> {
  return rows.find(row => compactText(row[key]) === value) ?? {}
}

function normalizeCacheStatus(value: StrategyDashboard['cache_status'] | undefined): StrategyDashboard['cache_status'] {
  const cacheStatus = recordValue(value)
  const postmarketBackfill = recordValue(cacheStatus.postmarket_backfill)
  const mongoStockCache = recordValue(cacheStatus.mongo_stock_cache)
  return {
    available: Boolean(cacheStatus.available),
    mode: compactText(cacheStatus.mode, 'unavailable'),
    updated_at: compactText(cacheStatus.updated_at),
    trade_date: compactText(cacheStatus.trade_date),
    error: compactText(cacheStatus.error),
    live_low_latency: {
      modules: Array.isArray(recordValue(cacheStatus.live_low_latency).modules)
        ? recordValue(cacheStatus.live_low_latency).modules
        : [],
      summary: recordValue(recordValue(cacheStatus.live_low_latency).summary),
    },
    postmarket_backfill: {
      run: postmarketBackfill.run ?? null,
      tasks: Array.isArray(postmarketBackfill.tasks) ? postmarketBackfill.tasks : [],
      summary: recordValue(postmarketBackfill.summary),
    },
    mongo_stock_cache: {
      freqs: Array.isArray(mongoStockCache.freqs) ? mongoStockCache.freqs : [],
      summary: recordValue(mongoStockCache.summary),
    },
    terminal_outputs: Array.isArray(cacheStatus.terminal_outputs) ? cacheStatus.terminal_outputs : [],
    provider_health: Array.isArray(cacheStatus.provider_health) ? cacheStatus.provider_health : [],
    blockers: Array.isArray(cacheStatus.blockers) ? cacheStatus.blockers : [],
  }
}

function cacheProgressColor(value: number, status?: unknown): string {
  const normalized = compactText(status).toLowerCase()
  if (normalized.includes('error') || normalized.includes('degraded') || normalized.includes('stale')) {
    return palette.error
  }
  if (normalized.includes('running') || normalized.includes('partial')) return tradingDeskTheme.colors.auroraGold
  if (value < 100) return tradingDeskTheme.colors.auroraBlue
  return palette.success
}

function liveCacheStrictStatus(cacheStatus: StrategyDashboard['cache_status']): 'ok' | 'partial' | 'degraded' {
  if (!cacheStatus.available) return 'degraded'
  const summary = recordValue(cacheStatus.live_low_latency.summary)
  const explicit = compactText(summary.strict_status).toLowerCase()
  const ok = numberValue(summary.ok_modules) ?? 0
  const total = numberValue(summary.total_modules) ?? 0
  const notReady = numberValue(summary.minute_not_ready) ?? 0
  if (explicit === 'ok' && notReady === 0) return 'ok'
  if (['partial', 'running', 'warm'].includes(explicit)) return 'partial'
  if (['degraded', 'error', 'stale', 'missing'].includes(explicit)) return 'degraded'
  if (total > 0 && ok === total && notReady === 0) return 'ok'
  return total > 0 && ok > 0 ? 'partial' : 'degraded'
}

function cacheProblemModules(summary: Record<string, unknown>): string {
  const rows = Array.isArray(summary.problem_modules) ? summary.problem_modules : []
  return rows.map(item => compactText(item)).filter(Boolean).slice(0, 3).join('/')
}

function isActiveProviderProblem(item: Record<string, unknown>): boolean {
  const status = compactText(item.status).toLowerCase()
  if (!['cooldown', 'degraded', 'error', 'stale'].includes(status)) return false
  if (['degraded', 'error', 'stale'].includes(status) && !compactText(item.updated_at)) return false
  if (status !== 'cooldown') return true
  const cooldownUntil = compactText(item.cooldown_until)
  const updatedAt = compactText(item.updated_at)
  if (cooldownUntil && updatedAt && cooldownUntil <= updatedAt) return false
  return true
}

function cacheRefreshSeconds(cacheStatus: StrategyDashboard['cache_status']): number {
  if (!cacheStatus.available) return 10
  const runStatus = compactText(recordValue(cacheStatus.postmarket_backfill.run).status).toLowerCase()
  if (['running', 'partial', 'stale'].includes(runStatus)) return 10
  const freshness = numberValue(recordValue(cacheStatus.live_low_latency.summary).freshness_seconds_max)
  return freshness !== undefined && freshness <= 60 * 60 ? 10 : 60
}

function cacheStatusLabel(value: unknown, fallback: string): string {
  const text = compactText(value, fallback)
  if (text === 'ok') return 'OK'
  if (text === 'running') return 'RUNNING'
  if (text === 'partial') return 'PARTIAL'
  if (text === 'pending') return 'PENDING'
  return text.toUpperCase()
}

function cacheReasonLabel(reason: string, locale: LongclawLocale): string {
  const zh = locale === 'zh-CN'
  if (reason === 'index_minute_unsupported') return zh ? '该市场未接入指数分钟缓存' : 'index minute cache is not connected for this market'
  if (reason === 'index_minute_not_ready') return zh ? '指数分钟缓存未就绪' : 'index minute cache is not ready'
  if (reason === 'stock_minute_not_ready') return zh ? '股票分钟缓存未就绪' : 'stock minute cache is not ready'
  if (reason === 'board_heat_not_ready') return zh ? '板块分钟热度未就绪' : 'sector minute heat is not ready'
  if (reason === 'daily_cache_missing') return zh ? '日线缓存缺失' : 'daily cache is missing'
  if (reason === 'weekly_cache_missing') return zh ? '周线缓存缺失' : 'weekly cache is missing'
  return reason || (zh ? '缓存未就绪' : 'cache is not ready')
}

function chartCacheNotReadyMessage(symbolData: WorkbenchSymbolData | null, locale: LongclawLocale): string {
  const chartMeta = recordValue(symbolData?.chart?.meta)
  const target = recordValue(symbolData?.target)
  const probe = recordValue(target.cache_probe)
  const status = compactText(chartMeta.cache_status)
  const reason = compactText(chartMeta.not_ready_reason, compactText(target.not_ready_reason))
  if (status !== 'not_ready' && !reason) return ''
  const requested = compactText(chartMeta.requested_freq, compactText(target.requested_freq))
  const label = compactText(target.label, compactText(target.symbol))
  const probeStatus = compactText(probe.status)
  const rows = Array.isArray(probe.rows) ? probe.rows.map(item => recordValue(item)) : []
  const requestedLabel = compactText(probe.requested_freq_label, requested)
  const hitLine = rows.length
    ? rows
        .slice(0, 3)
        .map(row => `${compactText(row.collection)}:${compactText(row.symbol)}:${compactText(row.freq)}=${countText(row.count)}`)
        .join(' · ')
    : ''
  if (locale === 'zh-CN') {
    return [
      `${label || '当前标的'} ${requested || requestedLabel || ''} 没有可用 K 线`,
      cacheReasonLabel(reason, locale),
      probeStatus ? `probe=${probeStatus}` : '',
      hitLine ? `已有缓存 ${hitLine}` : '',
    ].filter(Boolean).join(' · ')
  }
  return [
    `${label || 'Current target'} has no ${requested || requestedLabel || ''} candles`,
    cacheReasonLabel(reason, locale),
    probeStatus ? `probe=${probeStatus}` : '',
    hitLine ? `cached ${hitLine}` : '',
  ].filter(Boolean).join(' · ')
}

function trimTrailingSlash(value?: string): string {
  return value?.trim().replace(/\/+$/, '') ?? ''
}

function urlFromDashboard(dashboard: StrategyDashboard): string {
  const terminalLink = dashboard.deep_links.find(link => link.link_id === 'signals-terminal')
  return trimTrailingSlash(terminalLink?.url)
}

function normalizeTimestamp(value: unknown): number | undefined {
  const raw = numberValue(value)
  if (!raw || raw <= 0) return undefined
  return raw < 10_000_000_000 ? raw * 1000 : raw
}

function isBuySignal(value?: string): boolean {
  const normalized = String(value ?? '').toLowerCase()
  return (
    normalized.includes('buy') ||
    normalized.includes('long') ||
    normalized.includes('entry') ||
    normalized.includes('买') ||
    normalized.includes('breakout') ||
    normalized.includes('gap') ||
    normalized.includes('volsqueeze') ||
    normalized.includes('candlerun') ||
    normalized.includes('candleaccel') ||
    normalized.includes('零上回踩') ||
    normalized.includes('零下企稳') ||
    normalized.includes('突破') ||
    normalized.includes('缺口')
  )
}

function isSellSignal(value?: string): boolean {
  const normalized = String(value ?? '').toLowerCase()
  return (
    normalized.includes('sell') ||
    normalized.includes('short') ||
    normalized.includes('exit') ||
    normalized.includes('卖')
  )
}

function signalTone(value?: string): string {
  if (isSellSignal(value)) return 'warning'
  if (isBuySignal(value)) return 'success'
  return 'open'
}

function isPersonalizedSignalType(value?: string): boolean {
  const normalized = String(value ?? '').toLowerCase()
  return (
    normalized.includes('breakout') ||
    normalized.includes('gap') ||
    normalized.includes('volsqueeze') ||
    normalized.includes('candlerun') ||
    normalized.includes('candleaccel') ||
    normalized.includes('macd') ||
    normalized.includes('缺口') ||
    normalized.includes('趋势') ||
    normalized.includes('形态') ||
    normalized.includes('一买') ||
    normalized.includes('二买') ||
    normalized.includes('三买') ||
    normalized.includes('一卖') ||
    normalized.includes('二卖') ||
    normalized.includes('三卖') ||
    normalized.includes('背驰')
  )
}

function marketLabel(session?: WorkbenchSession, locale: LongclawLocale = 'zh-CN'): string {
  if (!session) return locale === 'zh-CN' ? '未连接' : 'Disconnected'
  if (session.a_live || session.hk_live || session.us_live) {
    const liveMarkets = [
      session.a_live ? 'A' : '',
      session.hk_live ? 'H' : '',
      session.us_live ? 'US' : '',
    ].filter(Boolean)
    return locale === 'zh-CN' ? `${liveMarkets.join('+')} 实时` : `${liveMarkets.join('+')} live`
  }
  return session.ready
    ? (locale === 'zh-CN' ? '已就绪' : 'Ready')
    : (session.running ? (locale === 'zh-CN' ? '启动中' : 'Booting') : (locale === 'zh-CN' ? '等待' : 'Idle'))
}

function shouldUseLiveRefresh(session?: WorkbenchSession): boolean {
  return Boolean(session?.a_live || session?.hk_live || session?.us_live)
}

async function fetchJson<T>(
  baseUrl: string,
  path: string,
  signal: AbortSignal | undefined,
  source: string,
  action?: string,
): Promise<T> {
  return observedFetchJson<T>(baseUrl, path, {
    signal,
    source,
    action,
    timeoutMs: 45_000,
  })
}

function chartStyles(): DeepPartial<Styles> {
  return {
    grid: {
      horizontal: { color: tradingDeskTheme.chart.gridHorizontal },
      vertical: { color: tradingDeskTheme.chart.gridVertical },
    },
    candle: {
      bar: {
        upColor: tradingDeskTheme.market.up,
        downColor: tradingDeskTheme.market.down,
        noChangeColor: tradingDeskTheme.market.flat,
        upBorderColor: tradingDeskTheme.market.up,
        downBorderColor: tradingDeskTheme.market.down,
        noChangeBorderColor: tradingDeskTheme.market.flat,
        upWickColor: tradingDeskTheme.market.up,
        downWickColor: tradingDeskTheme.market.down,
        noChangeWickColor: tradingDeskTheme.market.flat,
      },
      tooltip: {
        text: {
          color: terminalTheme.text,
          size: 10,
          family: 'IBM Plex Mono, Menlo, monospace',
        },
      },
      priceMark: {
        last: {
          line: { show: true, ...solidLineStyle(tradingDeskTheme.chart.line, 1) },
          text: {
            show: true,
            color: terminalTheme.white,
            backgroundColor: tradingDeskTheme.chart.line,
            size: 11,
            borderRadius: 4,
          },
        },
      },
    },
    indicator: {
      lines: MA_COLORS.map(color => solidLineStyle(color, 1)),
      bars: [
        {
          upColor: tradingDeskTheme.market.up,
          downColor: tradingDeskTheme.market.down,
          noChangeColor: tradingDeskTheme.market.flat,
        },
      ],
      tooltip: {
        text: {
          color: terminalTheme.text,
          size: 9,
          family: 'IBM Plex Mono, Menlo, monospace',
        },
      },
    },
    xAxis: {
      axisLine: { color: tradingDeskTheme.alpha.textBorderStrong },
      tickText: { color: tradingDeskTheme.market.flat, size: 10 },
    },
    yAxis: {
      axisLine: { color: tradingDeskTheme.alpha.textBorderStrong },
      tickText: { color: tradingDeskTheme.market.flat, size: 10 },
    },
    crosshair: {
      horizontal: {
        line: solidLineStyle(tradingDeskTheme.market.flat, 1),
        text: { color: terminalTheme.white, backgroundColor: terminalTheme.crosshair },
      },
      vertical: {
        line: solidLineStyle(tradingDeskTheme.market.flat, 1),
        text: { color: terminalTheme.white, backgroundColor: terminalTheme.crosshair },
      },
    },
    separator: {
      color: tradingDeskTheme.chart.separator,
      size: 1,
    },
  }
}

function maPeriodsForFreq(freq?: string): number[] {
  const normalized = String(freq ?? '').toLowerCase()
  if (normalized.includes('week') || normalized === 'w' || normalized === '1w') {
    return [5, 10, 20, 50]
  }
  if (normalized.includes('day') || normalized === 'd' || normalized === '1d' || normalized === 'daily') {
    return [5, 10, 20, 60]
  }
  return [5, 10, 20, 60]
}

function maIndicatorStyles(periods: number[]): DeepPartial<IndicatorStyle> {
  return {
    lines: periods.map((period, index) => ({
      ...solidLineStyle(MA_COLORS[index % MA_COLORS.length], period >= 100 ? 1 : 1.2),
    })),
  }
}

function macdIndicatorStyles(): DeepPartial<IndicatorStyle> {
  return {
    lines: MACD_LINE_COLORS.map(color => solidLineStyle(color, 1.2)),
    bars: [
      {
        upColor: tradingDeskTheme.market.up,
        downColor: tradingDeskTheme.market.down,
        noChangeColor: tradingDeskTheme.market.flat,
      },
    ],
  }
}

function macdZeroIndicatorStyles(): DeepPartial<IndicatorStyle> {
  return {
    lines: [
      {
        color: tradingDeskTheme.alpha.textBorderStrong,
        size: 1,
        style: 'dashed',
        dashedValue: [4, 4],
      },
    ],
    tooltip: { showName: false, showParams: false },
  }
}

function ensureMacdZeroIndicator() {
  if (macdZeroIndicatorRegistered) return
  registerIndicator<{ zero: number }>({
    name: MACD_ZERO_INDICATOR_NAME,
    shortName: 'MACD 0',
    precision: 2,
    calcParams: [],
    shouldOhlc: false,
    shouldFormatBigNumber: false,
    series: IndicatorSeries.Normal,
    figures: [{ key: 'zero', title: '0轴: ', type: 'line' }],
    calc: dataList => dataList.map(() => ({ zero: 0 })),
  })
  macdZeroIndicatorRegistered = true
}

function applyMovingAverageIndicator(chart: Chart, freq?: string) {
  const periods = maPeriodsForFreq(freq)
  chart.overrideIndicator(
    {
      name: 'MA',
      calcParams: periods,
      styles: maIndicatorStyles(periods),
    },
    CANDLE_PANE_ID,
  )
}

function createChartIndicators(chart: Chart, freq?: string) {
  const periods = maPeriodsForFreq(freq)
  chart.createIndicator(
    {
      name: 'MA',
      calcParams: periods,
      styles: maIndicatorStyles(periods),
    },
    true,
    { id: CANDLE_PANE_ID },
  )
  chart.createIndicator('VOL', false, { minHeight: 64, height: 82 })
  chart.createIndicator(
    {
      name: 'MACD',
      calcParams: MACD_PARAMS,
      styles: macdIndicatorStyles(),
    },
    false,
    { id: MACD_PANE_ID, minHeight: 86, height: 116 },
  )
  chart.createIndicator(
    {
      name: MACD_ZERO_INDICATOR_NAME,
      styles: macdZeroIndicatorStyles(),
    },
    true,
    { id: MACD_PANE_ID },
  )
}

function ensureSignalOverlay() {
  if (signalOverlayRegistered) return
  registerOverlay({
    name: SIGNAL_OVERLAY_NAME,
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates }: OverlayCreateFiguresCallbackParams) => {
      const point = coordinates[0]
      if (!point) return []
      const data = recordValue(overlay.extendData) as SignalOverlayData
      const label = data.label || 'SIG'
      const side = data.side === 'sell' ? 'sell' : data.side === 'neutral' ? 'neutral' : 'buy'
      const color = data.color || signalOverlayColor(side)
      const text = label
      const width = Math.max(34, Math.min(62, text.length * 8 + 18))
      const height = 18
      const gap = 8
      const rectX = point.x - width / 2
      const rectY = side === 'buy' ? point.y + gap : point.y - gap - height
      const stemEndY = side === 'buy' ? rectY : rectY + height
      const tipY = side === 'buy' ? point.y + 5 : point.y - 5
      const fillColor = 'rgba(15, 23, 42, 0.88)'
      const borderSize = 1
      const labelY = rectY + height / 2

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: point.x, y: tipY },
              { x: point.x, y: stemEndY },
            ],
          },
          styles: { color, size: 1, style: 'dashed', dashedValue: [3, 3] },
          ignoreEvent: true,
        },
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: point.x, y: tipY },
              { x: point.x - 4, y: point.y },
              { x: point.x, y: side === 'buy' ? point.y - 4 : point.y + 4 },
              { x: point.x + 4, y: point.y },
            ],
          },
          styles: { color, borderColor: terminalTheme.root },
          ignoreEvent: true,
        },
        {
          type: 'rect',
          attrs: { x: rectX, y: rectY, width, height },
          styles: {
            color: fillColor,
            borderColor: color,
            borderSize,
            borderRadius: 3,
          },
          ignoreEvent: true,
        },
        {
          type: 'rect',
          attrs: { x: rectX + 4, y: rectY + 4, width: 3, height: height - 8 },
          styles: {
            color,
            borderColor: color,
            borderRadius: 2,
          },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x: rectX + 12,
            y: labelY,
            text: text.slice(0, 8),
            align: 'left',
            baseline: 'middle',
          },
          styles: {
            color: terminalTheme.textStrong,
            size: 10,
            weight: 800,
            family: 'IBM Plex Mono, Menlo, monospace',
          },
          ignoreEvent: true,
        },
      ]
    },
  })
  signalOverlayRegistered = true
}

function ensureDivergenceOverlay() {
  if (divergenceOverlayRegistered) return
  registerOverlay({
    name: DIVERGENCE_OVERLAY_NAME,
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates }: OverlayCreateFiguresCallbackParams) => {
      const previous = coordinates[0]
      const current = coordinates[1] ?? coordinates[0]
      if (!previous || !current) return []
      const data = recordValue(overlay.extendData) as DivergenceOverlayData
      const side = data.side === 'bottom' ? 'bottom' : 'top'
      const color = data.color || (side === 'top' ? tradingDeskTheme.market.up : tradingDeskTheme.market.down)
      const label = data.label || (side === 'top' ? '顶背离' : '底背离')
      const compact = Boolean(data.compact)
      const width = compact ? Math.max(42, label.length * 8 + 12) : 58
      const height = compact ? 16 : 20
      const gap = compact ? 6 : 10
      const rectX = current.x - width / 2
      const rectY = side === 'top' ? current.y - gap - height : current.y + gap
      const pointerY = side === 'top' ? rectY + height : rectY
      const tipY = side === 'top' ? current.y - 2 : current.y + 2

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: previous.x, y: previous.y },
              { x: current.x, y: current.y },
            ],
          },
          styles: { color, size: compact ? 1 : 1.4, style: 'dashed', dashedValue: [4, 3] },
          ignoreEvent: true,
        },
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: current.x, y: tipY },
              { x: current.x, y: pointerY },
            ],
          },
          styles: solidLineStyle(color, 1),
          ignoreEvent: true,
        },
        {
          type: 'rect',
          attrs: { x: rectX, y: rectY, width, height },
          styles: {
            color,
            borderColor: tradingDeskTheme.alpha.textBorderStrong,
            borderRadius: 4,
          },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x: current.x,
            y: rectY + height / 2,
            text: label,
            align: 'center',
            baseline: 'middle',
          },
          styles: {
            color: terminalTheme.white,
            size: compact ? 9 : 10,
            weight: 800,
            family: fontStacks.ui,
          },
          ignoreEvent: true,
        },
      ]
    },
  })
  divergenceOverlayRegistered = true
}

function toKLineData(rawChart: Record<string, unknown> | undefined): KLineData[] {
  const rows = Array.isArray(rawChart?.ohlcv) ? rawChart.ohlcv : []
  return rows
    .map(item => {
      const record = recordValue(item)
      const timestamp = normalizeTimestamp(record.time ?? record.dt ?? record.timestamp)
      const close = numberValue(record.close)
      if (!timestamp || close === undefined) return null
      const open = numberValue(record.open) ?? close
      const high = numberValue(record.high) ?? Math.max(open, close)
      const low = numberValue(record.low) ?? Math.min(open, close)
      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume: numberValue(record.volume) ?? numberValue(record.vol) ?? 0,
        turnover: numberValue(record.turnover),
      } satisfies KLineData
    })
    .filter((item): item is KLineData => Boolean(item))
    .sort((left, right) => left.timestamp - right.timestamp)
}

function signalsFromSymbolData(symbolData: WorkbenchSymbolData | null): StrategySignal[] {
  if (!symbolData) return []
  if (Array.isArray(symbolData.signals)) return symbolData.signals
  const chartSignals = symbolData.chart?.signals
  return Array.isArray(chartSignals) ? (chartSignals as StrategySignal[]) : []
}

function keyLevelsFromSymbolData(symbolData: WorkbenchSymbolData | null): StrategyKeyLevel[] {
  if (!symbolData) return []
  const summaryLevels = symbolData.summary?.key_levels
  if (Array.isArray(summaryLevels)) return summaryLevels as StrategyKeyLevel[]
  const chartReport = recordValue(symbolData.chart?.report)
  const chartLevels = chartReport.key_levels
  return Array.isArray(chartLevels) ? (chartLevels as StrategyKeyLevel[]) : []
}

function latestClose(data: KLineData[]): number | undefined {
  return data[data.length - 1]?.close
}

function movingAverageLevel(data: KLineData[], period: number): number | undefined {
  if (data.length < period) return undefined
  const window = data.slice(-period)
  const sum = window.reduce((total, item) => total + item.close, 0)
  return sum / period
}

function isDailyFreq(freq?: string): boolean {
  const normalized = String(freq ?? '').toLowerCase()
  return normalized.includes('day') || normalized === 'd' || normalized === '1d' || normalized === 'daily'
}

function derivedMaKeyLevels(data: KLineData[], freq?: string): StrategyKeyLevel[] {
  if (!isDailyFreq(freq)) return []
  return [50, 200]
    .map(period => {
      const value = movingAverageLevel(data, period)
      if (value === undefined) return null
      const close = latestClose(data)
      return {
        name: `${period}日线`,
        value,
        role: period === 200 ? '长期趋势压力/支撑' : '阶段底部/成本线',
        position: close !== undefined && close >= value ? '下方' : '上方',
        distance_pct: close !== undefined && value > 0 ? ((value - close) / close) * 100 : null,
        timeframe: 'daily',
      } satisfies StrategyKeyLevel
    })
    .filter((item): item is StrategyKeyLevel => Boolean(item))
}

function mergeKeyLevels(base: StrategyKeyLevel[], derived: StrategyKeyLevel[]): StrategyKeyLevel[] {
  const output: StrategyKeyLevel[] = []
  const seen = new Set<string>()
  ;[...base, ...derived].forEach(level => {
    const value = numberValue(level.value)
    const name = compactText(level.name)
    const key = `${name}:${value === undefined ? '' : value.toFixed(2)}`
    if (!name && value === undefined) return
    if (seen.has(key)) return
    seen.add(key)
    output.push(level)
  })
  return output
}

function divergenceWindowForFreq(freq?: string): number {
  const normalized = String(freq ?? '').toLowerCase()
  if (normalized.includes('week') || normalized === 'w' || normalized === '1w') return 2
  if (normalized.includes('day') || normalized === 'd' || normalized === '1d' || normalized === 'daily') return 3
  return 4
}

function divergenceMinPriceMoveForFreq(freq?: string): number {
  const normalized = String(freq ?? '').toLowerCase()
  if (normalized.includes('week') || normalized === 'w' || normalized === '1w') return 0.012
  if (normalized.includes('day') || normalized === 'd' || normalized === '1d' || normalized === 'daily') return 0.008
  return 0.003
}

function calculateMacdPoints(data: KLineData[]): MacdPoint[] {
  let closeSum = 0
  let emaShort: number | undefined
  let emaLong: number | undefined
  let dif = 0
  let difSum = 0
  let dea = 0
  const [shortPeriod, longPeriod, signalPeriod] = MACD_PARAMS
  const maxPeriod = Math.max(shortPeriod, longPeriod)

  return data.map((item, index) => {
    const close = item.close
    closeSum += close
    if (index >= shortPeriod - 1) {
      emaShort = index > shortPeriod - 1 && emaShort !== undefined
        ? (2 * close + (shortPeriod - 1) * emaShort) / (shortPeriod + 1)
        : closeSum / shortPeriod
    }
    if (index >= longPeriod - 1) {
      emaLong = index > longPeriod - 1 && emaLong !== undefined
        ? (2 * close + (longPeriod - 1) * emaLong) / (longPeriod + 1)
        : closeSum / longPeriod
    }
    const macd: MacdPoint = { timestamp: item.timestamp }
    if (index >= maxPeriod - 1 && emaShort !== undefined && emaLong !== undefined) {
      dif = emaShort - emaLong
      macd.dif = dif
      difSum += dif
      if (index >= maxPeriod + signalPeriod - 2) {
        dea = index > maxPeriod + signalPeriod - 2
          ? (dif * 2 + dea * (signalPeriod - 1)) / (signalPeriod + 1)
          : difSum / signalPeriod
        macd.dea = dea
        macd.histogram = (dif - dea) * 2
      }
    }
    return macd
  })
}

function hasMacdValue(value: MacdPoint | undefined): value is MacdPoint & { dif: number; histogram: number } {
  return value?.dif !== undefined && value.histogram !== undefined
}

function findSwingHighs(data: KLineData[], macd: MacdPoint[], windowSize: number): PivotPoint[] {
  const output: PivotPoint[] = []
  for (let index = windowSize; index < data.length - windowSize; index += 1) {
    const current = data[index]
    const macdPoint = macd[index]
    if (!current || !hasMacdValue(macdPoint)) continue
    let isPivot = true
    for (let offset = 1; offset <= windowSize; offset += 1) {
      if (current.high <= data[index - offset].high || current.high < data[index + offset].high) {
        isPivot = false
        break
      }
    }
    if (isPivot) {
      output.push({
        index,
        timestamp: current.timestamp,
        price: current.high,
        dif: macdPoint.dif,
        histogram: macdPoint.histogram,
      })
    }
  }
  return output
}

function findSwingLows(data: KLineData[], macd: MacdPoint[], windowSize: number): PivotPoint[] {
  const output: PivotPoint[] = []
  for (let index = windowSize; index < data.length - windowSize; index += 1) {
    const current = data[index]
    const macdPoint = macd[index]
    if (!current || !hasMacdValue(macdPoint)) continue
    let isPivot = true
    for (let offset = 1; offset <= windowSize; offset += 1) {
      if (current.low >= data[index - offset].low || current.low > data[index + offset].low) {
        isPivot = false
        break
      }
    }
    if (isPivot) {
      output.push({
        index,
        timestamp: current.timestamp,
        price: current.low,
        dif: macdPoint.dif,
        histogram: macdPoint.histogram,
      })
    }
  }
  return output
}

function weakeningRatio(previousValue: number, currentValue: number, type: 'bearish' | 'bullish'): number {
  const denominator = Math.max(Math.abs(previousValue), Math.abs(currentValue), 0.000001)
  const delta = type === 'bearish' ? previousValue - currentValue : currentValue - previousValue
  return delta / denominator
}

function divergenceConfidence(priceMove: number, indicatorWeakening: number): number {
  return Math.min(0.99, 0.45 + Math.min(priceMove * 18, 0.28) + Math.min(indicatorWeakening * 1.1, 0.26))
}

function divergenceFromPivots(
  previous: PivotPoint,
  current: PivotPoint,
  type: 'bearish' | 'bullish',
  minPriceMove: number,
): MacdDivergenceSignal | null {
  const priceMove = type === 'bearish'
    ? (current.price - previous.price) / Math.max(Math.abs(previous.price), 0.000001)
    : (previous.price - current.price) / Math.max(Math.abs(previous.price), 0.000001)
  if (priceMove < minPriceMove) return null

  const difWeakening = weakeningRatio(previous.dif, current.dif, type)
  const histogramWeakening = weakeningRatio(previous.histogram, current.histogram, type)
  const metric = histogramWeakening >= difWeakening ? 'histogram' : 'dif'
  const indicatorWeakening = Math.max(difWeakening, histogramWeakening)
  if (indicatorWeakening < 0.08) return null

  const macdValue = metric === 'histogram' ? current.histogram : current.dif
  const previousMacdValue = metric === 'histogram' ? previous.histogram : previous.dif
  return {
    id: `${type}:${previous.timestamp}:${current.timestamp}:${metric}`,
    type,
    timestamp: current.timestamp,
    price: current.price,
    previousTimestamp: previous.timestamp,
    previousPrice: previous.price,
    macdValue,
    previousMacdValue,
    confidence: divergenceConfidence(priceMove, indicatorWeakening),
    metric,
  }
}

function macdDivergences(data: KLineData[], freq?: string): MacdDivergenceSignal[] {
  if (data.length < 42) return []
  const windowSize = divergenceWindowForFreq(freq)
  const minPriceMove = divergenceMinPriceMoveForFreq(freq)
  const macd = calculateMacdPoints(data)
  const highs = findSwingHighs(data, macd, windowSize)
  const lows = findSwingLows(data, macd, windowSize)
  const candidates: MacdDivergenceSignal[] = []
  for (let index = 1; index < highs.length; index += 1) {
    const signal = divergenceFromPivots(highs[index - 1], highs[index], 'bearish', minPriceMove)
    if (signal) candidates.push(signal)
  }
  for (let index = 1; index < lows.length; index += 1) {
    const signal = divergenceFromPivots(lows[index - 1], lows[index], 'bullish', minPriceMove)
    if (signal) candidates.push(signal)
  }
  return candidates
    .filter(signal => signal.confidence >= 0.58)
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-6)
}

function signalTimestamp(signal: StrategySignal): number | undefined {
  return normalizeTimestamp(signal.dt ?? signal.time ?? signal.timestamp)
}

function signalPrice(signal: StrategySignal, dataByTimestamp: Map<number, KLineData>): number | undefined {
  const explicit = numberValue(signal.price)
  if (explicit !== undefined) return explicit
  const timestamp = signalTimestamp(signal)
  return timestamp ? dataByTimestamp.get(timestamp)?.close : undefined
}

function shortSignalLabel(value?: string): string {
  const raw = String(value ?? '').trim()
  if (!raw) return 'SIG'
  const normalized = raw.toLowerCase()
  if (normalized.includes('背驰买') || normalized.includes('底背离')) return '底背'
  if (normalized.includes('顶背离')) return '顶背'
  if (normalized.includes('break') || normalized.includes('brea') || normalized.includes('突破')) return '突破'
  if (normalized.includes('volsqueeze')) return '缩量'
  if (normalized.includes('candlerun') || normalized.includes('candleaccel')) return '加速'
  if (normalized.includes('零上回踩')) return '零上'
  if (normalized.includes('零下企稳')) return '零下'
  if (normalized.includes('candidate') || normalized.includes('cand') || normalized.includes('候选')) return '观察'
  if (isSellSignal(raw)) return '卖'
  if (isBuySignal(raw)) return '买'
  if (normalized.includes('gap') || normalized.includes('缺口')) return '缺口'
  if (normalized.includes('macd')) return 'MACD'
  if (/^[\x00-\x7F]+$/.test(raw)) return raw.toUpperCase().slice(0, 4)
  return raw.slice(0, 3)
}

function normalizeSignalFreq(value?: string): string {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return ''
  if (['5m', '5min', '5分钟'].includes(raw)) return '5min'
  if (['15m', '15min', '15分钟'].includes(raw)) return '15min'
  if (['30m', '30min', '30分钟'].includes(raw)) return '30min'
  if (['daily', 'day', '1d', '日线'].includes(raw)) return 'daily'
  if (['weekly', 'week', '1w', '周线'].includes(raw)) return 'weekly'
  return raw
}

function displayFreqLabel(value?: string): string {
  const normalized = normalizeSignalFreq(value)
  if (normalized === '5min') return '5m'
  if (normalized === '15min') return '15m'
  if (normalized === '30min') return '30m'
  if (normalized === 'daily') return '日'
  if (normalized === 'weekly') return '周'
  return compactText(value)
}

function signalOverlaySide(value?: string): SignalOverlayData['side'] {
  const normalized = String(value ?? '').toLowerCase()
  if (isSellSignal(value) || normalized.includes('顶背离')) return 'sell'
  if (isBuySignal(value) || normalized.includes('底背离') || normalized.includes('背驰买')) return 'buy'
  return 'neutral'
}

function signalOverlayColor(side: SignalOverlayData['side']): string {
  if (side === 'sell') return tradingDeskTheme.market.down
  if (side === 'buy') return tradingDeskTheme.chart.orange
  return tradingDeskTheme.alpha.infoBorder
}

function signalOverlayPriority(signal: StrategySignal): number {
  const normalized = String(signal.type ?? '').toLowerCase()
  let priority = 35
  if (isSellSignal(signal.type) || normalized.includes('顶背离')) priority = 90
  else if (isBuySignal(signal.type) || normalized.includes('底背离') || normalized.includes('背驰买')) priority = 85
  else if (normalized.includes('break') || normalized.includes('brea') || normalized.includes('突破')) priority = 70
  else if (normalized.includes('macd') || normalized.includes('背驰')) priority = 60
  else if (normalized.includes('gap') || normalized.includes('缺口')) priority = 45
  else if (normalized.includes('candidate') || normalized.includes('cand') || normalized.includes('候选')) priority = 20
  return isCustomUserSignal(signal) ? priority + 18 : priority
}

function isCustomUserSignal(signal: StrategySignal): boolean {
  const source = `${signal.source ?? ''} ${signal.pool_status ?? ''} ${signal.details ?? ''}`.toLowerCase()
  return source.includes('signal_records') || source.includes('backtest') || source.includes('custom') || source.includes('自定义') || source.includes('回测') || isPersonalizedSignalType(signal.type)
}

function signalSourceLabel(signal: StrategySignal): string {
  if (isCustomUserSignal(signal)) return '自定义'
  const source = String(signal.source ?? '').toLowerCase()
  if (source.includes('signal_pool') || source.includes('signals')) return '信号池'
  return ''
}

function displaySignalsForChart(data: KLineData[], signals: StrategySignal[]): StrategySignal[] {
  if (data.length === 0 || signals.length === 0) return []
  const cutoff = data[Math.max(0, data.length - CHART_SIGNAL_LOOKBACK_BARS)]?.timestamp ?? data[0].timestamp
  const valid = signals
    .map(signal => ({ signal, timestamp: signalTimestamp(signal), priority: signalOverlayPriority(signal) }))
    .filter((item): item is { signal: StrategySignal; timestamp: number; priority: number } => item.timestamp !== undefined)
  const recent = valid.filter(item => item.timestamp >= cutoff)
  const latestCustom = valid.filter(item => isCustomUserSignal(item.signal)).slice(-MAX_CHART_SIGNAL_OVERLAYS)
  const source = recent.length > 0 ? [...recent, ...latestCustom] : valid.slice(-MAX_CHART_SIGNAL_OVERLAYS)
  const bestByTimestamp = new Map<number, { signal: StrategySignal; timestamp: number; priority: number }>()
  source.forEach(item => {
    const existing = bestByTimestamp.get(item.timestamp)
    if (!existing || item.priority > existing.priority) bestByTimestamp.set(item.timestamp, item)
  })
  return Array.from(bestByTimestamp.values())
    .sort((left, right) => {
      if (right.priority !== left.priority) return right.priority - left.priority
      return right.timestamp - left.timestamp
    })
    .slice(0, MAX_CHART_SIGNAL_OVERLAYS)
    .sort((left, right) => left.timestamp - right.timestamp)
    .map(item => item.signal)
}

function displaySignalsForEvidence(signals: StrategySignal[]): StrategySignal[] {
  if (signals.length === 0) return []
  const ranked = signals
    .map(signal => ({ signal, timestamp: signalTimestamp(signal) ?? 0 }))
    .sort((left, right) => {
      const customDelta = Number(isCustomUserSignal(right.signal)) - Number(isCustomUserSignal(left.signal))
      if (customDelta !== 0) return customDelta
      return right.timestamp - left.timestamp
    })
  const output: StrategySignal[] = []
  const seen = new Set<string>()
  ranked.forEach(({ signal, timestamp }) => {
    if (output.length >= MAX_EVIDENCE_SIGNAL_ROWS) return
    const key = `${timestamp}:${signal.type ?? ''}:${signal.freq ?? ''}:${signal.source ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    output.push(signal)
  })
  return output
}

function createSignalOverlays(chart: Chart, data: KLineData[], signals: StrategySignal[]) {
  chart.removeOverlay({ groupId: SIGNAL_OVERLAY_GROUP })
  const dataByTimestamp = new Map(data.map(item => [item.timestamp, item]))
  displaySignalsForChart(data, signals).forEach(signal => {
    const timestamp = signalTimestamp(signal)
    const price = signalPrice(signal, dataByTimestamp)
    if (!timestamp || price === undefined) return
    const label = shortSignalLabel(signal.type ?? signal.signal_type)
    const side = signalOverlaySide(signal.type ?? signal.signal_type)
    const custom = isCustomUserSignal(signal)
    chart.createOverlay({
      name: SIGNAL_OVERLAY_NAME,
      groupId: SIGNAL_OVERLAY_GROUP,
      lock: true,
      points: [{ timestamp, value: price }],
      extendData: {
        label,
        side,
        color: custom ? (side === 'sell' ? '#fb7185' : '#38bdf8') : signalOverlayColor(side),
        isCustom: custom,
        freq: displayFreqLabel(signal.freq),
        sourceLabel: signalSourceLabel(signal),
        details: signal.details,
      } satisfies SignalOverlayData,
    })
  })
}

function createLevelOverlays(chart: Chart, data: KLineData[], keyLevels: StrategyKeyLevel[]) {
  chart.removeOverlay({ groupId: LEVEL_OVERLAY_GROUP })
  const timestamp = data[data.length - 1]?.timestamp
  if (!timestamp) return
  const close = latestClose(data)
  const visibleLevels: StrategyKeyLevel[] = []
  keyLevels
    .map(level => ({ level, value: numberValue(level.value) }))
    .filter((item): item is { level: StrategyKeyLevel; value: number } => item.value !== undefined)
    .filter(item => {
      const name = compactText(item.level.name)
      return !/^(5|10)(日|天|d|D)?线?$/.test(name)
    })
    .sort((left, right) => {
      if (close === undefined) return 0
      return Math.abs(left.value - close) - Math.abs(right.value - close)
    })
    .forEach(item => {
      const tooClose = visibleLevels.some(existing => {
        const existingValue = numberValue(existing.value)
        if (existingValue === undefined) return false
        return Math.abs(existingValue - item.value) / Math.max(Math.abs(item.value), 0.000001) < 0.006
      })
      if (!tooClose && visibleLevels.length < MAX_CHART_LEVEL_OVERLAYS) visibleLevels.push(item.level)
    })
  visibleLevels.forEach(level => {
    const value = numberValue(level.value)
    if (value === undefined) return
    chart.createOverlay({
      name: 'simpleTag',
      groupId: LEVEL_OVERLAY_GROUP,
      lock: true,
      points: [{ timestamp, value }],
      extendData: [level.name, value.toFixed(2)].filter(Boolean).join(' '),
      styles: {
        line: { color: tradingDeskTheme.alpha.infoBorder, size: 1, style: 'dashed', dashedValue: [4, 5] },
        text: {
          color: terminalTheme.white,
          backgroundColor: tradingDeskTheme.alpha.infoBorder,
          size: 9,
        },
      },
    })
  })
}

function createDivergenceOverlays(chart: Chart, divergences: MacdDivergenceSignal[]) {
  chart.removeOverlay({ groupId: DIVERGENCE_OVERLAY_GROUP })
  divergences.slice(-MAX_CHART_DIVERGENCE_OVERLAYS).forEach(signal => {
    const bearish = signal.type === 'bearish'
    const color = bearish ? tradingDeskTheme.market.up : tradingDeskTheme.market.down
    const label = bearish ? '顶背离' : '底背离'
    const side = bearish ? 'top' : 'bottom'
    chart.createOverlay(
      {
        name: DIVERGENCE_OVERLAY_NAME,
        groupId: DIVERGENCE_OVERLAY_GROUP,
        lock: true,
        points: [
          { timestamp: signal.previousTimestamp, value: signal.previousPrice },
          { timestamp: signal.timestamp, value: signal.price },
        ],
        extendData: {
          label,
          side,
          color,
        } satisfies DivergenceOverlayData,
      },
      CANDLE_PANE_ID,
    )
    chart.createOverlay(
      {
        name: DIVERGENCE_OVERLAY_NAME,
        groupId: DIVERGENCE_OVERLAY_GROUP,
        lock: true,
        points: [
          { timestamp: signal.previousTimestamp, value: signal.previousMacdValue },
          { timestamp: signal.timestamp, value: signal.macdValue },
        ],
        extendData: {
          label: signal.metric === 'histogram' ? '柱背离' : 'DIF背离',
          side,
          color,
          compact: true,
        } satisfies DivergenceOverlayData,
      },
      MACD_PANE_ID,
    )
  })
}

function initialTargetFrom(
  shell: WorkbenchShell | null,
  dashboard: StrategyDashboard,
): ChartTarget {
  const shellTarget = shell?.default_target
  const chartContext = dashboard.chart_context
  const buyCandidate = dashboard.buy_candidates[0]
  const inferredKind = shellTarget?.label
    ? 'index'
    : (chartContext?.symbol ? 'stock' : (buyCandidate?.symbol ? 'stock' : 'index'))
  return {
    label:
      shellTarget?.label ??
      chartContext?.symbol ??
      buyCandidate?.symbol ??
      '上证指数',
    kind: shellTarget?.kind ?? inferredKind,
    freq: DEFAULT_TERMINAL_FREQ,
  }
}

function availableFreqs(symbolData: WorkbenchSymbolData | null): string[] {
  const freqs = symbolData?.target?.available_freqs
  return Array.isArray(freqs) && freqs.length > 0 ? freqs : DEFAULT_AVAILABLE_FREQS
}

function terminalListTargetFreq(value: unknown, fallback?: string): string {
  const normalized = compactText(value)
  if (normalized && normalized !== 'daily' && normalized !== 'weekly') return normalized
  const fallbackFreq = compactText(fallback)
  if (fallbackFreq && fallbackFreq !== 'daily' && fallbackFreq !== 'weekly') return fallbackFreq
  return DEFAULT_TERMINAL_FREQ
}

function formatNumber(value: unknown, digits = 2): string {
  const number = numberValue(value)
  if (number === undefined) return 'N/A'
  return number.toFixed(digits)
}

function formatPercent(value: unknown): string {
  const number =
    typeof value === 'string'
      ? numberValue(value.replace('%', '').replace('+', '').trim())
      : numberValue(value)
  if (number === undefined) return 'N/A'
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`
}

function percentTone(value: string): React.CSSProperties {
  if (value.startsWith('+')) return { color: tradingDeskTheme.market.up }
  if (value.startsWith('-')) return { color: tradingDeskTheme.market.down }
  return { color: terminalTheme.muted }
}

function formatConfidence(value: unknown): string {
  const number = numberValue(value)
  if (number === undefined) return compactText(value, 'N/A')
  const percent = number <= 1 ? number * 100 : number
  return `${percent.toFixed(0)}%`
}

function strategyKpiLabel(row: Record<string, unknown>): string {
  const key = compactText(row.kpi_id) || compactText(row.label)
  const labels: Record<string, string> = {
    signals_total: '信号总数',
    signals_evaluated: '已验证信号',
    signals_pending: '待验证信号',
    pool_size: '观察池',
    candidate_count: '买入候选',
    warning_count: '风险预警',
    win_rate: '历史胜率',
    avg_return_t5: 'T+5均值',
  }
  return labels[key] || compactText(row.label) || key || 'KPI'
}

function sourceConfidenceLabel(row: Record<string, unknown>): string {
  const key = compactText(row.source_id) || compactText(row.label) || compactText(row.name) || compactText(row.source)
  const labels: Record<string, string> = {
    board: '行业板块',
    concept: '概念板块',
    market_pool: '观察池',
    quote: '行情快照',
    signal: '信号池',
  }
  return labels[key] || compactText(row.label) || compactText(row.name) || compactText(row.source) || key || 'Source'
}

function readableTime(value?: Date | null, locale: LongclawLocale = 'zh-CN', timeZone?: string): string {
  if (!value) return ''
  const options: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }
  if (timeZone) options.timeZone = timeZone
  return value.toLocaleTimeString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', options)
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element) return false
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

function rowsFromCluster(value: unknown): Record<string, unknown>[] {
  const record = recordValue(value)
  const industryTop = recordValue(record.industry).top ?? record.industry_top
  const conceptTop = recordValue(record.concept).top ?? record.concept_top
  return [
    ...(Array.isArray(industryTop)
      ? industryTop.map(item => ({ ...recordValue(item), kind: 'industry', cluster_kind: 'industry' }))
      : []),
    ...(Array.isArray(conceptTop)
      ? conceptTop.map(item => ({ ...recordValue(item), kind: 'concept', cluster_kind: 'concept' }))
      : []),
  ].map(item => recordValue(item))
}

function normalizeMetricRows(value: unknown, labelKey: string, valueKey: string): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.map(item => recordValue(item)).filter(item => Object.keys(item).length > 0)
  const record = recordValue(value)
  if (Object.keys(record).length === 0) return []
  for (const nestedKey of ['items', 'rows', 'sources']) {
    const nested = record[nestedKey]
    if (Array.isArray(nested) && nested.length > 0) {
      return nested.map((item, index) => {
        const row = recordValue(item)
        return {
          [labelKey]:
            compactText(row[labelKey]) ||
            compactText(row.source_id) ||
            compactText(row.kpi_id) ||
            compactText(row.name) ||
            compactText(row.source) ||
            `${nestedKey}_${index + 1}`,
          [valueKey]: row[valueKey] ?? row.score ?? row.value,
          ...row,
        }
      })
    }
  }
  return Object.entries(record)
    .filter(([key]) => !['items', 'rows', 'sources'].includes(key))
    .map(([key, raw]) => {
      const row = recordValue(raw)
      return Object.keys(row).length > 0
        ? { [labelKey]: key, ...row }
        : { [labelKey]: key, [valueKey]: raw }
    })
}

function syncLaneRows(value: unknown): Record<string, unknown>[] {
  const record = recordValue(value)
  return Object.entries(record).map(([lane, raw]) => ({
    lane,
    ...recordValue(raw),
  }))
}

function chartMarketTimezone(symbolData: WorkbenchSymbolData | null, shell: WorkbenchShell | null): string {
  const meta = recordValue(symbolData?.chart?.meta)
  return (
    compactText(symbolData?.target?.market_timezone) ||
    compactText(meta.market_timezone) ||
    compactText(shell?.session?.market_timezone) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'Asia/Shanghai'
  )
}

function chartLineageLabel(symbolData: WorkbenchSymbolData | null, locale: LongclawLocale): string {
  const meta = recordValue(symbolData?.chart?.meta)
  if (Object.keys(meta).length === 0) return ''
  const source = compactText(meta.source)
  const collection = compactText(meta.collection)
  const cacheStatus = compactText(meta.cache_status)
  const latest = compactText(meta.latest_bar_time) || compactText(meta.data_as_of) || compactText(meta.as_of)
  const semantics = compactText(meta.time_semantics)
  const type = compactText(meta.display_name) || (compactText(meta.chart_type) === 'heat_ohlc'
    ? (locale === 'zh-CN' ? '热度K线/涨跌幅OHLC' : 'Heat OHLC')
    : '')
  return [
    type,
    source ? `${locale === 'zh-CN' ? '来源' : 'Source'} ${source}` : '',
    collection && collection !== source ? `${locale === 'zh-CN' ? '集合' : 'Collection'} ${collection}` : '',
    cacheStatus ? `${locale === 'zh-CN' ? '缓存' : 'Cache'} ${cacheStatus}` : '',
    latest ? `${locale === 'zh-CN' ? '最新' : 'Latest'} ${latest}` : '',
    semantics ? `${locale === 'zh-CN' ? '时间' : 'Time'} ${semantics}` : '',
  ].filter(Boolean).join(' · ')
}

function chartFormulaLabel(symbolData: WorkbenchSymbolData | null, locale: LongclawLocale): string {
  const meta = recordValue(symbolData?.chart?.meta)
  const formula = recordValue(meta.ohlc_formula)
  if (Object.keys(formula).length === 0) return ''
  return locale === 'zh-CN'
    ? `公式 O=${compactText(formula.open)} H=${compactText(formula.high)} L=${compactText(formula.low)} C=${compactText(formula.close)}`
    : `Formula O=${compactText(formula.open)} H=${compactText(formula.high)} L=${compactText(formula.low)} C=${compactText(formula.close)}`
}

function labelForTarget(row: Record<string, unknown>): string {
  return (
    stringValue(row.label) ??
    stringValue(row.name) ??
    stringValue(row.symbol) ??
    stringValue(row.code) ??
    ''
  )
}

function targetMatchesSearchValue(row: Record<string, unknown>, value: string): boolean {
  const normalized = value.toLowerCase()
  const candidates = [
    labelForTarget(row),
    compactText(row.symbol),
    compactText(row.code),
    compactText(row.name),
  ].filter(Boolean)
  return candidates.some(candidate => candidate === value || candidate.toLowerCase() === normalized)
}

function looksLikeIndexValue(value: string): boolean {
  const normalized = value.toLowerCase()
  return (
    value.endsWith('指') ||
    value.includes('指数') ||
    value.includes('300') ||
    value.includes('500') ||
    value.includes('1000') ||
    /^s[hz](000|399)\d{3}$/.test(normalized) ||
    ['创业板指', '沪深300', '深证成指', '上证指数', '中证500', '中证1000'].includes(value)
  )
}

function kindForTarget(row: Record<string, unknown>, fallback = 'auto'): string {
  return stringValue(row.kind) ?? (stringValue(row.symbol) ? 'stock' : fallback)
}

function normalizeReturnKey(value: string): string {
  return value.toLowerCase().replace(/[\s_\-./]/g, '')
}

function readRangeReturn(row: Record<string, unknown>, column: WatchlistRangeColumn): unknown {
  const candidates = [row.range_returns, row.period_returns, row.interval_returns, row.carrier_range_returns]
  for (const candidate of candidates) {
    const record = recordValue(candidate)
    if (Object.keys(record).length > 0) {
      const normalizedEntries = new Map(
        Object.entries(record).map(([key, value]) => [normalizeReturnKey(key), value]),
      )
      for (const alias of [column.key, ...(column.aliases ?? [])]) {
        const value = normalizedEntries.get(normalizeReturnKey(alias))
        if (value !== undefined) return value
      }
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const record = recordValue(item)
        const key = compactText(record.key) || compactText(record.period) || compactText(record.interval) || compactText(record.label)
        if (!key) continue
        const matched = [column.key, ...(column.aliases ?? [])].some(alias => normalizeReturnKey(alias) === normalizeReturnKey(key))
        if (matched) return record.return_pct ?? record.change_pct ?? record.gain_pct ?? record.value
      }
    }
  }
  return undefined
}

function readTimeframeBadgeItems(value: unknown, side: WatchlistSignalBadge['side']): WatchlistSignalBadge[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      const record = recordValue(item)
      const label = compactText(record.badge) || compactText(record.freq)
      const itemSide = compactText(record.side) === 'sell' ? 'sell' : compactText(record.side) === 'buy' ? 'buy' : side
      return label ? { label, side: itemSide } : null
    })
    .filter((item): item is WatchlistSignalBadge => Boolean(item))
}

function timeframeSignalBadges(row: Record<string, unknown>): WatchlistSignalBadge[] {
  const sellBadges = readTimeframeBadgeItems(row.sell_timeframes, 'sell')
  const buyBadges = readTimeframeBadgeItems(row.buy_timeframes, 'buy')
  const seen = new Set<string>()
  return [...sellBadges, ...buyBadges].filter(item => {
    const key = `${item.side}:${item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function timeframeBadges(row: Record<string, unknown>): string[] {
  return timeframeSignalBadges(row).map(item => item.label)
}

function signalForWatchlist(row: Record<string, unknown>, kind: string): string {
  const badges = timeframeSignalBadges(row)
  if (badges.length > 0) return badges.map(item => item.label).join('/')
  const stackedSignals = [
    compactText(row.daily_latest_signal),
    compactText(row.f30_latest_signal),
    compactText(row.f15_latest_signal),
  ].filter(value => value && value !== '无')
  if (stackedSignals.length > 0) return stackedSignals.slice(0, 2).join('/')
  const evidenceSignal = compactText(recordValue(row.signal_evidence).signal_type)
  if (evidenceSignal) return evidenceSignal
  if (kind === 'industry' || kind === 'concept') {
    return (
      compactText(row.latest_signal) ||
      compactText(row.leader) ||
      compactText(recordValue(row.carrier).name) ||
      compactText(row.source)
    )
  }
  return (
    compactText(row.latest_signal) ||
    compactText(row.signal) ||
    compactText(row.reason) ||
    compactText(row.direction)
  )
}

function latestValueForWatchlist(row: Record<string, unknown>): string {
  const value =
    row.latest_price ??
    row.last_price ??
    row.price ??
    row.close ??
    row.latest ??
    row.current_price ??
    row.value
  const carrierValue = row.carrier_latest_price
  if (numberValue(value) === undefined && numberValue(carrierValue) !== undefined) {
    return `承接 ${formatNumber(carrierValue)}`
  }
  return numberValue(value) !== undefined ? formatNumber(value) : compactText(value, 'N/A')
}

function dayChangeForWatchlist(row: Record<string, unknown>): string {
  return formatPercent(
    row.day_change_pct ??
      row.daily_change_pct ??
      row.change_pct ??
      row.gain_pct ??
      row.return_pct ??
      row.daily_return ??
      row.intraday_change ??
      row.pct_chg,
  )
}

function codeForWatchlist(row: Record<string, unknown>): string {
  return (
    compactText(row.symbol) ||
    compactText(row.code) ||
    compactText(row.ts_code) ||
    compactText(row.ticker) ||
    compactText(row.label)
  )
}

function nameForWatchlist(row: Record<string, unknown>): string {
  return (
    compactText(row.name) ||
    compactText(row.stock_name) ||
    compactText(row.display_name) ||
    compactText(row.label) ||
    codeForWatchlist(row) ||
    'N/A'
  )
}

function labelForWatchlist(row: Record<string, unknown>): string {
  return compactText(row.label) || compactText(row.symbol) || compactText(row.code) || nameForWatchlist(row)
}

function watchlistTypeLabel(kind: string): string {
  if (kind === 'index') return '指数'
  if (kind === 'industry') return '行业'
  if (kind === 'concept') return '概念'
  return '股票'
}

function watchlistDedupeKey(row: Record<string, unknown>, kind: string): string {
  const identity = codeForWatchlist(row) || labelForWatchlist(row) || nameForWatchlist(row)
  return `${kind}:${identity.toLowerCase()}`
}

function toWatchlistRow(
  row: Record<string, unknown>,
  fallbackKind: string,
  index: number,
  rangeColumns: WatchlistRangeColumn[],
): WatchlistRow | null {
  const kind = kindForTarget(row, fallbackKind)
  const label = labelForWatchlist(row)
  const name = nameForWatchlist(row)
  if (!label && !name) return null
  const code = codeForWatchlist(row)
  const dayChange = dayChangeForWatchlist(row)
  const rangeValues = rangeColumns.map((column, columnIndex) => {
    const explicit = readRangeReturn(row, column)
    if (explicit !== undefined) return formatPercent(explicit)
    if (columnIndex === 0) return dayChange
    return 'N/A'
  })
  const targetKind = compactText(row.target_kind) || kind
  const targetLabel = compactText(row.target_label) || label
  const signalBadges = timeframeSignalBadges(row)
  const laneStatus = recordValue(row.lane_status)
  return {
    id: `${watchlistDedupeKey(row, kind)}:${index}`,
    kind,
    label,
    name,
    code,
    typeLabel: watchlistTypeLabel(kind),
    latest: latestValueForWatchlist(row),
    dayChange,
    rangeValues,
    signal: signalBadges.length > 0 ? signalBadges.map(item => item.label).join('/') : signalForWatchlist(row, kind),
    signalBadges,
    tags: tagsForWatchlist(row, kind),
    lane: compactText(row.lane),
    freshness: compactText(row.freshness) || compactText(laneStatus.freshness) || compactText(laneStatus.status),
    traderAction: compactText(row.trader_action) || compactText(row.action_status),
    invalidatesWhen: compactText(row.invalidates_when),
    explanation: compactText(row.explanation),
    traceSummary: compactText(row.trace_summary),
    targetKind,
    targetLabel,
    targetFreq: terminalListTargetFreq(row.target_freq),
    raw: row,
  }
}

function buildRowsForGroup(
  rows: Record<string, unknown>[],
  fallbackKind: string,
  rangeColumns: WatchlistRangeColumn[],
): WatchlistRow[] {
  const seen = new Set<string>()
  const output: WatchlistRow[] = []
  rows.forEach((row, index) => {
    const kind = kindForTarget(row, fallbackKind)
    const key = watchlistDedupeKey(row, kind)
    if (seen.has(key)) return
    seen.add(key)
    const item = toWatchlistRow(row, kind, index, rangeColumns)
    if (item) output.push(item)
  })
  return output
}

function buildWatchlistRows({
  watchlist,
  indices,
  buyRows,
  sellRows,
  decisionRows,
  clusterRows,
  rangeColumns,
}: {
  watchlist: Record<string, unknown>[]
  indices: Record<string, unknown>[]
  buyRows: Record<string, unknown>[]
  sellRows: Record<string, unknown>[]
  decisionRows: Record<string, unknown>[]
  clusterRows: Record<string, unknown>[]
  rangeColumns: WatchlistRangeColumn[]
}): WatchlistRow[] {
  const sources: Array<{ rows: Record<string, unknown>[]; kind: string }> = [
    { rows: watchlist.map(row => ({ ...row, kind: kindForTarget(row, 'auto') })), kind: 'auto' },
    { rows: indices.map(row => ({ ...row, kind: 'index' })), kind: 'index' },
    { rows: buyRows.map(row => ({ ...row, kind: kindForTarget(row, 'stock') })), kind: 'stock' },
    { rows: sellRows.map(row => ({ ...row, kind: kindForTarget(row, 'stock') })), kind: 'stock' },
    { rows: decisionRows.map(row => ({ ...row, kind: kindForTarget(row, 'stock') })), kind: 'stock' },
    { rows: clusterRows, kind: 'industry' },
  ]
  const seen = new Set<string>()
  const output: WatchlistRow[] = []
  sources.forEach(source => {
    source.rows.forEach((row, index) => {
      const kind = kindForTarget(row, source.kind)
      const key = watchlistDedupeKey(row, kind)
      if (seen.has(key)) return
      seen.add(key)
      const item = toWatchlistRow(row, kind, output.length + index, rangeColumns)
      if (item) output.push(item)
    })
  })
  return output
}

function watchlistRangeColumnsFromShell(shell: WorkbenchShell | null): WatchlistRangeColumn[] {
  const rawColumns = Array.isArray(shell?.watchlist_range_columns) ? shell.watchlist_range_columns : []
  const columns = rawColumns
    .map(column => {
      const record = recordValue(column)
      const key = compactText(record.key)
      if (!key) return null
      return {
        key,
        label: compactText(record.label, key),
        aliases: Array.isArray(record.aliases)
          ? record.aliases.map(alias => compactText(alias)).filter(Boolean)
          : [],
      } satisfies WatchlistRangeColumn
    })
    .filter((column): column is WatchlistRangeColumn => Boolean(column))
  return columns.length > 0 ? columns : WATCHLIST_RANGE_COLUMNS
}

function watchlistRowIsActive(row: WatchlistRow, target: ChartTarget): boolean {
  if ((row.targetKind || row.kind) !== target.kind) return false
  return row.targetLabel === target.label || row.label === target.label || row.code === target.label || row.name === target.label
}

const candidateGroupOrder = ['leaders', 'weighted', 'elastic', 'source_leaders', 'constituents']

function candidateGroupLabel(key: string, locale: LongclawLocale): string {
  const labels: Record<string, [string, string]> = {
    leaders: ['龙头梯队', 'Leaders'],
    weighted: ['权重/链主', 'Weighted'],
    elastic: ['弹性标的', 'Elastic'],
    source_leaders: ['当日领涨', 'Top movers'],
    constituents: ['成分候选', 'Constituents'],
  }
  const label = labels[key]
  if (!label) return key
  return locale === 'zh-CN' ? label[0] : label[1]
}

function candidateGroupsFromSymbolData(symbolData: WorkbenchSymbolData | null): Record<string, Record<string, unknown>[]> {
  const raw = recordValue(symbolData?.candidate_groups)
  const groups: Record<string, Record<string, unknown>[]> = {}
  candidateGroupOrder.forEach(key => {
    const value = raw[key]
    groups[key] = Array.isArray(value) ? value.map(item => recordValue(item)).filter(item => Object.keys(item).length > 0) : []
  })
  return groups
}

export function StrategyChartTerminal({
  locale,
  dashboard,
  signalsWebBaseUrl,
  onOpenRecord,
}: StrategyChartTerminalProps) {
  const baseUrl = trimTrailingSlash(signalsWebBaseUrl) || urlFromDashboard(dashboard)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<Chart | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const activeRequestRef = useRef(0)
  const shellRefreshInFlightRef = useRef(false)
  const silentSymbolRefreshInFlightRef = useRef(false)
  const dashboardRef = useRef(dashboard)
  const lastChartUpdateSilentRef = useRef(false)
  const autoCollapsedForFocusRef = useRef(false)
  const [shell, setShell] = useState<WorkbenchShell | null>(null)
  const [target, setTarget] = useState<ChartTarget>(() => initialTargetFrom(null, dashboard))
  const [symbolData, setSymbolData] = useState<WorkbenchSymbolData | null>(null)
  const [searchDraft, setSearchDraft] = useState(target.label)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)
  const [activeWatchlistTab, setActiveWatchlistTab] = useState<WatchlistTabKey>('macro_indices')
  const [selectedRangeKey, setSelectedRangeKey] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === 'undefined' ? 1600 : window.innerWidth))

  const klineData = useMemo(() => toKLineData(symbolData?.chart), [symbolData])
  const signals = useMemo(() => signalsFromSymbolData(symbolData), [symbolData])
  const visibleCustomSignals = useMemo(() => signals.filter(isCustomUserSignal), [signals])
  const customSignalCount = useMemo(
    () => numberValue(symbolData?.custom_signal_count) ?? visibleCustomSignals.length,
    [symbolData?.custom_signal_count, visibleCustomSignals.length],
  )
  const directCustomSignalCount = numberValue(symbolData?.direct_custom_signal_count) ?? customSignalCount
  const availableCustomSignalFreqOptions = useMemo(
    () => (Array.isArray(symbolData?.available_custom_signal_freqs) ? symbolData.available_custom_signal_freqs : [])
      .map(freq => ({
        raw: freq,
        value: normalizeSignalFreq(freq) || freq,
        label: displayFreqLabel(freq),
      }))
      .filter(item => Boolean(item.label)),
    [symbolData?.available_custom_signal_freqs],
  )
  const hiddenReasons = useMemo(
    () => (Array.isArray(symbolData?.hidden_reasons) ? symbolData.hidden_reasons : []),
    [symbolData?.hidden_reasons],
  )
  const relatedCustomSignals = useMemo(
    () => (Array.isArray(symbolData?.related_custom_signals) ? symbolData.related_custom_signals : []),
    [symbolData?.related_custom_signals],
  )
  const chartVisibleSignals = useMemo(() => displaySignalsForChart(klineData, signals), [klineData, signals])
  const evidenceSignals = useMemo(() => displaySignalsForEvidence(signals), [signals])
  const currentVisibleSignals = useMemo(() => chartVisibleSignals.filter(isCustomUserSignal), [chartVisibleSignals])
  const evidenceCustomSignals = useMemo(() => evidenceSignals.filter(isCustomUserSignal), [evidenceSignals])
  const otherEvidenceSignals = useMemo(() => evidenceSignals.filter(signal => !isCustomUserSignal(signal)), [evidenceSignals])
  const keyLevels = useMemo(() => keyLevelsFromSymbolData(symbolData), [symbolData])
  const targetFreqs = useMemo(() => availableFreqs(symbolData), [symbolData])
  const liveRefresh = shouldUseLiveRefresh(shell?.session)
  const connectorAlerts = useMemo(
    () =>
      dashboard.connector_health.filter(item => {
        const status = String(item.status ?? '').toLowerCase()
        return status && !['available', 'connected', 'open', 'ready', 'success'].includes(status)
      }).length,
    [dashboard.connector_health],
  )

  const dailyBrief = dashboard.daily_brief
  const dailyBriefBullets = Array.isArray(dailyBrief.bullets) ? dailyBrief.bullets : []
  const decisionRows = (Array.isArray(shell?.decision_queue) && shell.decision_queue.length > 0
    ? shell.decision_queue
    : dashboard.decision_queue) as Array<Record<string, unknown>>
  const shellStrategyKpis = normalizeMetricRows(shell?.strategy_kpis, 'kpi_id', 'value')
  const dashboardStrategyKpis = normalizeMetricRows(dashboard.strategy_kpis, 'kpi_id', 'value')
  const strategyKpis = shellStrategyKpis.length > 0 ? shellStrategyKpis : dashboardStrategyKpis
  const shellSourceConfidence = normalizeMetricRows(shell?.source_confidence, 'source_id', 'confidence')
  const dashboardSourceConfidence = normalizeMetricRows(dashboard.source_confidence, 'source_id', 'confidence')
  const sourceConfidence = shellSourceConfidence.length > 0 ? shellSourceConfidence : dashboardSourceConfidence
  const laneRows = useMemo(() => syncLaneRows(shell?.sync_lanes), [shell?.sync_lanes])
  const dataIssueRows = useMemo(
    () =>
      [...laneRows, ...sourceConfidence].filter(row => {
        const status = compactText(row.status).toLowerCase()
        const freshness = compactText(row.freshness).toLowerCase()
        const confidence = numberValue(row.confidence ?? row.score)
        return (
          ['stale', 'unavailable', 'degraded', 'error', 'failed', 'missing'].some(token =>
            status.includes(token) || freshness.includes(token),
          ) ||
          compactText(row.reason) ||
          (confidence !== undefined && confidence < 0.8)
        )
      }),
    [laneRows, sourceConfidence],
  )
  const shellBuyCandidates = Array.isArray(shell?.buy_candidates) ? shell.buy_candidates : []
  const buyRows = shellBuyCandidates.length > 0
    ? shellBuyCandidates
    : dashboard.buy_candidates as Array<Record<string, unknown>>
  const targetCandidateRows = Array.isArray(symbolData?.candidate_stocks) ? symbolData.candidate_stocks : []
  const targetCandidateGroups = useMemo(() => candidateGroupsFromSymbolData(symbolData), [symbolData])
  const sellRows = dashboard.sell_warnings as Array<Record<string, unknown>>
  const indexTargets = shell?.indices ?? []
  const clusterRows = rowsFromCluster(shell?.cluster_summary)
  const shellWatchlist = Array.isArray(shell?.watchlist) ? shell.watchlist : []
  const watchlistRangeColumns = useMemo(() => watchlistRangeColumnsFromShell(shell), [shell])
  const selectedRangeColumn = useMemo(() => {
    const preferredKey = selectedRangeKey || watchlistRangeColumns[0]?.key || ''
    return watchlistRangeColumns.find(column => column.key === preferredKey) ?? watchlistRangeColumns[0]
  }, [selectedRangeKey, watchlistRangeColumns])
  const visibleRangeColumns = useMemo(
    () => (selectedRangeColumn ? [selectedRangeColumn] : []),
    [selectedRangeColumn],
  )
  const groupedWatchlistRows = useMemo(() => {
    const groups = shell?.watchlist_groups ?? {}
    const macroRows = Array.isArray(groups.macro_indices) && groups.macro_indices.length > 0
      ? groups.macro_indices
      : indexTargets
    const sectorRows = Array.isArray(groups.sector_boards) && groups.sector_boards.length > 0
      ? groups.sector_boards
      : clusterRows
    const candidateRows = Array.isArray(groups.buy_candidates) && groups.buy_candidates.length > 0
      ? groups.buy_candidates
      : buyRows
    const focusRows = Array.isArray(groups.focus_stocks) ? groups.focus_stocks : []
    const riskRows = Array.isArray(groups.risk_stocks) ? groups.risk_stocks : []
    const watchRows = Array.isArray(groups.watch_stocks) ? groups.watch_stocks : []
    const legacyRows = buildWatchlistRows({
      watchlist: shellWatchlist,
      indices: indexTargets,
      buyRows,
      sellRows,
      decisionRows,
      clusterRows,
      rangeColumns: visibleRangeColumns,
    })
    return {
      macro_indices: buildRowsForGroup(macroRows, 'index', visibleRangeColumns),
      sector_boards: buildRowsForGroup(sectorRows, 'industry', visibleRangeColumns),
      buy_candidates: buildRowsForGroup(candidateRows, 'stock', visibleRangeColumns),
      focus_stocks: buildRowsForGroup(focusRows, 'stock', visibleRangeColumns),
      risk_stocks: buildRowsForGroup(riskRows, 'stock', visibleRangeColumns),
      watch_stocks: buildRowsForGroup(watchRows, 'stock', visibleRangeColumns),
      legacy: legacyRows,
    }
  }, [buyRows, clusterRows, decisionRows, indexTargets, sellRows, shell?.watchlist_groups, shellWatchlist, visibleRangeColumns])
  const activeWatchlistRows = groupedWatchlistRows[activeWatchlistTab].length > 0
    ? groupedWatchlistRows[activeWatchlistTab]
    : (activeWatchlistTab === 'macro_indices' || activeWatchlistTab === 'sector_boards' ? groupedWatchlistRows.legacy : [])
  const focusGroupMeta = recordValue(recordValue(shell?.watchlist_groups_meta).focus_stocks)
  const activeWatchlistEmptyText = activeWatchlistTab === 'focus_stocks'
    ? (compactText(focusGroupMeta.empty_reason)
      ? `${locale === 'zh-CN' ? '真实买点为空' : 'Entry pool empty'}: ${compactText(focusGroupMeta.empty_reason)}`
      : (locale === 'zh-CN' ? '真实买点为空，观察/预热和策略候选已拆开。' : 'Entry pool is empty. Watch and strategy candidates are separate.'))
    : activeWatchlistTab === 'risk_stocks'
      ? (locale === 'zh-CN' ? '暂无风险/止盈止损。' : 'No risk controls.')
      : activeWatchlistTab === 'watch_stocks'
        ? (locale === 'zh-CN' ? '暂无观察/预热标的。' : 'No watch/preheat stocks.')
    : activeWatchlistTab === 'buy_candidates'
      ? (locale === 'zh-CN' ? '暂无策略候选。' : 'No strategy candidates.')
      : (locale === 'zh-CN' ? '等待 Signals shell。' : 'Waiting for Signals shell.')
  const latestSignal = compactText(symbolData?.summary?.latest_signal, dashboard.chart_context?.latest_signal ?? '')
  const summaryTitle =
    compactText(symbolData?.summary?.title) ||
    compactText(symbolData?.target?.label) ||
    target.label
  const summarySubtitle =
    compactText(symbolData?.summary?.subtitle) ||
    compactText(symbolData?.target?.symbol) ||
    compactText(symbolData?.target?.kind, target.kind)
  const currentFreq = symbolData?.target?.effective_freq ?? target.freq
  const otherCustomSignalFreqOptions = useMemo(
    () => availableCustomSignalFreqOptions.filter(item => item.value && item.value !== normalizeSignalFreq(currentFreq)),
    [availableCustomSignalFreqOptions, currentFreq],
  )
  const layoutMode = terminalLayoutMode(viewportWidth)
  const chartTimezone = useMemo(() => chartMarketTimezone(symbolData, shell), [shell, symbolData])
  const chartLineage = useMemo(() => chartLineageLabel(symbolData, locale), [locale, symbolData])
  const chartFormula = useMemo(() => chartFormulaLabel(symbolData, locale), [locale, symbolData])
  const chartMeta = recordValue(symbolData?.chart?.meta)
  const primaryValueLabel = chartMeta.is_price_kline === false
    ? (locale === 'zh-CN' ? '热度收盘' : 'Heat close')
    : (locale === 'zh-CN' ? '最新价' : 'Last')
  const updatedTimeLabel =
    compactText(shell?.session?.data_as_of) ||
    (lastUpdated ? readableTime(lastUpdated, locale, chartTimezone) : '')
  const activeMaPeriods = useMemo(() => maPeriodsForFreq(currentFreq), [currentFreq])
  const divergences = useMemo(() => macdDivergences(klineData, currentFreq), [currentFreq, klineData])
  const chartKeyLevels = useMemo(
    () => mergeKeyLevels(keyLevels, derivedMaKeyLevels(klineData, currentFreq)),
    [currentFreq, keyLevels, klineData],
  )
  const requestedFreq = symbolData?.target?.requested_freq
  const effectiveFreq = symbolData?.target?.effective_freq
  const freqFallbackNotice =
    requestedFreq && effectiveFreq && requestedFreq !== effectiveFreq
      ? (locale === 'zh-CN'
          ? `${requestedFreq} 暂不可用，已使用 ${effectiveFreq}。`
          : `${requestedFreq} is unavailable; using ${effectiveFreq}.`)
      : null
  const chartCacheNotice = useMemo(
    () => chartCacheNotReadyMessage(symbolData, locale),
    [locale, symbolData],
  )

  const loadShell = useCallback(
    async (signal?: AbortSignal) => {
      if (!baseUrl) return null
      if (shellRefreshInFlightRef.current) return null
      shellRefreshInFlightRef.current = true
      try {
        const nextShell = await fetchJson<WorkbenchShell>(
          baseUrl,
          '/api/workbench/shell',
          signal,
          'strategy.shell',
        )
        setShell(nextShell)
        return nextShell
      } finally {
        shellRefreshInFlightRef.current = false
      }
    },
    [baseUrl],
  )

  const loadSymbol = useCallback(
    async (nextTarget: ChartTarget, options: { signal?: AbortSignal; silent?: boolean } = {}) => {
      if (!baseUrl) return
      if (options.silent && silentSymbolRefreshInFlightRef.current) return
      if (options.silent) silentSymbolRefreshInFlightRef.current = true
      const requestId = activeRequestRef.current + 1
      activeRequestRef.current = requestId
      if (!options.silent) setLoading(true)
      setError(null)
      try {
        const nextSymbolData = await fetchJson<WorkbenchSymbolData>(
          baseUrl,
          `/api/workbench/symbol/${encodeURIComponent(nextTarget.label)}?${new URLSearchParams({
            kind: nextTarget.kind || 'auto',
            freq: nextTarget.freq || DEFAULT_TERMINAL_FREQ,
          }).toString()}`,
          options.signal,
          'strategy.symbol',
          options.silent ? 'background-refresh' : 'load-symbol',
        )
        if (requestId !== activeRequestRef.current) return
        lastChartUpdateSilentRef.current = Boolean(options.silent)
        setSymbolData(nextSymbolData)
        setBooting(false)
        setBootAttempt(0)
        setLastUpdated(new Date())
        const effectiveTarget = nextSymbolData.target
        if (effectiveTarget) {
          const requested = compactText(effectiveTarget.requested_freq, nextTarget.freq)
          const effective = compactText(effectiveTarget.effective_freq, nextTarget.freq)
          if (requested && effective && requested !== effective) {
            recordObservationEvent('strategy.freq.fallback', {
              requested_freq: requested,
              effective_freq: effective,
              target: nextTarget.label,
              kind: nextTarget.kind,
              silent: Boolean(options.silent),
              level: 'warning',
            })
          }
          setTarget(previous => {
            const effectiveKind = compactText(effectiveTarget.kind, previous.kind)
            const keepsLogicalLabel = ['index', 'industry', 'concept'].includes(effectiveKind)
            return {
              label: keepsLogicalLabel
                ? compactText(effectiveTarget.label, previous.label)
                : compactText(effectiveTarget.symbol) || compactText(effectiveTarget.label) || previous.label,
              kind: effectiveKind,
              freq: compactText(effectiveTarget.effective_freq, previous.freq),
            }
          })
        }
      } catch (rawError) {
        if (options.signal?.aborted) return
        const apiError = rawError as ApiError
        if (apiError.status === 503) {
          const session = recordValue(apiError.payload?.session) as WorkbenchSession
          setShell(previous => ({ ...(previous ?? {}), session }))
          setBooting(true)
          setBootAttempt(previous => previous + 1)
          setError(apiError.message)
          return
        }
        setBooting(false)
        setError(apiError.message || (locale === 'zh-CN' ? 'Signals 图表数据加载失败。' : 'Failed to load Signals chart data.'))
      } finally {
        if (options.silent) silentSymbolRefreshInFlightRef.current = false
        if (requestId === activeRequestRef.current) setLoading(false)
      }
    },
    [baseUrl, locale],
  )

  useEffect(() => {
    dashboardRef.current = dashboard
  }, [dashboard])

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (layoutMode === 'focus' && !autoCollapsedForFocusRef.current) {
      autoCollapsedForFocusRef.current = true
      setRightCollapsed(true)
      return
    }
    if (layoutMode !== 'focus') {
      autoCollapsedForFocusRef.current = false
    }
  }, [layoutMode])

  useEffect(() => {
    setSearchDraft(target.label)
  }, [target.label])

  useEffect(() => {
    if (watchlistRangeColumns.length === 0) return
    if (!selectedRangeKey || !watchlistRangeColumns.some(column => column.key === selectedRangeKey)) {
      const ytd = watchlistRangeColumns.find(column => column.key === 'ytd')
      setSelectedRangeKey((ytd ?? watchlistRangeColumns[0]).key)
    }
  }, [selectedRangeKey, watchlistRangeColumns])

  useEffect(() => {
    if (!baseUrl) return
    const controller = new AbortController()
    setShell(null)
    setSymbolData(null)
    setError(null)
    setBooting(false)
    setLoading(true)
    void (async () => {
      const fallbackTarget = initialTargetFrom(null, dashboardRef.current)
      recordObservationEvent('strategy.init-target', {
        target: fallbackTarget,
        reason: 'fast-static-initial-target',
      })
      setTarget(fallbackTarget)
      setSearchDraft(fallbackTarget.label)
      const shellResult = loadShell(controller.signal)
      const symbolResult = loadSymbol(fallbackTarget, { signal: controller.signal })
      const [shellOutcome, symbolOutcome] = await Promise.allSettled([shellResult, symbolResult])
      if (controller.signal.aborted) return
      if (shellOutcome.status === 'fulfilled' && shellOutcome.value) {
        const shellTarget = initialTargetFrom(shellOutcome.value, dashboardRef.current)
        if (shellTarget.label !== fallbackTarget.label || shellTarget.kind !== fallbackTarget.kind) {
          recordObservationEvent('strategy.init-target.resolved', {
            target: shellTarget,
            fallback_target: fallbackTarget,
            reason: 'shell-loaded-after-fast-target',
          })
        }
      }
      if (shellOutcome.status === 'rejected' && symbolOutcome.status === 'rejected') {
        const apiError = shellOutcome.reason as ApiError
        setError(apiError.message || (locale === 'zh-CN' ? 'Signals 终端初始化失败。' : 'Failed to initialize Signals terminal.'))
      }
      setLoading(false)
    })()
    return () => controller.abort()
  }, [baseUrl, loadShell, loadSymbol, locale])

  useEffect(() => {
    if (!baseUrl || !target.label) return
    const controllers = new Set<AbortController>()
    const shellRefreshMs = liveRefresh ? 60_000 : 120_000
    const symbolRefreshMs = liveRefresh ? 15_000 : 60_000
    const refreshShell = () => {
      const controller = new AbortController()
      controllers.add(controller)
      void loadShell(controller.signal).catch(() => undefined)
        .finally(() => {
          controllers.delete(controller)
        })
    }
    const refreshSymbol = () => {
      const controller = new AbortController()
      controllers.add(controller)
      void loadSymbol(target, { signal: controller.signal, silent: true })
        .finally(() => {
          controllers.delete(controller)
        })
    }
    const shellTimer = window.setInterval(refreshShell, shellRefreshMs)
    const symbolTimer = window.setInterval(refreshSymbol, symbolRefreshMs)
    return () => {
      window.clearInterval(shellTimer)
      window.clearInterval(symbolTimer)
      controllers.forEach(controller => controller.abort())
      controllers.clear()
    }
  }, [baseUrl, liveRefresh, loadShell, loadSymbol, target])

  useEffect(() => {
    if (!baseUrl || !booting || !target.label) return
    const controller = new AbortController()
    const delay = Math.min(8_000, 1_200 * Math.max(bootAttempt, 1))
    const timer = window.setTimeout(() => {
      void loadShell(controller.signal).catch(() => undefined)
      void loadSymbol(target, { signal: controller.signal, silent: true })
    }, delay)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [baseUrl, bootAttempt, booting, loadShell, loadSymbol, target])

  useEffect(() => {
    if (!chartContainerRef.current) return
    ensureSignalOverlay()
    ensureDivergenceOverlay()
    ensureMacdZeroIndicator()
    const chart = init(chartContainerRef.current, {
      locale: locale === 'zh-CN' ? 'zh-CN' : 'en-US',
      timezone: 'Asia/Shanghai',
      styles: chartStyles(),
    })
    if (!chart) return
    chartRef.current = chart
    chart.setBarSpace(chartBarSpaceForMode(layoutMode))
    chart.setOffsetRightDistance(chartRightOffsetForMode(layoutMode))
    createChartIndicators(chart, target.freq)
    resizeObserverRef.current = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
      resizeFrameRef.current = window.requestAnimationFrame(() => {
        resizeFrameRef.current = null
        chart.resize()
      })
    })
    resizeObserverRef.current.observe(chartContainerRef.current)
    return () => {
      if (resizeFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      chartRef.current = null
      dispose(chart)
    }
  }, [baseUrl, locale])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setBarSpace(chartBarSpaceForMode(layoutMode))
    chart.setOffsetRightDistance(chartRightOffsetForMode(layoutMode))
    chart.resize()
  }, [layoutMode])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setTimezone(chartTimezone)
  }, [chartTimezone])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    applyMovingAverageIndicator(chart, currentFreq)
  }, [currentFreq])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.setStyles(chartStyles())
    chart.setLocale(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
  }, [locale])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay({ groupId: SIGNAL_OVERLAY_GROUP })
    chart.removeOverlay({ groupId: LEVEL_OVERLAY_GROUP })
    chart.removeOverlay({ groupId: DIVERGENCE_OVERLAY_GROUP })
    if (klineData.length === 0) {
      chart.clearData()
      return
    }
    chart.applyNewData(klineData)
    createSignalOverlays(chart, klineData, signals)
    createLevelOverlays(chart, klineData, chartKeyLevels)
    createDivergenceOverlays(chart, divergences)
    if (!lastChartUpdateSilentRef.current) {
      chart.scrollToRealTime()
    }
    chart.resize()
  }, [chartKeyLevels, divergences, klineData, signals])

  const selectTarget = useCallback(
    (next: ChartTarget, source = 'strategy.target.select') => {
      recordObservationEvent(source, {
        previous: target,
        next,
      })
      setTarget(next)
      setSearchDraft(next.label)
      void loadSymbol(next)
    },
    [loadSymbol, target],
  )

  const submitSearch = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const value = searchDraft.trim()
      if (!value) return
      const isIndex = indexTargets.some(row => targetMatchesSearchValue(row, value)) || looksLikeIndexValue(value)
      selectTarget(
        { label: value, kind: isIndex ? 'index' : 'auto', freq: target.freq || DEFAULT_TERMINAL_FREQ },
        'strategy.search.submit',
      )
    },
    [indexTargets, searchDraft, selectTarget, target.freq],
  )

  const refreshNow = useCallback(() => {
    if (!target.label) return
    recordObservationEvent('strategy.refresh.click', { target })
    void loadShell().catch(() => undefined)
    void loadSymbol(target)
  }, [loadShell, loadSymbol, target])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isEditableKeyboardTarget(event.target)) return
      if (event.key === '[') {
        event.preventDefault()
        setLeftCollapsed(previous => !previous)
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        setRightCollapsed(previous => !previous)
        return
      }
      if (event.key === 'Escape') {
        setLeftCollapsed(false)
        setRightCollapsed(false)
        return
      }
      if (event.key.toLowerCase() === 'f') {
        event.preventDefault()
        const enteringFocus = !(leftCollapsed && rightCollapsed)
        setLeftCollapsed(enteringFocus)
        setRightCollapsed(enteringFocus)
        return
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        refreshNow()
        return
      }
      const freqIndex = Number(event.key) - 1
      const nextFreq = FREQ_OPTIONS[freqIndex]
      if (nextFreq && targetFreqs.includes(nextFreq.value)) {
        event.preventDefault()
        selectTarget({ ...target, freq: nextFreq.value }, 'strategy.keyboard.freq')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [leftCollapsed, refreshNow, rightCollapsed, selectTarget, target, targetFreqs])

  if (!baseUrl) {
    return (
      <div style={terminalRootStyle}>
        <div style={warningDarkStyle}>
          {locale === 'zh-CN'
            ? '信号实时入口未配置，当前显示降级摘要。'
            : 'Signals live endpoint is not configured. Showing a degraded summary.'}
        </div>
        <CacheMonitorStrip locale={locale} cacheStatus={dashboard.cache_status} mode={layoutMode} />
        <div style={fallbackGridStyle}>
          <Panel
            title={locale === 'zh-CN' ? 'Daily brief' : 'Daily brief'}
            meta={compactText(dailyBrief.market_bias)}
          >
            <div style={compactListStyle}>
              <div style={dataRowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <div style={rowTitleStyle}>
                    {compactText(dailyBrief.headline, locale === 'zh-CN' ? '暂无摘要标题' : 'No brief headline')}
                  </div>
                  <div style={mutedTextStyle}>
                    {compactText(dailyBrief.summary, locale === 'zh-CN' ? '暂无策略摘要。' : 'No strategy summary yet.')}
                  </div>
                </div>
              </div>
              {dailyBriefBullets.slice(0, 3).map((item, index) => (
                <div key={`${item}-${index}`} style={dataRowStyle}>
                  <div style={mutedTextStyle}>{item}</div>
                </div>
              ))}
            </div>
          </Panel>
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '买入候选' : 'Buy candidates'}
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
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '卖出预警' : 'Sell warnings'}
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
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '交易员待办' : 'Trader queue'}
            rows={decisionRows.map(item => ({
              ...item,
              name: compactText(item.title) || compactText(item.symbol) || compactText(item.decision_id),
            }))}
            onOpen={item =>
              onOpenRecord(
                locale === 'zh-CN'
                  ? `决策 ${String(item.symbol ?? item.decision_id ?? 'queue')}`
                  : `Decision ${String(item.symbol ?? item.decision_id ?? 'queue')}`,
                item,
              )
            }
          />
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '策略证据' : 'Strategy evidence'}
            rows={strategyKpis.map(item => ({
              ...item,
              name: compactText(item.label) || compactText(item.kpi_id),
              summary: [
                compactText(item.value),
                compactText(item.unit),
                compactText(item.status),
              ].filter(Boolean).join(' '),
            }))}
            onOpen={item =>
              onOpenRecord(
                locale === 'zh-CN'
                  ? `KPI ${String(item.label ?? item.kpi_id ?? 'strategy')}`
                  : `KPI ${String(item.label ?? item.kpi_id ?? 'strategy')}`,
                item,
              )
            }
          />
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '数据源状态' : 'Data source status'}
            rows={sourceConfidence.map(item => ({
              ...item,
              connector_id: compactText(item.source_id) || compactText(item.label),
              name: compactText(item.label) || compactText(item.source_id),
              summary: [
                formatConfidence(item.confidence),
                compactText(item.status),
                compactText(item.summary),
              ].filter(Boolean).join(' · '),
            }))}
            onOpen={item =>
              onOpenRecord(
                locale === 'zh-CN'
                  ? `来源 ${String(item.label ?? item.source_id ?? 'source')}`
                  : `Source ${String(item.label ?? item.source_id ?? 'source')}`,
                item,
              )
            }
          />
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '连接器' : 'Connectors'}
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
        </div>
      </div>
    )
  }

  return (
    <div style={terminalRootStyle}>
      <div style={terminalTopBarStyle(layoutMode)}>
        <form style={searchFormStyle(layoutMode)} onSubmit={submitSearch}>
          <input
            aria-label={locale === 'zh-CN' ? '搜索标的' : 'Search symbol'}
            style={searchInputStyle}
            value={searchDraft}
            placeholder={locale === 'zh-CN' ? '输入指数 / 行业 / 股票代码或名称…' : 'Index, sector, ticker, or name…'}
            onChange={event => setSearchDraft(event.target.value)}
          />
          <button type="submit" style={terminalButtonStyle(false)}>
            {locale === 'zh-CN' ? '切换' : 'Switch'}
          </button>
        </form>
        <div style={topBarButtonGroupStyle(layoutMode)}>
          {FREQ_OPTIONS.map((freq, index) => {
            const active = currentFreq === freq.value
            const disabled = !targetFreqs.includes(freq.value)
            return (
              <button
                key={freq.value}
                type="button"
                aria-label={`${locale === 'zh-CN' ? '切换周期' : 'Switch frequency'} ${freq.label}`}
                title={`${freq.label} (${index + 1})`}
                style={terminalButtonStyle(active, disabled)}
                disabled={disabled}
                onClick={() => selectTarget({ ...target, freq: freq.value }, 'strategy.freq.click')}
              >
                {freq.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-label={locale === 'zh-CN' ? '刷新交易台' : 'Refresh trading desk'}
          title={locale === 'zh-CN' ? '刷新交易台 (R)' : 'Refresh trading desk (R)'}
          style={{ ...terminalButtonStyle(false, loading), marginLeft: 'auto' }}
          disabled={loading}
          onClick={refreshNow}
        >
          {loading ? (locale === 'zh-CN' ? '刷新中' : 'Refreshing') : (locale === 'zh-CN' ? '刷新' : 'Refresh')}
        </button>
      </div>

      <CacheMonitorStrip locale={locale} cacheStatus={dashboard.cache_status} mode={layoutMode} />

      {shell?.notices?.length ? (
        <div style={noticeDarkStyle}>{shell.notices.join(' ')}</div>
      ) : null}
      {freqFallbackNotice ? (
        <div style={warningDarkStyle}>{freqFallbackNotice}</div>
      ) : null}
      {chartCacheNotice ? (
        <div style={warningDarkStyle}>{chartCacheNotice}</div>
      ) : null}
      {error ? (
        <div style={booting ? warningDarkStyle : errorDarkStyle}>{error}</div>
      ) : null}
      {compactText(dailyBrief.headline) || compactText(dailyBrief.summary) ? (
        <div style={noticeDarkStyle}>
          {[
            compactText(dailyBrief.headline),
            compactText(dailyBrief.summary),
            compactText(dailyBrief.market_bias),
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      ) : null}

      <div style={terminalGridLayoutStyle(leftCollapsed, rightCollapsed, layoutMode)}>
        {leftCollapsed ? (
          <div style={collapsedSideStyle}>
            <button
              type="button"
              aria-label={locale === 'zh-CN' ? '展开观察台' : 'Expand watchlist'}
              title={locale === 'zh-CN' ? '展开观察台 ([)' : 'Expand watchlist ([)'}
              style={verticalCollapseButtonStyle}
              onClick={() => setLeftCollapsed(false)}
            >
              {locale === 'zh-CN' ? '主观察' : 'Watchlist'}
            </button>
          </div>
        ) : (
        <div style={terminalSideStyle}>
          <Panel
            title={locale === 'zh-CN' ? '交易员第二屏' : 'Trader second screen'}
            meta={marketLabel(shell?.session, locale)}
            actions={(
              <button
                type="button"
                aria-label={locale === 'zh-CN' ? '收起观察台' : 'Collapse watchlist'}
                title={locale === 'zh-CN' ? '收起观察台 ([)' : 'Collapse watchlist ([)'}
                style={panelActionButtonStyle}
                onClick={() => setLeftCollapsed(true)}
              >
                {locale === 'zh-CN' ? '收起' : 'Collapse'}
              </button>
            )}
          >
            <WatchlistTabbedTable
              locale={locale}
              activeTab={activeWatchlistTab}
              onTabChange={setActiveWatchlistTab}
              groups={groupedWatchlistRows}
              rows={activeWatchlistRows}
              target={target}
              rangeColumns={visibleRangeColumns}
              allRangeColumns={watchlistRangeColumns}
              selectedRangeKey={selectedRangeColumn?.key ?? ''}
              onRangeChange={setSelectedRangeKey}
              emptyText={activeWatchlistEmptyText}
              onSelect={row =>
                selectTarget(
                  {
                    label: row.targetLabel || row.label,
                    kind: row.targetKind || row.kind,
                    freq: terminalListTargetFreq(row.targetFreq, target.freq),
                  },
                  'strategy.watchlist.click',
                )
              }
            />
          </Panel>
        </div>
        )}

        <div style={chartStageStyle}>
          <div style={chartHeaderStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div style={eyebrowDarkStyle}>
                {compactText(symbolData?.target?.kind, target.kind).toUpperCase()}
              </div>
              <div style={chartTitleStyle(layoutMode)}>{summaryTitle}</div>
              <div style={chartSubtitleStyle}>
                {[summarySubtitle, currentFreq, chartTimezone, latestSignal || undefined].filter(Boolean).join(' · ')}
              </div>
              {chartLineage ? (
                <div style={mutedTextStyle}>{chartLineage}</div>
              ) : null}
              {chartFormula ? (
                <div style={mutedTextStyle}>{chartFormula}</div>
              ) : null}
              <div style={indicatorLegendStyle}>
                {activeMaPeriods.map((period, index) => (
                  <span key={`ma-${period}`} style={indicatorLegendItemStyle}>
                    <span style={{ ...indicatorLegendSwatchStyle, background: MA_COLORS[index % MA_COLORS.length] }} />
                    {`MA${period}`}
                  </span>
                ))}
                {MACD_LINE_COLORS.map((color, index) => (
                  <span key={`macd-${index}`} style={indicatorLegendItemStyle}>
                    <span style={{ ...indicatorLegendSwatchStyle, background: color }} />
                    {index === 0 ? 'DIF' : 'DEA'}
                  </span>
                ))}
                <span style={indicatorLegendItemStyle}>
                  <span style={{ ...indicatorLegendSwatchStyle, background: tradingDeskTheme.alpha.textBorderStrong }} />
                  MACD 0
                </span>
                {isDailyFreq(currentFreq) ? (
                  <span style={indicatorLegendItemStyle}>
                    <span style={{ ...indicatorLegendSwatchStyle, background: tradingDeskTheme.chart.line }} />
                    MA50/200关键位
                  </span>
                ) : null}
                <span style={indicatorLegendItemStyle}>
                  <span style={{ ...indicatorLegendSwatchStyle, background: tradingDeskTheme.market.up }} />
                  {locale === 'zh-CN' ? `背离 ${divergences.length}` : `Divergence ${divergences.length}`}
                </span>
              </div>
            </div>
            <div style={chartHeaderRightStyle(layoutMode)}>
              <div style={headerMetricsStyle(layoutMode)}>
                {[
                  [primaryValueLabel, formatNumber(symbolData?.summary?.latest_price ?? latestClose(klineData))],
                  [locale === 'zh-CN' ? '信号' : 'Signal', latestSignal || 'N/A'],
                  [locale === 'zh-CN' ? '涨幅' : 'Change', formatPercent(symbolData?.summary?.gain_pct)],
                ].map(([label, value]) => (
                  <div key={label} style={headerMetricStyle}>
                    <div style={eyebrowDarkStyle}>{label}</div>
                    <div style={headerMetricValueStyle}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  {connectorAlerts > 0 ? (
                    <span style={statusBadgeStyle('warning')}>
                      {locale === 'zh-CN' ? `连接 ${connectorAlerts}` : `${connectorAlerts} connectors`}
                    </span>
                  ) : null}
                  <span style={statusBadgeStyle(booting ? 'warning' : loading ? 'running' : 'open')}>
                    {booting
                      ? (locale === 'zh-CN' ? '启动中' : 'Booting')
                      : loading
                        ? (locale === 'zh-CN' ? '刷新中' : 'Refreshing')
                        : marketLabel(shell?.session, locale)}
                  </span>
                </div>
                <div style={mutedTextStyle}>
                  {updatedTimeLabel
                    ? `${locale === 'zh-CN' ? '更新' : 'Updated'} ${updatedTimeLabel}`
                    : (locale === 'zh-CN' ? '等待数据' : 'Waiting for data')}
                </div>
              </div>
            </div>
          </div>

          {symbolData?.summary?.conclusion ? (
            <div style={chartConclusionStyle}>{String(symbolData.summary.conclusion)}</div>
          ) : null}

          <div style={chartCanvasShellStyle}>
            <div ref={chartContainerRef} style={chartCanvasStyle} />
            {klineData.length === 0 ? (
              <div style={chartOverlayMessageStyle}>
                {loading || booting
                  ? (locale === 'zh-CN' ? '正在等待 Signals 输出 K 线和买卖点。' : 'Waiting for Signals to provide candles and signals.')
                  : chartCacheNotice || (locale === 'zh-CN' ? '当前标的没有可用 OHLCV。' : 'No OHLCV is available for this target.')}
              </div>
            ) : null}
          </div>
        </div>

        {rightCollapsed ? (
          <div style={collapsedSideStyle}>
            <button
              type="button"
              aria-label={locale === 'zh-CN' ? '展开交易任务' : 'Expand tasks'}
              title={locale === 'zh-CN' ? '展开交易任务 (])' : 'Expand tasks (])'}
              style={verticalCollapseButtonStyle}
              onClick={() => setRightCollapsed(false)}
            >
              {locale === 'zh-CN' ? '交易任务' : 'Tasks'}
            </button>
          </div>
        ) : (
        <div style={terminalSideStyle}>
          <Panel
            title={locale === 'zh-CN' ? '交易任务' : 'Trader tasks'}
            meta={String(decisionRows.length + sellRows.length)}
            actions={(
              <button
                type="button"
                aria-label={locale === 'zh-CN' ? '收起交易任务' : 'Collapse tasks'}
                title={locale === 'zh-CN' ? '收起交易任务 (])' : 'Collapse tasks (])'}
                style={panelActionButtonStyle}
                onClick={() => setRightCollapsed(true)}
              >
                {locale === 'zh-CN' ? '收起' : 'Collapse'}
              </button>
            )}
          >
            {decisionRows.length === 0 && sellRows.length === 0 ? (
              <div style={emptyStateDarkStyle}>
                {locale === 'zh-CN' ? '暂无需要确认的观察/减仓/复盘任务。' : 'No watch, trim, or review tasks.'}
              </div>
            ) : (
              <div style={compactListStyle}>
                <div style={mutedTextStyle}>
                  {locale === 'zh-CN'
                    ? '非指令，需图形确认。'
                    : 'Tasks only; confirm on chart.'}
                </div>
                {decisionRows.slice(0, 4).map((row, index) => (
                  <button
                    key={`${compactText(row.decision_id, 'decision')}-${index}`}
                    type="button"
                    style={targetButtonStyle}
                    onClick={() =>
                      onOpenRecord(
                        locale === 'zh-CN'
                          ? `任务 ${String(row.symbol ?? row.decision_id ?? 'queue')}`
                          : `Task ${String(row.symbol ?? row.decision_id ?? 'queue')}`,
                        row,
                      )
                    }
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={rowTitleStyle}>{compactText(row.title) || compactText(row.symbol) || 'Task'}</div>
                      <span style={statusBadgeStyle(compactText(row.action_status) === '退出复盘' ? 'warning' : 'open')}>
                        {compactText(row.action_label) || compactText(row.action_status) || compactText(row.priority) || '观察'}
                      </span>
                    </div>
                    <div style={mutedTwoLineStyle}>
                      {[
                        compactText(row.summary),
                        compactText(row.recommended_action),
                        compactText(row.invalidates_when),
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                ))}
                {sellRows.slice(0, 4).map((row, index) => (
                  <button
                    key={`${labelForTarget(row) || 'sell'}-${index}`}
                    type="button"
                    style={targetButtonStyle}
                    onClick={() => {
                      const label = labelForTarget(row)
                      if (label) selectTarget({ label, kind: kindForTarget(row, 'stock'), freq: target.freq }, 'strategy.sell-warning.click')
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <div style={rowTitleStyle}>{compactText(row.name) || labelForTarget(row) || 'Sell warning'}</div>
                      <span style={statusBadgeStyle('warning')}>{locale === 'zh-CN' ? '减仓/止盈' : 'Exit'}</span>
                    </div>
                    <div style={mutedTwoLineStyle}>
                      {[compactText(row.reason), compactText(row.signal), compactText(row.summary)]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '信号与关键位' : 'Signals and levels'}
            meta={customSignalCount > 0 ? `${customSignalCount}自定义` : String(signals.length + chartKeyLevels.length + divergences.length)}
          >
            {signals.length === 0 && chartKeyLevels.length === 0 && divergences.length === 0 && targetCandidateRows.length === 0 && relatedCustomSignals.length === 0 ? (
              <div style={emptyStateDarkStyle}>
                {locale === 'zh-CN' ? '当前标的暂无自定义信号、背离或关键均线位。' : 'No custom signals, divergences, or key levels.'}
              </div>
            ) : (
                <div style={compactListStyle}>
                <div style={signalBlockStyle}>
                  <div style={candidateGroupHeaderStyle}>
                    <span>{locale === 'zh-CN' ? '当前图可见' : 'Visible on chart'}</span>
                    <span>{directCustomSignalCount === 0 ? (locale === 'zh-CN' ? '无直接自定义' : 'no direct custom') : `${currentVisibleSignals.length}/${customSignalCount}`}</span>
                  </div>
                {currentVisibleSignals.length > 0 ? currentVisibleSignals.map((signal, index) => (
                  <div key={`${signal.dt ?? signal.time ?? index}-${signal.type ?? signal.signal_type ?? 'custom'}`} style={signalRowStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={customSignalBadgeStyle}>自定义</span>
                        <span style={statusBadgeStyle(signalTone(signal.type ?? signal.signal_type))}>{signal.type || signal.signal_type || 'Signal'}</span>
                        <span style={monoTextStyle}>{displayFreqLabel(signal.freq)}</span>
                        <span style={monoTextStyle}>{formatNumber(signal.price)}</span>
                      </div>
                      <div style={mutedLineStyle}>
                        {[signal.date_str, signal.pool_status, signal.chart_aligned ? '锚定K线' : '', signal.confidence !== undefined ? `conf ${formatNumber(signal.confidence, 2)}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {signal.details ? (
                        <div style={mutedTwoLineStyle}>{signal.details}</div>
                      ) : null}
                    </div>
                  </div>
                )) : (
                  <div style={mutedTextStyle}>
                    {hiddenReasons.includes('index_has_no_direct_custom_signal') || hiddenReasons.includes('board_heat_chart_has_no_direct_custom_signal')
                      ? (locale === 'zh-CN' ? '指数/板块没有直接回测信号，右侧展示关联个股入口。' : 'Index/board charts have no direct custom signal; related stock signals are listed below.')
                      : evidenceCustomSignals.length > 0
                        ? (locale === 'zh-CN' ? '当前图窗口未显示自定义信号，可切换到下方可用周期。' : 'Custom signals exist outside this visible chart window or timeframe.')
                        : (locale === 'zh-CN' ? '当前周期没有可见自定义信号。' : 'No visible custom signal on this timeframe.')}
                  </div>
                )}
                </div>
                {otherCustomSignalFreqOptions.length > 0 ? (
                  <div style={signalBlockStyle}>
                    <div style={candidateGroupHeaderStyle}>
                      <span>{locale === 'zh-CN' ? '其它周期可用' : 'Other timeframes'}</span>
                      <span>{otherCustomSignalFreqOptions.map(item => item.label).join(' / ')}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {otherCustomSignalFreqOptions.map(item => (
                        <button
                          key={`${item.raw}-${item.value}`}
                          type="button"
                          style={panelActionButtonStyle}
                          onClick={() => selectTarget({ ...target, freq: item.value }, 'strategy.custom-signal.freq-click')}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {relatedCustomSignals.length > 0 ? (
                  <div style={signalBlockStyle}>
                    <div style={candidateGroupHeaderStyle}>
                      <span>{locale === 'zh-CN' ? '关联标的信号' : 'Related signals'}</span>
                      <span>{relatedCustomSignals.length}</span>
                    </div>
                    {relatedCustomSignals.slice(0, 5).map((signal, index) => (
                      <button
                        key={`${signal.symbol ?? 'related'}-${signal.date_str ?? index}-${signal.type ?? signal.signal_type ?? ''}`}
                        type="button"
                        style={targetButtonStyle}
                        onClick={() => {
                          if (signal.symbol) selectTarget({ label: signal.symbol, kind: 'stock', freq: normalizeSignalFreq(signal.freq) || target.freq }, 'strategy.related-custom-signal.click')
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <div style={rowTitleStyle}>{compactText(signal.name, compactText(signal.symbol, 'Signal'))}</div>
                          <span style={customSignalBadgeStyle}>自定义 {displayFreqLabel(signal.freq)}</span>
                        </div>
                        <div style={mutedTwoLineStyle}>
                          {[signal.type || signal.signal_type, signal.relation, signal.date_str, signal.details].filter(Boolean).join(' · ')}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {otherEvidenceSignals.length > 0 ? (
                  <div style={signalBlockStyle}>
                    <div style={candidateGroupHeaderStyle}>
                      <span>{locale === 'zh-CN' ? '系统信号' : 'System signals'}</span>
                      <span>{otherEvidenceSignals.length}</span>
                    </div>
                    {otherEvidenceSignals.map((signal, index) => (
                      <div key={`${signal.dt ?? signal.time ?? index}-${signal.type ?? 'signal'}`} style={signalRowStyle}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {signalSourceLabel(signal) ? (
                              <span style={miniNeutralSignalBadgeStyle}>{signalSourceLabel(signal)}</span>
                            ) : null}
                            <span style={statusBadgeStyle(signalTone(signal.type))}>{signal.type || 'Signal'}</span>
                            <span style={monoTextStyle}>{formatNumber(signal.price)}</span>
                          </div>
                          <div style={mutedLineStyle}>
                            {[displayFreqLabel(signal.freq), signal.date_str, signal.pool_status, signal.confidence !== undefined ? `conf ${formatNumber(signal.confidence, 2)}` : '']
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                          {signal.details ? (
                            <div style={mutedTwoLineStyle}>{signal.details}</div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {divergences.slice(-3).reverse().map(divergence => (
                  <div key={divergence.id} style={dataRowStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={rowTitleStyle}>{divergence.type === 'bearish' ? '顶背离' : '底背离'}</div>
                      <div style={mutedLineStyle}>{divergence.metric.toUpperCase()} · {formatConfidence(divergence.confidence)}</div>
                    </div>
                    <div style={monoTextStyle}>{formatNumber(divergence.price)}</div>
                  </div>
                ))}
                {chartKeyLevels.slice(0, 6).map(level => (
                  <div key={`${level.name ?? 'level'}-${level.value ?? ''}`} style={dataRowStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={rowTitleStyle}>{level.name || 'Level'}</div>
                      <div style={mutedLineStyle}>
                        {[level.position, level.direction, level.role, level.distance_pct !== undefined ? formatPercent(level.distance_pct) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div style={monoTextStyle}>{formatNumber(level.value)}</div>
                  </div>
                ))}
                {targetCandidateRows.length > 0 ? (
                  <TargetRows
                    locale={locale}
                    groups={targetCandidateGroups}
                    rows={targetCandidateRows}
                    emptyText=""
                    onSelect={row => {
                      const label = labelForTarget(row)
                      if (label) selectTarget({ label, kind: kindForTarget(row, 'stock'), freq: target.freq }, 'strategy.representative.click')
                    }}
                  />
                ) : null}
              </div>
            )}
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '数据状态' : 'Data status'}
            meta={dataIssueRows.length > 0 ? String(dataIssueRows.length) : (locale === 'zh-CN' ? '正常' : 'OK')}
          >
            <div style={compactListStyle}>
              <div style={dataRowStyle}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  <div style={rowTitleStyle}>{locale === 'zh-CN' ? '图表刷新时钟' : 'Chart refresh clock'}</div>
                  <div style={mutedLineStyle}>
                    {[
                      chartTimezone,
                      compactText(shell?.session?.data_as_of) ? `as of ${compactText(shell?.session?.data_as_of)}` : '',
                      compactText(shell?.session?.next_refresh_at) ? `next ${compactText(shell?.session?.next_refresh_at)}` : '',
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
              {dataIssueRows.length === 0 ? (
                <div style={emptyStateDarkStyle}>
                  {locale === 'zh-CN' ? '数据正常。' : 'Data OK.'}
                </div>
              ) : (
                dataIssueRows.slice(0, 5).map((row, index) => (
                  <div key={`${compactText(row.lane) || compactText(row.source_id, 'source')}-${index}`} style={dataRowStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={rowTitleStyle}>{compactText(row.lane) || sourceConfidenceLabel(row)}</div>
                      <div style={mutedTwoLineStyle}>
                        {[compactText(row.status), compactText(row.freshness), compactText(row.reason), compactText(row.summary)]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div style={monoTextStyle}>{compactText(row.market) || compactText(row.active_markets) || compactText(row.source)}</div>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>
        )}
      </div>
    </div>
  )
}

function Panel({
  title,
  meta,
  actions,
  children,
}: {
  title: string
  meta?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={terminalPanelStyle}>
      <div style={panelHeaderStyle}>
        <div style={panelTitleStyle}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {meta ? <div style={mutedTextStyle}>{meta}</div> : null}
          {actions}
        </div>
      </div>
      {children}
    </div>
  )
}

function CacheMonitorCell({
  title,
  value,
  progress,
  status,
  detail,
  subdetail,
  statusLabel,
}: {
  title: string
  value: string
  progress: number
  status?: unknown
  detail: string
  subdetail: string
  statusLabel: string
}) {
  const color = cacheProgressColor(progress, status)
  const clampedProgress = Math.max(0, Math.min(100, progress))
  return (
    <div style={cacheMonitorCellStyle}>
      <div style={cacheMonitorHeaderStyle}>
        <div style={cacheMonitorToplineStyle}>
          <span style={cacheStatusDotStyle(color)} />
          <div style={cacheMonitorTitleStyle}>{title}</div>
        </div>
        <span style={cacheStatusChipStyle(color)} title={statusLabel}>{statusLabel}</span>
      </div>
      <div style={{ ...cacheMonitorValueStyle, color }}>{value}</div>
      <div style={cacheProgressTrackStyle}>
        <div style={cacheProgressFillStyle(clampedProgress, color)} />
      </div>
      <div style={cacheMonitorDetailStrongStyle} title={detail}>{detail}</div>
      <div style={cacheMonitorMetaStyle} title={subdetail}>{subdetail}</div>
    </div>
  )
}

function CacheMonitorStrip({
  locale,
  cacheStatus,
  mode,
}: {
  locale: LongclawLocale
  cacheStatus: StrategyDashboard['cache_status']
  mode: TerminalLayoutMode
}) {
  cacheStatus = normalizeCacheStatus(cacheStatus)
  const liveSummary = recordValue(cacheStatus.live_low_latency.summary)
  const postSummary = recordValue(cacheStatus.postmarket_backfill.summary)
  const postRun = recordValue(cacheStatus.postmarket_backfill.run)
  const tasks = cacheStatus.postmarket_backfill.tasks.map(item => recordValue(item))
  const freqs = cacheStatus.mongo_stock_cache.freqs.map(item => recordValue(item))
  const mongoSummary = recordValue(cacheStatus.mongo_stock_cache.summary)
  const blockers = cacheStatus.blockers.map(item => recordValue(item))
  const providerHealth = (Array.isArray(cacheStatus.provider_health) ? cacheStatus.provider_health : []).map(item => recordValue(item))

  const liveOk = numberValue(liveSummary.ok_modules) ?? 0
  const liveTotal = numberValue(liveSummary.total_modules) ?? 0
  const livePct = liveTotal ? (liveOk / liveTotal) * 100 : 0
  const liveStatus = liveCacheStrictStatus(cacheStatus)
  const liveNotReady = numberValue(liveSummary.minute_not_ready) ?? 0
  const liveProblemModules = cacheProblemModules(liveSummary)
  const liveSamples = Array.isArray(liveSummary.minute_not_ready_samples)
    ? liveSummary.minute_not_ready_samples.map(item => recordValue(item)).slice(0, 2)
    : []
  const liveSampleText = liveSamples
    .map(item => `${compactText(item.symbol)} ${compactText(item.freq)}`)
    .filter(Boolean)
    .join(' · ')
  const liveValue = liveTotal ? `${Math.round(livePct)}%` : (cacheStatus.available ? '0%' : 'OFF')
  const liveDetail = locale === 'zh-CN'
    ? `${countText(liveSummary.selected_symbols)} 只低延时股票 · ${countText(liveNotReady)} 未就绪`
    : `${countText(liveSummary.selected_symbols)} live symbols · ${countText(liveNotReady)} not ready`
  const liveSubdetail = locale === 'zh-CN'
    ? [
        `${countText(liveOk)}/${countText(liveTotal)} 模块严格 OK`,
        liveProblemModules ? `阻塞 ${liveProblemModules}` : '',
        liveSampleText ? `缺 ${liveSampleText}` : `${countText(liveSummary.skipped_symbols)} 只轮换跳过`,
      ].filter(Boolean).join(' · ')
    : [
        `${countText(liveOk)}/${countText(liveTotal)} modules strictly OK`,
        liveProblemModules ? `blocked ${liveProblemModules}` : '',
        liveSampleText ? `missing ${liveSampleText}` : `${countText(liveSummary.skipped_symbols)} rotated out`,
      ].filter(Boolean).join(' · ')

  const stockDailyTask = firstRecord(tasks, 'module', 'stock_daily')
  const stockDailySummary = recordValue(stockDailyTask.result_summary)
  const boardTask = firstRecord(tasks, 'module', 'board_cons')
  const boardSummary = recordValue(boardTask.result_summary)
  const boardCursor = recordValue(boardTask.cursor)
  const stockShardTasks = tasks.filter(item => compactText(item.module) === 'stock_daily')
  const boardShardTasks = tasks.filter(item => compactText(item.module) === 'board_cons')
  const stockShardTotal = stockShardTasks.reduce((sum, item) => sum + (numberValue(recordValue(item.result_summary).total) ?? 0), 0)
  const stockShardDone = stockShardTasks.filter(item => compactText(item.status) === 'ok').length
  const stockShardProcessed = stockShardTasks.reduce((sum, item) => sum + (numberValue(recordValue(item.result_summary).processed) ?? 0), 0)
  const boardShardTotal = boardShardTasks.reduce((sum, item) => sum + (numberValue(recordValue(item.result_summary).total_groups) ?? 0), 0)
  const boardShardDone = boardShardTasks.filter(item => compactText(item.status) === 'ok').length
  const boardShardProcessed = boardShardTasks.reduce((sum, item) => sum + (numberValue(recordValue(item.result_summary).processed) ?? 0), 0)
  const postPct = percentValue(postSummary.progress_pct)
  const postStatus = compactText(postRun.status, compactText(postSummary.status, 'pending'))
  const postEta = compactDuration(postSummary.eta_seconds, locale)
  const stockDailyLine = stockShardTasks.length
    ? `${countText(stockShardDone)}/${countText(stockShardTasks.length)} shard · ${countText(stockShardProcessed)}/${countText(stockShardTotal)}`
    : `${countText(stockDailySummary.processed)}/${countText(stockDailySummary.total ?? stockDailySummary.expected_codes)} ${compactText(stockDailySummary.latest_symbol)}`
  const boardCursorLine = boardShardTasks.length
    ? `${countText(boardShardDone)}/${countText(boardShardTasks.length)} shard · ${countText(boardShardProcessed)}/${countText(boardShardTotal)}`
    : `${countText(boardSummary.next_cursor ?? boardCursor.next_cursor)}/${countText(boardSummary.total_groups ?? boardCursor.total_groups)}`
  const postDetail = locale === 'zh-CN'
    ? `阶段 ${compactText(postRun.phase, '等待')} · ${postEta || 'ETA 计算中'}`
    : `phase ${compactText(postRun.phase, 'pending')} · ${postEta || 'ETA pending'}`
  const postSubdetail = locale === 'zh-CN'
    ? `日线 ${stockDailyLine} · 板块 ${boardCursorLine}`
    : `daily ${stockDailyLine} · boards ${boardCursorLine}`

  const dailyCache = firstRecord(freqs, 'freq', '日线')
  const dailySymbols = numberValue(dailyCache.symbols) ?? 0
  const dailyToday = numberValue(dailyCache.today_symbols) ?? 0
  const mongoPct = dailySymbols ? (dailyToday / dailySymbols) * 100 : 0
  const minuteFreqs = freqs
    .filter(row => ['5分钟', '15分钟', '30分钟', '60分钟'].includes(compactText(row.freq)))
    .map(row => `${compactText(row.freq)} ${countText(row.today_symbols)}`)
    .join(' · ')
  const minuteUniverseTotal = numberValue(mongoSummary.minute_universe_total) ?? 0
  const minuteUniverseCached = numberValue(mongoSummary.minute_universe_cached) ?? 0
  const minuteUniversePending = numberValue(mongoSummary.minute_universe_pending) ?? 0
  const minuteUniverseError = numberValue(mongoSummary.minute_universe_error) ?? 0
  const mongoDetail = locale === 'zh-CN'
    ? `今日日线 ${countText(dailyToday)}/${countText(dailySymbols)}`
    : `today daily ${countText(dailyToday)}/${countText(dailySymbols)}`
  const mongoSubdetail = locale === 'zh-CN'
    ? (minuteUniverseTotal
      ? `分钟候选 ${countText(minuteUniverseCached)}/${countText(minuteUniverseTotal)} · 待 ${countText(minuteUniversePending)} · 失败 ${countText(minuteUniverseError)}`
      : `分钟覆盖：${minuteFreqs || '0'}`)
    : (minuteUniverseTotal
      ? `minute universe ${countText(minuteUniverseCached)}/${countText(minuteUniverseTotal)} · pending ${countText(minuteUniversePending)} · failed ${countText(minuteUniverseError)}`
      : `minute coverage: ${minuteFreqs || '0'}`)
  const mongoStatus = !cacheStatus.available
    ? 'degraded'
    : minuteUniverseError > 0
      ? 'degraded'
      : minuteUniversePending > 0 || (dailySymbols > 0 && dailyToday < dailySymbols)
        ? 'partial'
        : 'ok'

  const providerProblems = providerHealth.filter(isActiveProviderProblem)
  const firstProviderProblem = providerProblems[0] ?? {}
  const sourceProblemCount = providerProblems.length
  const taskBlockerCount = blockers.length
  const blockerPct = cacheStatus.available && sourceProblemCount === 0 && liveStatus === 'ok' ? 100 : 0
  const blockerDetail = sourceProblemCount
    ? `${compactText(firstProviderProblem.provider, 'provider')} · ${compactText(firstProviderProblem.endpoint, compactText(firstProviderProblem.status, 'blocked'))}`
    : (locale === 'zh-CN' ? '无阻塞源' : 'no blocking source')
  const blockerSubdetail = sourceProblemCount
    ? compactText(firstProviderProblem.last_error_type, compactText(firstProviderProblem.cooldown_hit_type, locale === 'zh-CN' ? '查看 provider_health 定位数据源' : 'check provider_health for source detail'))
    : (locale === 'zh-CN'
      ? `${countText(providerHealth.length)} 个 provider 记录 · ${countText(taskBlockerCount)} 个任务阻塞在补数区展示`
      : `${countText(providerHealth.length)} provider records · ${countText(taskBlockerCount)} task blockers shown in data tasks`)
  const refreshSeconds = cacheRefreshSeconds(cacheStatus)
  const updatedAt = compactClock(cacheStatus.updated_at, locale)
  const monitorStatus = cacheStatus.available && liveStatus === 'ok' && sourceProblemCount === 0 ? 'ok' : liveStatus

  return (
    <div style={cacheMonitorStripStyle}>
      <div style={cacheMonitorToolbarStyle}>
        <div style={cacheMonitorToolbarTitleStyle}>
          <span style={cacheStatusDotStyle(monitorStatus === 'ok' ? palette.success : monitorStatus === 'partial' ? tradingDeskTheme.colors.auroraGold : palette.error)} />
          {locale === 'zh-CN' ? 'Signals 缓存监控' : 'Signals cache monitor'}
        </div>
        <div style={cacheMonitorToolbarMetaStyle}>
          {locale === 'zh-CN'
            ? `交易日 ${cacheStatus.trade_date || '-'} · 北京时间 ${updatedAt || '-'} · 自动刷新 ${refreshSeconds}秒`
            : `trade ${cacheStatus.trade_date || '-'} · updated ${updatedAt || '-'} · refresh ${refreshSeconds}s`}
        </div>
      </div>
      <div style={cacheMonitorGridStyle(mode)}>
        <CacheMonitorCell
          title={locale === 'zh-CN' ? '低延时缓存' : 'Live cache'}
          value={liveValue}
          progress={livePct}
          status={liveStatus}
          statusLabel={cacheStatus.available ? `${countText(liveOk)}/${countText(liveTotal)}` : 'OFF'}
          detail={liveDetail}
          subdetail={liveSubdetail}
        />
        <CacheMonitorCell
          title={locale === 'zh-CN' ? '盘后全量' : 'Postmarket'}
          value={`${Math.round(postPct)}%`}
          progress={postPct}
          status={postStatus}
          statusLabel={cacheStatusLabel(postStatus, 'pending')}
          detail={postDetail}
          subdetail={postSubdetail}
        />
        <CacheMonitorCell
          title={locale === 'zh-CN' ? 'Mongo 覆盖' : 'Mongo coverage'}
          value={`${Math.round(mongoPct)}%`}
          progress={mongoPct}
          status={mongoStatus}
          statusLabel={`${countText(dailyToday)}/${countText(dailySymbols)}`}
          detail={mongoDetail}
          subdetail={mongoSubdetail}
        />
        <CacheMonitorCell
          title={locale === 'zh-CN' ? '网络源' : 'Sources'}
          value={String(sourceProblemCount)}
          progress={blockerPct}
          status={sourceProblemCount ? 'error' : 'ok'}
          statusLabel={sourceProblemCount ? 'BLOCKED' : 'OK'}
          detail={blockerDetail}
          subdetail={blockerSubdetail}
        />
      </div>
    </div>
  )
}

function WatchlistTabbedTable({
  locale,
  activeTab,
  onTabChange,
  groups,
  rows,
  target,
  rangeColumns,
  allRangeColumns,
  selectedRangeKey,
  onRangeChange,
  emptyText,
  onSelect,
}: {
  locale: LongclawLocale
  activeTab: WatchlistTabKey
  onTabChange: (tab: WatchlistTabKey) => void
  groups: {
    macro_indices: WatchlistRow[]
    sector_boards: WatchlistRow[]
    buy_candidates: WatchlistRow[]
    focus_stocks: WatchlistRow[]
    risk_stocks: WatchlistRow[]
    watch_stocks: WatchlistRow[]
    legacy: WatchlistRow[]
  }
  rows: WatchlistRow[]
  target: ChartTarget
  rangeColumns: WatchlistRangeColumn[]
  allRangeColumns: WatchlistRangeColumn[]
  selectedRangeKey: string
  onRangeChange: (key: string) => void
  emptyText: string
  onSelect: (row: WatchlistRow) => void
}) {
  const tabs: Array<{ key: WatchlistTabKey; label: string; count: number }> = [
    {
      key: 'macro_indices',
      label: locale === 'zh-CN' ? '宏观指数' : 'Macro',
      count: groups.macro_indices.length,
    },
    {
      key: 'sector_boards',
      label: locale === 'zh-CN' ? '异动板块' : 'Hot boards',
      count: groups.sector_boards.length,
    },
    {
      key: 'focus_stocks',
      label: locale === 'zh-CN' ? '真实买点' : 'Entries',
      count: groups.focus_stocks.length,
    },
    {
      key: 'risk_stocks',
      label: locale === 'zh-CN' ? '风险/止盈止损' : 'Risk',
      count: groups.risk_stocks.length,
    },
    {
      key: 'watch_stocks',
      label: locale === 'zh-CN' ? '观察/预热' : 'Watch',
      count: groups.watch_stocks.length,
    },
    {
      key: 'buy_candidates',
      label: locale === 'zh-CN' ? '策略候选' : 'Strategy',
      count: groups.buy_candidates.length,
    },
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <div style={watchlistControlRowStyle}>
        <div style={watchlistTabsStyle}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              style={tab.key === activeTab ? watchlistTabButtonActiveStyle : watchlistTabButtonStyle}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label} {tab.count}
            </button>
          ))}
        </div>
        <label style={watchlistRangeSelectLabelStyle}>
          <span>{locale === 'zh-CN' ? '区间' : 'Range'}</span>
          <select
            value={selectedRangeKey}
            style={watchlistRangeSelectStyle}
            onChange={event => onRangeChange(event.currentTarget.value)}
          >
            {allRangeColumns.map(column => (
              <option key={column.key} value={column.key}>{column.label}</option>
            ))}
          </select>
        </label>
      </div>
      {activeTab === 'sector_boards' ? (
        <ChainHeatVisualization
          locale={locale}
          rows={rows}
          target={target}
          onSelect={onSelect}
        />
      ) : null}
      <WatchlistTable
        locale={locale}
        activeTab={activeTab}
        rows={rows}
        target={target}
        rangeColumns={rangeColumns}
        emptyText={emptyText}
        onSelect={onSelect}
      />
    </div>
  )
}

function watchlistGridTemplate(activeTab: WatchlistTabKey, rangeColumnCount: number): string {
  const rangeColumns = rangeColumnCount > 0 ? ` repeat(${rangeColumnCount}, 56px)` : ''
  if (activeTab === 'sector_boards') {
    return `minmax(138px, 1.35fr) 58px 78px 92px${rangeColumns}`
  }
  if (activeTab === 'focus_stocks' || activeTab === 'buy_candidates' || activeTab === 'risk_stocks' || activeTab === 'watch_stocks') {
    return `minmax(138px, 1.35fr) 58px 52px 88px${rangeColumns}`
  }
  return `minmax(138px, 1.35fr) 58px 52px 76px${rangeColumns}`
}

function watchlistHeaders(activeTab: WatchlistTabKey, locale: LongclawLocale): [string, string, string, string] {
  if (activeTab === 'sector_boards') {
    return [
      locale === 'zh-CN' ? '板块' : 'Board',
      locale === 'zh-CN' ? '日涨幅' : 'Day',
      locale === 'zh-CN' ? '当日领涨' : 'Top mover',
      locale === 'zh-CN' ? '链主/弹性' : 'Core/elastic',
    ]
  }
  if (activeTab === 'focus_stocks') {
    return [
      locale === 'zh-CN' ? '买点' : 'Entry',
      locale === 'zh-CN' ? '最新' : 'Last',
      locale === 'zh-CN' ? '日' : 'Day',
      locale === 'zh-CN' ? '入池依据' : 'Reason',
    ]
  }
  if (activeTab === 'risk_stocks') {
    return [
      locale === 'zh-CN' ? '风险' : 'Risk',
      locale === 'zh-CN' ? '最新' : 'Last',
      locale === 'zh-CN' ? '日' : 'Day',
      locale === 'zh-CN' ? '处理' : 'Action',
    ]
  }
  if (activeTab === 'watch_stocks') {
    return [
      locale === 'zh-CN' ? '观察' : 'Watch',
      locale === 'zh-CN' ? '最新' : 'Last',
      locale === 'zh-CN' ? '日' : 'Day',
      locale === 'zh-CN' ? '状态' : 'State',
    ]
  }
  if (activeTab === 'buy_candidates') {
    return [
      locale === 'zh-CN' ? '策略' : 'Strategy',
      locale === 'zh-CN' ? '最新' : 'Last',
      locale === 'zh-CN' ? '日' : 'Day',
      locale === 'zh-CN' ? '候选' : 'Candidate',
    ]
  }
  return [
    locale === 'zh-CN' ? '指数' : 'Index',
    locale === 'zh-CN' ? '最新' : 'Last',
    locale === 'zh-CN' ? '日' : 'Day',
    locale === 'zh-CN' ? '信号' : 'Signal',
  ]
}

function sectorLeaderForWatchlist(row: WatchlistRow): string {
  const raw = row.raw
  const reps = recordValue(raw.representatives)
  const sourceLeader = recordValue(Array.isArray(reps.source_leader) ? reps.source_leader[0] : undefined)
  return (
    compactText(raw.leader) ||
    compactText(raw.leader_name) ||
    compactText(sourceLeader.name) ||
    compactText(recordValue(raw.source_leader).name) ||
    'N/A'
  )
}

function sectorCarrierForWatchlist(row: WatchlistRow, locale: LongclawLocale): string {
  const raw = row.raw
  const reps = recordValue(raw.representatives)
  const core = recordValue(Array.isArray(reps.core) ? reps.core[0] : undefined)
  const elastic = recordValue(Array.isArray(reps.elastic) ? reps.elastic[0] : undefined)
  const coreLabel = locale === 'zh-CN' ? '链主' : 'Core'
  const elasticLabel = locale === 'zh-CN' ? '弹性' : 'Elastic'
  const carrier = recordValue(raw.carrier)
  const target = recordValue(raw.target)
  const coreName =
    compactText(core.name) ||
    compactText(carrier.name) ||
    compactText(target.name) ||
    compactText(raw.carrier_range_return_symbol) ||
    compactText(raw.target_symbol)
  const elasticName = compactText(elastic.name)
  if (coreName && elasticName && elasticName !== coreName) return `${coreLabel} ${coreName} / ${elasticLabel} ${elasticName}`
  if (coreName) return `${coreLabel} ${coreName}`
  if (elasticName) return `${elasticLabel} ${elasticName}`
  return compactText(row.signal) || (locale === 'zh-CN' ? '待映射' : 'Unmapped')
}

function chainPhaseLabel(phase: string, locale: LongclawLocale): string {
  const labels: Record<string, [string, string]> = {
    accelerating: ['加速', 'Accel'],
    warming: ['升温', 'Warm'],
    diverging: ['背离', 'Diverge'],
    cooling: ['降温', 'Cool'],
    risk_off: ['风险', 'Risk'],
  }
  const label = labels[phase]
  if (!label) return phase || (locale === 'zh-CN' ? '观察' : 'Watch')
  return locale === 'zh-CN' ? label[0] : label[1]
}

function chainPhaseTone(phase: string): React.CSSProperties {
  if (phase === 'accelerating') return { color: tradingDeskTheme.market.up, borderColor: tradingDeskTheme.market.up }
  if (phase === 'warming') return { color: terminalTheme.accentText, borderColor: terminalTheme.accent }
  if (phase === 'diverging') return { color: '#e0a83a', borderColor: '#8a6726' }
  if (phase === 'cooling') return { color: '#7aa7ff', borderColor: '#35548c' }
  if (phase === 'risk_off') return { color: tradingDeskTheme.market.down, borderColor: tradingDeskTheme.market.down }
  return {}
}

function chainSignalLabel(value: unknown, locale: LongclawLocale): string {
  const signal = compactText(value)
  const labels: Record<string, [string, string]> = {
    chain_acceleration: ['链加速', 'Chain accel'],
    chain_warming: ['链升温', 'Chain warm'],
    chain_divergence: ['热度背离', 'Divergence'],
    chain_cooling: ['链降温', 'Cooling'],
    chain_risk_off: ['链风险', 'Risk off'],
  }
  const label = labels[signal]
  if (!label) return signal || (locale === 'zh-CN' ? '观察' : 'Watch')
  return locale === 'zh-CN' ? label[0] : label[1]
}

function chainDomainLabels(row: WatchlistRow): string[] {
  const domains = Array.isArray(row.raw.integrated_domains) ? row.raw.integrated_domains : []
  return domains
    .map(item => compactText(recordValue(item).name))
    .filter(Boolean)
    .slice(0, 3)
}

function chainNodeLabel(row: WatchlistRow): string {
  return compactText(row.raw.node_name) || compactText(row.raw.stage) || compactText(row.raw.layer) || row.name
}

function chainStageLabel(row: WatchlistRow): string {
  return compactText(row.raw.stage) || compactText(row.raw.layer) || compactText(row.raw.chain_name) || row.typeLabel
}

function chainVizBarColor(phase: string): string {
  if (phase === 'risk_off') return tradingDeskTheme.market.down
  if (phase === 'cooling') return '#3f7ee8'
  if (phase === 'diverging') return '#d0902f'
  if (phase === 'accelerating') return tradingDeskTheme.market.up
  return terminalTheme.accent
}

function ChainHeatVisualization({
  locale,
  rows,
  target,
  onSelect,
}: {
  locale: LongclawLocale
  rows: WatchlistRow[]
  target: ChartTarget
  onSelect: (row: WatchlistRow) => void
}) {
  const chainRows = rows
    .filter(row => compactText(row.raw.source) === 'chain_heat_snapshots' || compactText(row.raw.domain) === 'chain_heat')
    .slice(0, 6)
  if (chainRows.length === 0) return null
  const maxHeat = Math.max(...chainRows.map(row => numberValue(row.raw.heat_score) ?? 0), 1)
  return (
    <div style={chainVizShellStyle}>
      <div style={chainVizGridStyle}>
        {chainRows.map(row => {
          const phase = compactText(row.raw.phase)
          const heat = numberValue(row.raw.heat_score) ?? 0
          const width = `${Math.max(8, Math.min(100, (heat / maxHeat) * 100))}%`
          const active = watchlistRowIsActive(row, target)
          const domains = chainDomainLabels(row)
          return (
            <button
              key={`chain-viz-${row.id}`}
              type="button"
              style={active ? chainVizNodeActiveStyle : chainVizNodeStyle}
              onClick={() => onSelect(row)}
              title={[
                row.name,
                chainSignalLabel(row.raw.trading_signal, locale),
                domains.join('/'),
              ].filter(Boolean).join(' · ')}
            >
              <div style={chainVizTopLineStyle}>
                <div style={chainVizTitleStyle}>{row.name}</div>
                <div style={{ ...chainVizMetricStyle, ...percentTone(row.dayChange) }}>{row.dayChange}</div>
              </div>
              <div style={chainVizBarTrackStyle}>
                <div style={{ ...chainVizBarStyle, width, background: chainVizBarColor(phase) }} />
              </div>
              <div style={chainVizMapStyle}>
                <span style={chainVizChipStyle}>{chainStageLabel(row)}</span>
                <span style={chainVizConnectorStyle} />
                <span style={chainVizNodePillStyle}>{chainNodeLabel(row)}</span>
                <span style={chainVizConnectorStyle} />
                <span style={chainVizDomainRailStyle}>
                  {domains.map(domain => (
                    <span key={`${row.id}-domain-${domain}`} style={chainVizChipStyle}>{domain}</span>
                  ))}
                </span>
              </div>
              <div style={chainVizMetaStyle}>
                <span style={{ ...chainVizChipStyle, ...chainPhaseTone(phase) }}>{chainPhaseLabel(phase, locale)}</span>
                <span style={chainVizChipStyle}>{chainSignalLabel(row.raw.trading_signal, locale)}</span>
                <span style={chainVizChipStyle}>5m {formatNumber(row.raw.momentum_5m)}</span>
                <span style={chainVizChipStyle}>15m {formatNumber(row.raw.momentum_15m)}</span>
                <span style={chainVizChipStyle}>30m {formatNumber(row.raw.momentum_30m)}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function WatchlistTable({
  locale,
  activeTab,
  rows,
  target,
  rangeColumns,
  emptyText,
  onSelect,
}: {
  locale: LongclawLocale
  activeTab: WatchlistTabKey
  rows: WatchlistRow[]
  target: ChartTarget
  rangeColumns: WatchlistRangeColumn[]
  emptyText: string
  onSelect: (row: WatchlistRow) => void
}) {
  if (rows.length === 0) {
    return <div style={emptyStateDarkStyle}>{emptyText}</div>
  }
  const headers = watchlistHeaders(activeTab, locale)
  const gridTemplateColumns = watchlistGridTemplate(activeTab, rangeColumns.length)
  const headerRowStyle = { ...watchlistGridRowStyle, gridTemplateColumns }
  const buttonRowStyle = { ...watchlistButtonRowStyle, gridTemplateColumns }
  const activeButtonRowStyle = { ...watchlistButtonActiveRowStyle, gridTemplateColumns }
  return (
    <div style={watchlistTableStyle}>
      <div style={headerRowStyle}>
        <div style={watchlistNameHeaderCellStyle}>{headers[0]}</div>
        <div style={watchlistHeaderCellStyle}>{headers[1]}</div>
        <div style={watchlistHeaderCellStyle}>{headers[2]}</div>
        <div style={watchlistHeaderCellStyle}>{headers[3]}</div>
        {rangeColumns.map(column => (
          <div key={column.key} style={watchlistHeaderCellStyle}>{column.label}</div>
        ))}
      </div>
      {rows.map(row => {
        const active = watchlistRowIsActive(row, target)
        const firstMetric = activeTab === 'sector_boards' ? row.dayChange : row.latest
        const secondMetric = activeTab === 'sector_boards' ? sectorLeaderForWatchlist(row) : row.dayChange
        return (
          <button
            key={row.id}
            type="button"
            style={active ? activeButtonRowStyle : buttonRowStyle}
            title={[
              row.name,
              activeTab === 'sector_boards' ? `${locale === 'zh-CN' ? '当日领涨' : 'Top mover'}: ${sectorLeaderForWatchlist(row)}` : '',
              activeTab === 'sector_boards' ? `${locale === 'zh-CN' ? '链主/弹性' : 'Core/elastic'}: ${sectorCarrierForWatchlist(row, locale)}` : '',
              row.traceSummary ? `${locale === 'zh-CN' ? '溯源' : 'Trace'}: ${row.traceSummary}` : '',
              rangeColumns[0] ? `${rangeColumns[0].label}: ${row.rangeValues[0] ?? 'N/A'}` : '',
            ].filter(Boolean).join(' · ')}
            onClick={() => onSelect(row)}
          >
            <div style={watchlistNameCellStyle}>
              <div style={watchlistNameStyle}>{row.name}</div>
              <div style={watchlistSubStyle}>
                {[row.typeLabel, row.code, ...row.tags].filter(Boolean).join(' · ')}
              </div>
              {row.explanation || row.traderAction ? (
                <div style={watchlistSubStyle}>
                  {[row.traderAction, row.explanation].filter(Boolean).join(' · ')}
                </div>
              ) : null}
            </div>
            <div style={{ ...watchlistCellStyle, ...(activeTab === 'sector_boards' ? percentTone(firstMetric) : {}) }}>{firstMetric}</div>
            <div style={{ ...watchlistCellStyle, ...(activeTab === 'sector_boards' ? {} : percentTone(secondMetric)) }}>{secondMetric}</div>
            <div style={watchlistCellStyle}>
              {activeTab === 'sector_boards' ? (
                sectorCarrierForWatchlist(row, locale)
              ) : row.signalBadges.length > 0 ? (
                <span style={signalBadgeRowStyle}>
                  {row.signalBadges.slice(0, 4).map(badge => (
                    <span
                      key={`${row.id}-${badge.side}-${badge.label}`}
                      style={badge.side === 'sell' ? miniSellSignalBadgeStyle : badge.side === 'buy' ? miniSignalBadgeStyle : miniNeutralSignalBadgeStyle}
                    >
                      {badge.label}
                    </span>
                  ))}
                </span>
              ) : (
                row.signal || 'N/A'
              )}
            </div>
            {row.rangeValues.map((value, index) => (
              <div key={`${row.id}-range-${index}`} style={{ ...watchlistCellStyle, ...percentTone(value) }}>
                {value}
              </div>
            ))}
          </button>
        )
      })}
    </div>
  )
}

function TargetRows({
  locale,
  groups,
  rows,
  emptyText,
  onSelect,
}: {
  locale: LongclawLocale
  groups?: Record<string, Record<string, unknown>[]>
  rows: Record<string, unknown>[]
  emptyText: string
  onSelect: (row: Record<string, unknown>) => void
}) {
  if (rows.length === 0) {
    return <div style={emptyStateDarkStyle}>{emptyText}</div>
  }
  const sections = candidateGroupOrder
    .map(key => ({
      key,
      label: candidateGroupLabel(key, locale),
      rows: groups?.[key] ?? [],
    }))
    .filter(section => section.rows.length > 0)
  const fallbackSections = sections.length > 0
    ? sections
    : [{ key: 'all', label: locale === 'zh-CN' ? '关注标的' : 'Watch', rows }]
  return (
    <div style={compactListStyle}>
      {fallbackSections.map(section => (
        <div key={section.key} style={compactListStyle}>
          <div style={candidateGroupHeaderStyle}>
            <span>{section.label}</span>
            <span style={monoTextStyle}>{section.rows.length}</span>
          </div>
          {section.rows.slice(0, 8).map((row, index) => {
            const label = labelForTarget(row)
            const score = compactText(row.attention_score) || compactText(row.fused_total) || compactText(row.total_score) || compactText(row.score)
            return (
              <button
                key={`${section.key}-${label || 'target'}-${index}`}
                type="button"
                style={targetButtonStyle}
                onClick={() => onSelect(row)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={rowTitleStyle}>
                    {compactText(row.name) || label || 'N/A'}
                  </div>
                  <span style={miniNeutralSignalBadgeStyle}>
                    {compactText(row.leader_tier) || compactText(row.representative_type) || '候选'}
                  </span>
                </div>
                <div style={mutedTwoLineStyle}>
                  {[
                    compactText(row.symbol) || compactText(row.code),
                    compactText(row.chain_role) || compactText(row.relation),
                    score ? `关注 ${score}` : '',
                    compactText(row.why_watch),
                    Array.isArray(row.risk_flags) ? row.risk_flags.map(item => compactText(item)).filter(Boolean).join('/') : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function FallbackList({
  locale,
  title,
  rows,
  onOpen,
}: {
  locale: LongclawLocale
  title: string
  rows: Record<string, unknown>[]
  onOpen: (row: Record<string, unknown>) => void
}) {
  return (
    <Panel title={title} meta={String(rows.length)}>
      {rows.length === 0 ? (
        <div style={emptyStateDarkStyle}>
          {locale === 'zh-CN' ? '暂无数据。' : 'No data.'}
        </div>
      ) : (
        <div style={compactListStyle}>
          {rows.slice(0, 8).map((row, index) => (
            <button
              key={`${title}-${index}`}
              type="button"
              style={targetButtonStyle}
              onClick={() => onOpen(row)}
            >
              <div style={rowTitleStyle}>
                {compactText(row.name) ||
                  compactText(row.symbol) ||
                  humanizeTokenLocale(locale, compactText(row.connector_id)) ||
                  'N/A'}
              </div>
              <div style={mutedTwoLineStyle}>
                {[
                  compactText(row.status)
                    ? humanizeTokenLocale(locale, compactText(row.status))
                    : '',
                  compactText(row.direction),
                  localizeSystemText(locale, compactText(row.summary)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}
