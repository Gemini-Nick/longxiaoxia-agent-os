import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  dispose,
  init,
  registerOverlay,
  type Chart,
  type DeepPartial,
  type KLineData,
  type OverlayCreateFiguresCallbackParams,
  type Styles,
} from 'klinecharts'

import type {
  LongclawRun,
  SignalsDashboard,
} from '../../../../src/services/longclawControlPlane/models.js'
import { fontStacks, statusBadgeStyle, tradingDeskTheme } from '../designSystem.js'
import type { LongclawLocale } from '../i18n.js'
import { observedFetchJson, recordObservationEvent } from '../observation.js'

type BacktestDashboard = Pick<
  SignalsDashboard,
  'backtest_summary' | 'backtest_jobs' | 'pending_backlog_preview' | 'review_runs' | 'buy_candidates'
>

type BacktestWorkbenchProps = {
  locale: LongclawLocale
  dashboard: BacktestDashboard
  signalsWebBaseUrl?: string
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (title: string, record: Record<string, unknown>) => void
}

type ApiError = Error & { status?: number; payload?: Record<string, unknown> }
type BacktestTab = 'perf' | 'trades' | 'signals' | 'scan'
type SignalType =
  | 'all'
  | 'macd'
  | 'czsc'
  | 'gap'
  | 'trend_breakout'
  | 'vol_contraction'
  | 'candle_run'
  | 'candle_accel'

type BacktestSignal = {
  dt?: number
  date_str?: string
  type?: string
  group?: string
  price?: number
  confidence?: number
  ma_status?: string
  volume_status?: string
  eval?: Record<string, unknown>
}

type BacktestTrade = {
  signal_date?: string
  signal_type?: string
  entry_date?: string
  entry_price?: number | null
  exit_date?: string
  exit_price?: number | null
  exit_reason?: string
  fill_type?: string
  holding_days?: number
  return_pct?: number
  net_return_pct?: number
  cost_pct?: number
  mfe_pct?: number
  mae_pct?: number
  skip_reason?: string | null
}

type BacktestResult = {
  symbol?: string
  code?: string
  freq?: string
  data_source?: string
  data_source_detail?: string
  as_of?: string
  bar_count?: number
  freshness?: string
  derived_from?: string
  partial?: boolean
  last_upstream_error?: string
  ohlcv?: Record<string, unknown>[]
  signals?: BacktestSignal[]
  kpi?: Record<string, unknown>
  sim_kpi?: Record<string, unknown>
  sim_trades?: BacktestTrade[]
  sim_equity?: Record<string, unknown>[]
  sim_config?: Record<string, unknown>
  sim_skip_reasons?: Record<string, unknown>
  date_presets?: Array<{ key?: string; label?: string; date?: string; time?: number }>
  warnings?: string[]
}

type ScanResult = {
  best_params?: Record<string, unknown>
  scan_results?: Array<Record<string, unknown>>
  heatmap?: Record<string, unknown>
  error?: string
}

type MarkerData = {
  label: string
  color: string
  side: 'buy' | 'sell'
}

const BACKTEST_MARKER_OVERLAY = 'longclawBacktestMarker'
const BACKTEST_MARKER_GROUP = 'longclaw-backtest-markers'
let markerRegistered = false
const terminalTheme = tradingDeskTheme.colors

const rootStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: '40px minmax(0, 1fr)',
  background: terminalTheme.root,
  color: terminalTheme.text,
  fontFamily: fontStacks.ui,
}

const toolbarStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto minmax(160px, 240px) auto auto auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: 7,
  padding: '5px 9px',
  borderBottom: `1px solid ${terminalTheme.grid}`,
  background: terminalTheme.panel,
  minWidth: 0,
}

const mainGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(214px, 250px) minmax(0, 1fr) minmax(250px, 320px)',
  minHeight: 0,
  overflow: 'hidden',
  gap: 1,
  background: terminalTheme.grid,
}

const sideStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minHeight: 0,
  overflow: 'hidden',
  background: terminalTheme.grid,
}

const panelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 9,
  minHeight: 0,
  overflow: 'hidden',
  background: terminalTheme.panel,
}

const chartPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 8,
  minHeight: 0,
  background: terminalTheme.root,
}

const chartHeaderStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(150px, 1fr) auto',
  alignItems: 'center',
  gap: 8,
}

const chartTitleStyle: React.CSSProperties = {
  color: terminalTheme.textStrong,
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 800,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const chartShellStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  border: `1px solid ${terminalTheme.chartBorder}`,
  background: terminalTheme.chartPanel,
  overflow: 'hidden',
}

const inputStyle: React.CSSProperties = {
  height: 30,
  minWidth: 0,
  border: `1px solid ${terminalTheme.borderStrong}`,
  borderRadius: 5,
  background: terminalTheme.root,
  color: terminalTheme.textStrong,
  padding: '0 9px',
  fontFamily: fontStacks.mono,
  fontSize: 13,
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  color: terminalTheme.text,
  fontFamily: fontStacks.ui,
}

const labelStyle: React.CSSProperties = {
  color: terminalTheme.mutedStrong,
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: 0,
}

const mutedStyle: React.CSSProperties = {
  color: terminalTheme.muted,
  fontSize: 12,
  lineHeight: 1.35,
}

const monoStyle: React.CSSProperties = {
  color: terminalTheme.mono,
  fontFamily: fontStacks.mono,
  fontSize: 12,
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.panelSoft,
  padding: '7px 8px',
  minWidth: 0,
}

const compactListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minHeight: 0,
  overflow: 'auto',
}

const metricGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 6,
}

const metricCardStyle: React.CSSProperties = {
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
  background: terminalTheme.panelInset,
  padding: '7px 8px',
  minWidth: 0,
}

const tableWrapStyle: React.CSSProperties = {
  minHeight: 0,
  overflow: 'auto',
  border: `1px solid ${terminalTheme.border}`,
  borderRadius: 5,
}

const emptyStyle: React.CSSProperties = {
  border: `1px dashed ${terminalTheme.borderMuted}`,
  borderRadius: 5,
  background: terminalTheme.empty,
  color: terminalTheme.muted,
  padding: '12px 10px',
  textAlign: 'center',
  fontSize: 13,
}

const warningStyle: React.CSSProperties = {
  border: `1px solid ${tradingDeskTheme.alpha.accentBorder}`,
  background: tradingDeskTheme.alpha.accentSurface,
  color: terminalTheme.accentText,
  padding: '8px 10px',
  fontSize: 13,
}

function backtestDataSourceLabel(result: BacktestResult | null, locale: LongclawLocale): string {
  if (!result?.data_source) return ''
  if (result.data_source_detail) return result.data_source_detail
  const labels: Record<string, string> = locale === 'zh-CN'
    ? {
        disk_cache: '磁盘缓存',
        daily_cache_resampled_weekly: '日线聚合周线',
        daily_cache_resampled_monthly: '日线聚合月线',
        mongodb: 'MongoDB',
        mongodb_bars: 'MongoDB bars',
        mongodb_daily_resampled_weekly: 'Mongo日线聚合周线',
        mongodb_daily_resampled_monthly: 'Mongo日线聚合月线',
        eastmoney: '东财',
        eastmoney_minute: '东财分钟线',
        sina: '新浪',
      }
    : {
        disk_cache: 'Disk cache',
        daily_cache_resampled_weekly: 'Daily cache to weekly',
        daily_cache_resampled_monthly: 'Daily cache to monthly',
        mongodb: 'MongoDB',
        mongodb_bars: 'MongoDB bars',
        mongodb_daily_resampled_weekly: 'Mongo daily to weekly',
        mongodb_daily_resampled_monthly: 'Mongo daily to monthly',
        eastmoney: 'Eastmoney',
        eastmoney_minute: 'Eastmoney intraday',
        sina: 'Sina',
      }
  return labels[result.data_source] ?? result.data_source
}

function isFallbackDataSource(result: BacktestResult | null): boolean {
  return [
    'disk_cache',
    'daily_cache_resampled_weekly',
    'daily_cache_resampled_monthly',
    'mongodb',
    'mongodb_bars',
    'mongodb_daily_resampled_weekly',
    'mongodb_daily_resampled_monthly',
  ].includes(result?.data_source ?? '')
}

function dataHealthText(result: BacktestResult | null, locale: LongclawLocale): string {
  if (!result) return ''
  const parts = [
    result.as_of ? `${locale === 'zh-CN' ? '截至' : 'as of'} ${result.as_of}` : '',
    typeof result.bar_count === 'number' ? `${result.bar_count} bars` : '',
    result.freshness ? result.freshness : '',
    result.derived_from ? `${locale === 'zh-CN' ? '聚合自' : 'derived from'} ${result.derived_from}` : '',
    result.partial ? (locale === 'zh-CN' ? 'partial' : 'partial') : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function buttonStyle(active = false, disabled = false): React.CSSProperties {
  return {
    height: 30,
    border: `1px solid ${active ? terminalTheme.accent : terminalTheme.borderStrong}`,
    borderRadius: 5,
    background: active ? terminalTheme.accentSoft : terminalTheme.control,
    color: active ? terminalTheme.accentText : terminalTheme.controlText,
    padding: '0 10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: fontStacks.ui,
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  }
}

function trimTrailingSlash(value?: string): string {
  return value?.trim().replace(/\/+$/, '') ?? ''
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

function formatNumber(value: unknown, digits = 2): string {
  const number = numberValue(value)
  if (number === undefined) return 'N/A'
  return number.toFixed(digits)
}

function formatPercent(value: unknown): string {
  const number = numberValue(value)
  if (number === undefined) return 'N/A'
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`
}

function defaultCodeFromDashboard(dashboard: BacktestDashboard): string {
  const pending = dashboard.pending_backlog_preview[0]
  const candidate = dashboard.buy_candidates[0]
  return (
    stringValue(pending?.symbol) ??
    stringValue(candidate?.symbol) ??
    '002759'
  ).replace(/^(SZ|SH|HK|US)\./i, '')
}

function toKLineData(rawRows: Record<string, unknown>[] | undefined): KLineData[] {
  const rows = Array.isArray(rawRows) ? rawRows : []
  return rows
    .map(row => {
      const time = numberValue(row.time ?? row.dt ?? row.timestamp)
      const close = numberValue(row.close)
      if (!time || close === undefined) return null
      const timestamp = time < 10_000_000_000 ? time * 1000 : time
      const open = numberValue(row.open) ?? close
      const high = numberValue(row.high) ?? Math.max(open, close)
      const low = numberValue(row.low) ?? Math.min(open, close)
      return {
        timestamp,
        open,
        high,
        low,
        close,
        volume: numberValue(row.volume) ?? numberValue(row.vol) ?? 0,
      } satisfies KLineData
    })
    .filter((item): item is KLineData => Boolean(item))
    .sort((left, right) => left.timestamp - right.timestamp)
}

async function fetchJson<T>(baseUrl: string, path: string, timeoutMs = 120_000): Promise<T> {
  return observedFetchJson<T>(baseUrl, path, {
    timeoutMs,
    source: 'backtest.api',
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
        upBorderColor: tradingDeskTheme.market.up,
        downBorderColor: tradingDeskTheme.market.down,
        upWickColor: tradingDeskTheme.market.up,
        downWickColor: tradingDeskTheme.market.down,
        noChangeColor: tradingDeskTheme.market.flat,
      },
      priceMark: {
        last: {
          line: { show: true, color: tradingDeskTheme.chart.line, size: 1 },
          text: { show: true, color: terminalTheme.white, backgroundColor: tradingDeskTheme.chart.line, size: 11 },
        },
      },
    },
    indicator: {
      lines: [
        { color: tradingDeskTheme.chart.orange, size: 1, style: 'solid' },
        { color: tradingDeskTheme.chart.line, size: 1, style: 'solid' },
        { color: tradingDeskTheme.chart.violet, size: 1, style: 'solid' },
        { color: tradingDeskTheme.market.down, size: 1, style: 'solid' },
      ],
    },
    xAxis: { tickText: { color: tradingDeskTheme.market.flat, size: 11 } },
    yAxis: { tickText: { color: tradingDeskTheme.market.flat, size: 11 } },
    crosshair: {
      horizontal: { line: { color: tradingDeskTheme.market.flat, size: 1 } },
      vertical: { line: { color: tradingDeskTheme.market.flat, size: 1 } },
    },
    separator: { color: tradingDeskTheme.chart.separator, size: 1 },
  }
}

function ensureMarkerOverlay() {
  if (markerRegistered) return
  registerOverlay({
    name: BACKTEST_MARKER_OVERLAY,
    totalStep: 2,
    lock: true,
    needDefaultPointFigure: false,
    needDefaultXAxisFigure: false,
    needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates }: OverlayCreateFiguresCallbackParams) => {
      const point = coordinates[0]
      if (!point) return []
      const data = recordValue(overlay.extendData) as MarkerData
      const label = data.label || 'SIG'
      const side = data.side === 'sell' ? 'sell' : 'buy'
      const color = data.color || (side === 'buy' ? tradingDeskTheme.chart.orange : tradingDeskTheme.chart.purple)
      const width = Math.max(32, Math.min(70, label.length * 8 + 14))
      const height = 18
      const rectX = point.x - width / 2
      const rectY = side === 'buy' ? point.y + 8 : point.y - height - 8
      return [
        {
          type: 'rect',
          attrs: { x: rectX, y: rectY, width, height },
          styles: { color, borderColor: tradingDeskTheme.alpha.textBorderStrong, borderRadius: 4 },
          ignoreEvent: true,
        },
        {
          type: 'text',
          attrs: {
            x: point.x,
            y: rectY + height / 2,
            text: label.slice(0, 8),
            align: 'center',
            baseline: 'middle',
          },
          styles: {
            color: terminalTheme.white,
            size: 10,
            weight: 700,
            family: 'IBM Plex Mono, Menlo, monospace',
          },
          ignoreEvent: true,
        },
      ]
    },
  })
  markerRegistered = true
}

function signalLabel(signal: BacktestSignal): string {
  const raw = String(signal.type ?? signal.group ?? 'SIG').trim()
  if (!raw) return 'SIG'
  return /^[\x00-\x7F]+$/.test(raw) ? raw.toUpperCase().slice(0, 5) : raw.slice(0, 4)
}

function signalColor(signal: BacktestSignal): string {
  const group = String(signal.group ?? '').toLowerCase()
  if (group === 'macd') return tradingDeskTheme.market.down
  if (group === 'czsc') return tradingDeskTheme.chart.orange
  if (group.includes('trend')) return tradingDeskTheme.market.down
  if (group.includes('vol')) return tradingDeskTheme.chart.violet
  if (group.includes('candle')) return tradingDeskTheme.chart.gold
  if (group.includes('gap')) return tradingDeskTheme.chart.orange
  return tradingDeskTheme.chart.purple
}

function signalSide(signal: BacktestSignal): 'buy' | 'sell' {
  const text = String(signal.type ?? '').toLowerCase()
  return text.includes('卖') || text.includes('sell') || text.includes('exit') ? 'sell' : 'buy'
}

function createSignalOverlays(chart: Chart, data: KLineData[], signals: BacktestSignal[]) {
  chart.removeOverlay({ groupId: BACKTEST_MARKER_GROUP })
  if (data.length === 0) return
  const dataByTimestamp = new Map(data.map(item => [item.timestamp, item]))
  signals.slice(-80).forEach(signal => {
    const rawTime = numberValue(signal.dt)
    if (!rawTime) return
    const timestamp = rawTime < 10_000_000_000 ? rawTime * 1000 : rawTime
    const price = numberValue(signal.price) ?? dataByTimestamp.get(timestamp)?.close
    if (price === undefined) return
    chart.createOverlay({
      name: BACKTEST_MARKER_OVERLAY,
      groupId: BACKTEST_MARKER_GROUP,
      lock: true,
      points: [{ timestamp, value: price }],
      extendData: {
        label: signalLabel(signal),
        color: signalColor(signal),
        side: signalSide(signal),
      } satisfies MarkerData,
    })
  })
}

function buildParams(
  code: string,
  freq: string,
  signalType: SignalType,
  simParams: Record<string, string>,
): URLSearchParams {
  const params = new URLSearchParams({ code, freq })
  if (signalType === 'all' || signalType === 'macd' || signalType === 'czsc') {
    params.set('signal_group', signalType)
  } else {
    params.set('signal_group', 'all')
    params.set('factor', signalType)
  }
  Object.entries(simParams).forEach(([key, value]) => {
    if (value.trim()) params.set(key, value)
  })
  return params
}

export function BacktestWorkbench({
  locale,
  dashboard,
  signalsWebBaseUrl,
  onOpenRun,
  onOpenRecord,
}: BacktestWorkbenchProps) {
  const baseUrl = trimTrailingSlash(signalsWebBaseUrl)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<Chart | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const [code, setCode] = useState(() => defaultCodeFromDashboard(dashboard))
  const [freq, setFreq] = useState('daily')
  const [signalType, setSignalType] = useState<SignalType>('all')
  const [tab, setTab] = useState<BacktestTab>('perf')
  const [result, setResult] = useState<BacktestResult | null>(null)
  const [scan, setScan] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [simParams, setSimParams] = useState<Record<string, string>>({
    stop_loss: '5',
    trail_stop: '50',
    max_hold: '20',
    slippage: '0.1',
    take_profit: '0',
    ma_exit_period: '0',
    profit_drawdown: '0',
    atr_exit_period: '0',
    atr_exit_mult: '2.0',
  })
  const [scanParams, setScanParams] = useState<Record<string, string>>({
    scan_param: 'stop_loss_pct',
    scan_values: '3,5,7,10',
    scan_param2: '',
    scan_values2: '',
    scan_metric: 'sharpe',
  })

  const klineData = useMemo(() => toKLineData(result?.ohlcv), [result])
  const signals = result?.signals ?? []
  const trades = result?.sim_trades ?? []
  const filledTrades = trades.filter(trade => trade.entry_price !== null && trade.entry_price !== undefined)
  const dataSourceLabel = backtestDataSourceLabel(result, locale)
  const dataHealthLabel = dataHealthText(result, locale)

  const updateSimParam = useCallback((key: string, value: string) => {
    setSimParams(previous => ({ ...previous, [key]: value }))
  }, [])

  const updateScanParam = useCallback((key: string, value: string) => {
    setScanParams(previous => ({ ...previous, [key]: value }))
  }, [])

  const runAnalyze = useCallback(async () => {
    if (!baseUrl || !code.trim()) return
    const hadResult = Boolean(result)
    recordObservationEvent('backtest.analyze.submit', {
      code: code.trim(),
      freq,
      signal_type: signalType,
      had_result: hadResult,
    })
    setLoading(true)
    setError(null)
    try {
      const params = buildParams(code.trim(), freq, signalType, simParams)
      const data = await fetchJson<BacktestResult>(baseUrl, `/api/backtest/analyze?${params.toString()}`)
      setResult(data)
      setScan(null)
      if (!hadResult) setTab('perf')
      recordObservationEvent('backtest.analyze.success', {
        code: data.code ?? code.trim(),
        symbol: data.symbol,
        freq: data.freq ?? freq,
        data_source: data.data_source,
        data_source_detail: data.data_source_detail,
        as_of: data.as_of,
        bar_count: data.bar_count,
        freshness: data.freshness,
        derived_from: data.derived_from,
        partial: data.partial,
        last_upstream_error: data.last_upstream_error,
        signals: data.signals?.length ?? 0,
        trades: data.sim_trades?.length ?? 0,
      })
    } catch (rawError) {
      const apiError = rawError as ApiError
      setError(apiError.message || (locale === 'zh-CN' ? '回测分析失败。' : 'Backtest analysis failed.'))
      recordObservationEvent('backtest.analyze.error', {
        code: code.trim(),
        freq,
        signal_type: signalType,
        status: apiError.status,
        error: apiError.message,
        upstream_error: apiError.payload?.last_upstream_error,
        payload_error: apiError.payload?.error,
        level: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [baseUrl, code, freq, locale, result, signalType, simParams])

  const runScan = useCallback(async () => {
    if (!baseUrl || !code.trim()) return
    recordObservationEvent('backtest.scan.submit', {
      code: code.trim(),
      freq,
      signal_type: signalType,
      scan_params: scanParams,
    })
    setScanLoading(true)
    setError(null)
    try {
      const params = buildParams(code.trim(), freq, signalType, simParams)
      Object.entries(scanParams).forEach(([key, value]) => {
        if (value.trim()) params.set(key, value)
      })
      const data = await fetchJson<ScanResult>(baseUrl, `/api/backtest/scan?${params.toString()}`, 300_000)
      setScan(data)
      setTab('scan')
      if (data.error) setError(data.error)
      recordObservationEvent('backtest.scan.finish', {
        code: code.trim(),
        freq,
        result_count: data.scan_results?.length ?? 0,
        error: data.error,
        level: data.error ? 'error' : 'info',
      })
    } catch (rawError) {
      const apiError = rawError as ApiError
      setError(apiError.message || (locale === 'zh-CN' ? '参数扫描失败。' : 'Parameter scan failed.'))
      recordObservationEvent('backtest.scan.error', {
        code: code.trim(),
        freq,
        signal_type: signalType,
        status: apiError.status,
        error: apiError.message,
        level: 'error',
      })
    } finally {
      setScanLoading(false)
    }
  }, [baseUrl, code, freq, locale, scanParams, signalType, simParams])

  const exportCsv = useCallback(() => {
    if (!baseUrl || !code.trim()) return
    const params = buildParams(code.trim(), freq, signalType, simParams)
    window.open(`${baseUrl}/api/backtest/export?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }, [baseUrl, code, freq, signalType, simParams])

  useEffect(() => {
    if (!chartContainerRef.current) return
    ensureMarkerOverlay()
    const chart = init(chartContainerRef.current, {
      locale: locale === 'zh-CN' ? 'zh-CN' : 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      styles: chartStyles(),
    })
    if (!chart) return
    chartRef.current = chart
    chart.setBarSpace(7)
    chart.setOffsetRightDistance(34)
    chart.createIndicator('MA', true, { id: 'candle_pane' })
    chart.createIndicator('VOL')
    chart.createIndicator('MACD')
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
  }, [locale])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay({ groupId: BACKTEST_MARKER_GROUP })
    if (klineData.length === 0) {
      chart.clearData()
      return
    }
    chart.applyNewData(klineData)
    createSignalOverlays(chart, klineData, signals)
    chart.scrollToRealTime()
    chart.resize()
  }, [klineData, signals])

  if (!baseUrl) {
    return (
      <div style={rootStyle}>
        <div style={{ ...warningStyle, margin: 9 }}>
          {locale === 'zh-CN'
            ? '信号实时入口未配置，当前显示降级队列。'
            : 'Signals live endpoint is not configured. Showing the degraded queue.'}
        </div>
        <FallbackBacktest
          locale={locale}
          dashboard={dashboard}
          onOpenRun={onOpenRun}
          onOpenRecord={onOpenRecord}
        />
      </div>
    )
  }

  return (
    <div style={rootStyle}>
      <form
        style={toolbarStyle}
        onSubmit={event => {
          event.preventDefault()
          void runAnalyze()
        }}
      >
        <div style={labelStyle}>{locale === 'zh-CN' ? 'Signals 回测' : 'Signals Backtest'}</div>
        <input
          aria-label={locale === 'zh-CN' ? '股票代码' : 'Symbol'}
          style={inputStyle}
          value={code}
          placeholder="002759 / 600519 / 09988…"
          onChange={event => setCode(event.target.value)}
        />
        <select
          style={selectStyle}
          value={freq}
          onChange={event => {
            const nextFreq = event.target.value
            recordObservationEvent('backtest.freq.change', {
              previous: freq,
              next: nextFreq,
              code: code.trim(),
            })
            setFreq(nextFreq)
          }}
        >
          <option value="daily">{locale === 'zh-CN' ? '日线' : 'Daily'}</option>
          <option value="weekly">{locale === 'zh-CN' ? '周线' : 'Weekly'}</option>
          <option value="monthly">{locale === 'zh-CN' ? '月线' : 'Monthly'}</option>
        </select>
        <select
          style={selectStyle}
          value={signalType}
          onChange={event => {
            const nextSignalType = event.target.value as SignalType
            recordObservationEvent('backtest.signal-type.change', {
              previous: signalType,
              next: nextSignalType,
              code: code.trim(),
              freq,
            })
            setSignalType(nextSignalType)
          }}
        >
          <option value="all">{locale === 'zh-CN' ? '全部信号' : 'All signals'}</option>
          <option value="macd">MACD</option>
          <option value="czsc">{locale === 'zh-CN' ? '缠论' : 'CZSC'}</option>
          <option value="gap">{locale === 'zh-CN' ? '跳空缺口' : 'Gap'}</option>
          <option value="trend_breakout">{locale === 'zh-CN' ? '趋势突破' : 'Breakout'}</option>
          <option value="vol_contraction">{locale === 'zh-CN' ? '波动收缩' : 'Vol squeeze'}</option>
          <option value="candle_run">{locale === 'zh-CN' ? '连续K线' : 'Candle run'}</option>
          <option value="candle_accel">{locale === 'zh-CN' ? '加速K线' : 'Acceleration'}</option>
        </select>
        <button type="submit" style={buttonStyle(true, loading)} disabled={loading}>
          {loading ? (locale === 'zh-CN' ? '分析中' : 'Running') : (locale === 'zh-CN' ? '运行' : 'Run')}
        </button>
        <div style={mutedStyle}>
          {error ??
            (result
              ? `${result.symbol ?? result.code ?? code} · ${signals.length} signals · ${filledTrades.length} trades`
                + (dataSourceLabel ? ` · ${dataSourceLabel}` : '')
              : locale === 'zh-CN'
                ? '输入代码后运行增强回测'
                : 'Enter a symbol to run enhanced backtest')}
        </div>
        <button type="button" style={buttonStyle(false, !result)} disabled={!result} onClick={exportCsv}>
          CSV
        </button>
      </form>

      <div style={mainGridStyle}>
        <div style={sideStyle}>
          <Panel title={locale === 'zh-CN' ? '模拟参数' : 'Simulation'}>
            <ParamGrid params={simParams} onChange={updateSimParam} />
          </Panel>
          <Panel title={locale === 'zh-CN' ? '日期标签' : 'Date presets'}>
            {result?.date_presets?.length ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {result.date_presets.slice(0, 12).map(item => (
                  <button
                    key={item.key ?? item.label ?? item.date}
                    type="button"
                    style={buttonStyle(false)}
                    onClick={() => {
                      const chart = chartRef.current
                      const time = numberValue(item.time)
                      if (chart && time) chart.scrollToTimestamp(time * 1000, 300)
                    }}
                  >
                    {String(item.label ?? item.date ?? item.key ?? '').split('—')[0].trim()}
                  </button>
                ))}
              </div>
            ) : (
              <div style={emptyStyle}>{locale === 'zh-CN' ? '运行后显示事件标签。' : 'Run to show event presets.'}</div>
            )}
          </Panel>
          <Panel title={locale === 'zh-CN' ? '降级队列' : 'Fallback queue'}>
            <FallbackRows dashboard={dashboard} onOpenRun={onOpenRun} onOpenRecord={onOpenRecord} />
          </Panel>
        </div>

        <div style={chartPanelStyle}>
          <div style={chartHeaderStyle}>
            <div style={{ minWidth: 0 }}>
              <div style={labelStyle}>{[result?.freq ?? freq, dataSourceLabel].filter(Boolean).join(' · ')}</div>
              <div style={chartTitleStyle}>{result?.symbol ?? result?.code ?? code}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {dataSourceLabel ? (
                <span style={statusBadgeStyle(isFallbackDataSource(result) ? 'warning' : 'success')}>
                  {dataSourceLabel}
                </span>
              ) : null}
              {result?.freshness ? (
                <span style={statusBadgeStyle(result.freshness === 'fresh' ? 'success' : 'warning')}>
                  {result.freshness}
                </span>
              ) : null}
              {(result?.warnings ?? []).slice(0, 2).map(item => (
                <span key={item} style={statusBadgeStyle('warning')}>{item}</span>
              ))}
              <span style={statusBadgeStyle(error ? 'failed' : loading ? 'running' : result ? 'success' : 'open')}>
                {error ? 'error' : loading ? 'running' : result ? 'ready' : 'idle'}
              </span>
            </div>
          </div>
          {dataHealthLabel ? (
            <div style={{ ...mutedStyle, padding: '0 2px', minHeight: 16 }}>
              {dataHealthLabel}
            </div>
          ) : null}
          <MetricStrip result={result} />
          <div style={chartShellStyle}>
            <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
            {!result || klineData.length === 0 ? (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: terminalTheme.mutedStrong,
                background: result ? 'rgba(8, 11, 18, 0.86)' : 'transparent',
              }}>
                {loading
                  ? (locale === 'zh-CN' ? '正在拉取 Signals 回测数据。' : 'Loading Signals backtest data.')
                  : (locale === 'zh-CN' ? '运行分析后显示 K线、信号、MACD 与成交。' : 'Run analysis to show candles, signals, MACD, and trades.')}
              </div>
            ) : null}
          </div>
        </div>

        <div style={sideStyle}>
          <div style={{ ...panelStyle, gap: 7 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {(['perf', 'trades', 'signals', 'scan'] as BacktestTab[]).map(item => (
                <button
                  key={item}
                  type="button"
                  style={buttonStyle(tab === item)}
                  onClick={() => {
                    recordObservationEvent('backtest.tab.click', {
                      previous: tab,
                      next: item,
                      code: code.trim(),
                      freq,
                    })
                    setTab(item)
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          {tab === 'perf' ? (
            <Panel title={locale === 'zh-CN' ? '绩效总览' : 'Performance'}>
              <KpiPanel kpi={result?.kpi} simKpi={result?.sim_kpi} />
            </Panel>
          ) : tab === 'trades' ? (
            <Panel title={locale === 'zh-CN' ? '交易明细' : 'Trades'} meta={String(filledTrades.length)}>
              <TradeTable trades={trades} />
            </Panel>
          ) : tab === 'signals' ? (
            <Panel title={locale === 'zh-CN' ? '信号详情' : 'Signals'} meta={String(signals.length)}>
              <SignalTable signals={signals} />
            </Panel>
          ) : (
            <Panel title={locale === 'zh-CN' ? '参数扫描' : 'Parameter scan'}>
              <ScanControls
                params={scanParams}
                loading={scanLoading}
                scan={scan}
                onChange={updateScanParam}
                onRun={() => {
                  void runScan()
                }}
              />
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}

function Panel({
  title,
  meta,
  children,
}: {
  title: string
  meta?: string
  children: React.ReactNode
}) {
  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <div style={{ color: terminalTheme.textStrong, fontSize: 13, fontWeight: 800 }}>{title}</div>
        {meta ? <div style={mutedStyle}>{meta}</div> : null}
      </div>
      {children}
    </div>
  )
}

function MetricStrip({ result }: { result: BacktestResult | null }) {
  const kpi = result?.kpi ?? {}
  const simKpi = result?.sim_kpi ?? {}
  const items = [
    { label: 'Signals', value: formatNumber(kpi.total, 0) },
    { label: 'Win T10', value: formatPercent(kpi.win_rate) },
    { label: 'Expect', value: formatPercent(kpi.expectancy) },
    { label: 'Trades', value: formatNumber(simKpi.filled_trades, 0) },
    { label: 'Return', value: formatPercent(simKpi.total_return_pct) },
    { label: 'DD', value: formatPercent(simKpi.max_drawdown_pct) },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 6 }}>
      {items.map(item => (
        <div key={item.label} style={metricCardStyle}>
          <div style={labelStyle}>{item.label}</div>
          <div style={{ color: terminalTheme.textStrong, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  )
}

function ParamGrid({
  params,
  onChange,
}: {
  params: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  const items = [
    ['stop_loss', '止损%'],
    ['trail_stop', '移动止盈%'],
    ['max_hold', '持仓日'],
    ['slippage', '滑点%'],
    ['take_profit', '固定止盈%'],
    ['ma_exit_period', '均线离场'],
    ['profit_drawdown', '利润回撤%'],
    ['atr_exit_period', 'ATR周期'],
    ['atr_exit_mult', 'ATR倍数'],
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 7 }}>
      {items.map(([key, label]) => (
        <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={mutedStyle}>{label}</span>
          <input
            style={{ ...inputStyle, height: 28 }}
            value={params[key] ?? ''}
            onChange={event => onChange(key, event.target.value)}
          />
        </label>
      ))}
    </div>
  )
}

function KpiPanel({
  kpi,
  simKpi,
}: {
  kpi?: Record<string, unknown>
  simKpi?: Record<string, unknown>
}) {
  if (!kpi && !simKpi) return <div style={emptyStyle}>运行后显示绩效。</div>
  const signalItems = [
    ['总信号', kpi?.total],
    ['已评估', kpi?.evaluated],
    ['胜率', formatPercent(kpi?.win_rate)],
    ['期望', formatPercent(kpi?.expectancy)],
    ['T+10', formatPercent(kpi?.avg_return_t10)],
    ['MFE/MAE', `${formatPercent(kpi?.avg_mfe)} / ${formatPercent(kpi?.avg_mae)}`],
  ]
  const simItems = [
    ['成交', simKpi?.filled_trades],
    ['胜率', formatPercent(simKpi?.win_rate)],
    ['总收益', formatPercent(simKpi?.total_return_pct)],
    ['Sharpe', formatNumber(simKpi?.sharpe, 2)],
    ['盈亏比', formatNumber(simKpi?.profit_factor, 2)],
    ['最大回撤', formatPercent(simKpi?.max_drawdown_pct)],
  ]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'auto' }}>
      <MetricGroup title="信号质量" items={signalItems} />
      <MetricGroup title="交易模拟" items={simItems} />
    </div>
  )
}

function MetricGroup({ title, items }: { title: string; items: Array<[string, unknown]> }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      <div style={labelStyle}>{title}</div>
      <div style={metricGridStyle}>
        {items.map(([label, value]) => (
          <div key={label} style={metricCardStyle}>
            <div style={mutedStyle}>{label}</div>
            <div style={{ color: terminalTheme.textStrong, fontWeight: 800 }}>{String(value ?? 'N/A')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function SignalTable({ signals }: { signals: BacktestSignal[] }) {
  if (signals.length === 0) return <div style={emptyStyle}>暂无信号。</div>
  return (
    <div style={tableWrapStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: terminalTheme.mutedStrong, textAlign: 'left' }}>
            <th style={{ padding: 7 }}>日期</th>
            <th style={{ padding: 7 }}>信号</th>
            <th style={{ padding: 7 }}>价格</th>
            <th style={{ padding: 7 }}>T+10</th>
          </tr>
        </thead>
        <tbody>
          {signals.slice().reverse().map((signal, index) => {
            const returnT10 = numberValue(signal.eval?.return_t10)
            return (
              <tr key={`${signal.dt ?? index}-${signal.type ?? 'signal'}`} style={{ borderTop: `1px solid ${terminalTheme.border}` }}>
                <td style={{ padding: 7, color: terminalTheme.mono }}>{signal.date_str ?? ''}</td>
                <td style={{ padding: 7 }}>
                  <div style={{ color: terminalTheme.textStrong, fontWeight: 700 }}>{signal.type ?? signal.group ?? 'Signal'}</div>
                  <div style={mutedStyle}>{[signal.group, signal.ma_status, signal.volume_status].filter(Boolean).join(' · ')}</div>
                </td>
                <td style={{ padding: 7, color: terminalTheme.mono }}>{formatNumber(signal.price)}</td>
                <td style={{ padding: 7, color: (returnT10 ?? 0) >= 0 ? tradingDeskTheme.market.up : tradingDeskTheme.market.down }}>
                  {formatPercent(returnT10)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TradeTable({ trades }: { trades: BacktestTrade[] }) {
  const filled = trades.filter(trade => trade.entry_price !== null && trade.entry_price !== undefined)
  if (filled.length === 0) return <div style={emptyStyle}>暂无成交记录。</div>
  return (
    <div style={tableWrapStyle}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ color: terminalTheme.mutedStrong, textAlign: 'left' }}>
            <th style={{ padding: 7 }}>信号</th>
            <th style={{ padding: 7 }}>入/出</th>
            <th style={{ padding: 7 }}>净利</th>
          </tr>
        </thead>
        <tbody>
          {filled.slice().reverse().map((trade, index) => (
            <tr key={`${trade.signal_date ?? index}-${trade.signal_type ?? 'trade'}`} style={{ borderTop: `1px solid ${terminalTheme.border}` }}>
              <td style={{ padding: 7 }}>
                <div style={{ color: terminalTheme.textStrong, fontWeight: 700 }}>{trade.signal_type ?? 'Signal'}</div>
                <div style={mutedStyle}>{trade.signal_date}</div>
              </td>
              <td style={{ padding: 7, color: terminalTheme.mono }}>
                {formatNumber(trade.entry_price)} / {formatNumber(trade.exit_price)}
                <div style={mutedStyle}>{trade.exit_reason ?? ''}</div>
              </td>
              <td style={{ padding: 7, color: (trade.net_return_pct ?? 0) >= 0 ? tradingDeskTheme.market.up : tradingDeskTheme.market.down, fontWeight: 800 }}>
                {formatPercent(trade.net_return_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScanControls({
  params,
  scan,
  loading,
  onChange,
  onRun,
}: {
  params: Record<string, string>
  scan: ScanResult | null
  loading: boolean
  onChange: (key: string, value: string) => void
  onRun: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <select style={selectStyle} value={params.scan_param} onChange={event => onChange('scan_param', event.target.value)}>
          <option value="stop_loss_pct">止损%</option>
          <option value="trail_stop_pct">移动止盈%</option>
          <option value="max_hold_days">最大持仓日</option>
          <option value="take_profit_pct">固定止盈%</option>
        </select>
        <input style={inputStyle} value={params.scan_values} onChange={event => onChange('scan_values', event.target.value)} />
        <select style={selectStyle} value={params.scan_metric} onChange={event => onChange('scan_metric', event.target.value)}>
          <option value="sharpe">Sharpe</option>
          <option value="win_rate">胜率</option>
          <option value="expectancy">期望</option>
          <option value="total_return_pct">总收益</option>
        </select>
        <button type="button" style={buttonStyle(true, loading)} disabled={loading} onClick={onRun}>
          {loading ? '扫描中' : '运行扫描'}
        </button>
      </div>
      {scan?.best_params ? (
        <div style={warningStyle}>
          最优参数：{Object.entries(scan.best_params).map(([key, value]) => `${key}=${String(value)}`).join(', ')}
        </div>
      ) : null}
      {scan?.scan_results?.length ? (
        <div style={tableWrapStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <tbody>
              {scan.scan_results.slice(0, 18).map((row, index) => (
                <tr key={index} style={{ borderTop: index === 0 ? 'none' : `1px solid ${terminalTheme.border}` }}>
                  <td style={{ padding: 7, color: terminalTheme.textStrong }}>
                    {Object.values(recordValue(row.params)).join(' / ')}
                  </td>
                  <td style={{ padding: 7, color: terminalTheme.mono }}>Sharpe {formatNumber(row.sharpe, 2)}</td>
                  <td style={{ padding: 7, color: terminalTheme.mono }}>WR {formatPercent(row.win_rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={emptyStyle}>展开扫描参数后运行。</div>
      )}
    </div>
  )
}

function FallbackRows({
  dashboard,
  onOpenRun,
  onOpenRecord,
}: {
  dashboard: BacktestDashboard
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (title: string, record: Record<string, unknown>) => void
}) {
  const rows = [
    ...dashboard.pending_backlog_preview.map(item => ({
      title: item.symbol,
      meta: `${item.signal_type} · ${item.freq}`,
      record: item as unknown as Record<string, unknown>,
    })),
    ...dashboard.backtest_jobs.map(item => ({
      title: String(item.job_id ?? item.symbol ?? 'job'),
      meta: String(item.status ?? ''),
      record: item as unknown as Record<string, unknown>,
    })),
  ]
  return (
    <div style={compactListStyle}>
      {rows.length === 0 ? (
        <div style={emptyStyle}>暂无降级队列。</div>
      ) : (
        rows.slice(0, 8).map((row, index) => (
          <button
            key={`${row.title}-${index}`}
            type="button"
            style={{ ...rowStyle, width: '100%', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => onOpenRecord(`Backtest ${row.title}`, row.record)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: terminalTheme.textStrong, fontWeight: 700 }}>{row.title}</div>
              <div style={mutedStyle}>{row.meta}</div>
            </div>
          </button>
        ))
      )}
      {dashboard.review_runs.slice(0, 4).map(run => (
        <button
          key={run.run_id}
          type="button"
          style={{ ...rowStyle, width: '100%', cursor: 'pointer', textAlign: 'left' }}
          onClick={() => {
            void onOpenRun(run as LongclawRun)
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: terminalTheme.textStrong, fontWeight: 700 }}>{run.summary || run.run_id}</div>
            <div style={mutedStyle}>{run.status}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

function FallbackBacktest({
  locale,
  dashboard,
  onOpenRun,
  onOpenRecord,
}: {
  locale: LongclawLocale
  dashboard: BacktestDashboard
  onOpenRun: (run: LongclawRun) => Promise<void>
  onOpenRecord: (title: string, record: Record<string, unknown>) => void
}) {
  return (
    <div style={{ ...mainGridStyle, gridTemplateColumns: '1fr' }}>
      <Panel title={locale === 'zh-CN' ? '回测队列' : 'Backtest queue'}>
        <FallbackRows dashboard={dashboard} onOpenRun={onOpenRun} onOpenRecord={onOpenRecord} />
      </Panel>
    </div>
  )
}
