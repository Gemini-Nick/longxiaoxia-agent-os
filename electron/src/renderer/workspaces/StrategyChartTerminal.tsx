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
import { statusBadgeStyle } from '../designSystem.js'
import { type LongclawLocale, humanizeTokenLocale } from '../i18n.js'

type StrategyDashboard = Pick<
  SignalsDashboard,
  | 'buy_candidates'
  | 'sell_warnings'
  | 'chart_context'
  | 'review_runs'
  | 'connector_health'
  | 'deep_links'
>

type StrategyChartTerminalProps = {
  locale: LongclawLocale
  dashboard: StrategyDashboard
  signalsWebBaseUrl?: string
  onOpenRun: (run: LongclawRun) => Promise<void>
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
  data_as_of?: string
  error?: string
}

type WorkbenchShell = {
  session?: WorkbenchSession
  indices?: Record<string, unknown>[]
  buy_candidates?: Record<string, unknown>[]
  cluster_summary?: Record<string, unknown>
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
}

type StrategySignal = {
  dt?: number
  time?: number
  timestamp?: number
  date_str?: string
  type?: string
  price?: number
  confidence?: number
  freq?: string
  details?: string
}

type StrategyKeyLevel = {
  name?: string
  value?: number
  position?: string
  distance_pct?: number | null
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
  candidate_stocks?: Record<string, unknown>[]
  stock_analysis?: Record<string, unknown>
}

type ChartTarget = {
  label: string
  kind: string
  freq: string
}

type ApiError = Error & {
  status?: number
  payload?: Record<string, unknown>
}

type SignalOverlayData = {
  label: string
  side: 'buy' | 'sell'
  color: string
}

const FREQ_OPTIONS = ['daily', '30min', '15min', 'weekly'] as const
const SIGNAL_OVERLAY_NAME = 'longclawSignalMarker'
const SIGNAL_OVERLAY_GROUP = 'longclaw-signals'
const LEVEL_OVERLAY_GROUP = 'longclaw-levels'

let signalOverlayRegistered = false

const terminalRootStyle: React.CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  background: '#0B1118',
  color: '#D7DEE8',
  fontFamily: '"Instrument Sans", "PingFang SC", "Noto Sans SC", sans-serif',
}

const terminalTopBarStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 380px) minmax(260px, 1fr) auto',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderBottom: '1px solid #1C2633',
  background: '#0F1620',
}

const searchFormStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1fr) auto',
  gap: 8,
  minWidth: 0,
}

const searchInputStyle: React.CSSProperties = {
  height: 32,
  minWidth: 0,
  border: '1px solid #263244',
  borderRadius: 5,
  background: '#0B1118',
  color: '#F2F6FB',
  padding: '0 10px',
  fontFamily: '"IBM Plex Mono", Menlo, monospace',
  fontSize: 13,
  outline: 'none',
}

const terminalGridStyle: React.CSSProperties = {
  flex: 1,
  display: 'grid',
  gridTemplateColumns: 'minmax(190px, 240px) minmax(520px, 1fr) minmax(230px, 310px)',
  gridTemplateRows: 'minmax(0, 1fr)',
  gap: 1,
  alignItems: 'stretch',
  minHeight: 0,
  overflow: 'hidden',
}

const terminalSideStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  background: '#1C2633',
}

const terminalPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
  minHeight: 0,
  padding: 10,
  border: 'none',
  borderRadius: 0,
  background: '#0F1620',
  color: '#D7DEE8',
  overflow: 'hidden',
}

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 8,
}

const panelTitleStyle: React.CSSProperties = {
  color: '#F2F6FB',
  fontSize: 13,
  fontWeight: 700,
}

const mutedTextStyle: React.CSSProperties = {
  color: '#7F8EA3',
  fontSize: 12,
  lineHeight: 1.35,
}

const monoTextStyle: React.CSSProperties = {
  color: '#9CB1CE',
  fontFamily: '"IBM Plex Mono", Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.35,
}

const eyebrowDarkStyle: React.CSSProperties = {
  color: '#8EA0B8',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
}

const rowTitleStyle: React.CSSProperties = {
  color: '#F2F6FB',
  fontWeight: 700,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const dataRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: '1px solid #222D3B',
  borderRadius: 5,
  background: '#121B27',
  padding: '7px 8px',
  minWidth: 0,
}

const emptyStateDarkStyle: React.CSSProperties = {
  border: '1px dashed #2A3748',
  borderRadius: 5,
  background: '#0E1722',
  color: '#7F8EA3',
  padding: '12px 10px',
  textAlign: 'center',
  fontSize: 13,
}

const noticeDarkStyle: React.CSSProperties = {
  border: '1px solid rgba(70, 132, 194, 0.35)',
  background: 'rgba(43, 91, 137, 0.16)',
  color: '#BFD9F5',
  padding: '8px 10px',
  fontSize: 13,
}

const warningDarkStyle: React.CSSProperties = {
  ...noticeDarkStyle,
  border: '1px solid rgba(208, 138, 84, 0.38)',
  background: 'rgba(208, 138, 84, 0.16)',
  color: '#FFD0A8',
}

const errorDarkStyle: React.CSSProperties = {
  ...noticeDarkStyle,
  border: '1px solid rgba(242, 54, 69, 0.38)',
  background: 'rgba(242, 54, 69, 0.14)',
  color: '#FFB4BD',
}

const compactListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const targetButtonStyle: React.CSSProperties = {
  border: '1px solid #222D3B',
  borderRadius: 5,
  padding: '7px 8px',
  textAlign: 'left',
  cursor: 'pointer',
  width: '100%',
  background: '#121B27',
  color: '#D7DEE8',
  fontFamily: '"Instrument Sans", "PingFang SC", "Noto Sans SC", sans-serif',
}

const chartStageStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
  minHeight: 0,
  padding: 10,
  border: 'none',
  borderRadius: 0,
  background: '#0B1118',
  overflow: 'hidden',
}

const chartHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
}

const chartTitleStyle: React.CSSProperties = {
  color: '#F2F6FB',
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 800,
}

const chartMetaRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 8,
}

const chartCanvasShellStyle: React.CSSProperties = {
  position: 'relative',
  minHeight: 0,
  flex: 1,
  overflow: 'hidden',
  border: '1px solid #202A38',
  borderRadius: 3,
  background: '#131722',
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
  color: '#D1D4DC',
  textAlign: 'center',
  background: 'rgba(19, 23, 34, 0.88)',
  zIndex: 2,
}

const statGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
}

const statTileStyle: React.CSSProperties = {
  border: '1px solid #222D3B',
  borderRadius: 5,
  padding: '7px 8px',
  background: '#101926',
  minWidth: 0,
}

const signalRowStyle: React.CSSProperties = {
  display: 'flex',
  border: '1px solid #222D3B',
  borderRadius: 5,
  background: '#121B27',
  padding: '7px 8px',
  alignItems: 'center',
}

const quickChipStyle: React.CSSProperties = {
  border: '1px solid #263244',
  borderRadius: 5,
  background: '#111A25',
  color: '#B7C2D0',
  padding: '7px 8px',
  cursor: 'pointer',
  fontFamily: '"Instrument Sans", "PingFang SC", "Noto Sans SC", sans-serif',
  fontSize: 13,
  fontWeight: 600,
  justifyContent: 'center',
  minHeight: 30,
}

const quickChipActiveStyle: React.CSSProperties = {
  ...quickChipStyle,
  border: '1px solid #D08A54',
  background: 'rgba(208, 138, 84, 0.18)',
  color: '#FFD0A8',
  justifyContent: 'center',
  minHeight: 30,
}

function terminalButtonStyle(active = false, disabled = false): React.CSSProperties {
  return {
    border: `1px solid ${active ? '#D08A54' : '#263244'}`,
    borderRadius: 5,
    background: active ? 'rgba(208, 138, 84, 0.18)' : '#111A25',
    color: active ? '#FFD0A8' : '#B7C2D0',
    padding: '7px 10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    fontFamily: '"Instrument Sans", "PingFang SC", "Noto Sans SC", sans-serif',
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: 'nowrap',
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
    normalized.includes('买')
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

function marketLabel(session?: WorkbenchSession, locale: LongclawLocale = 'zh-CN'): string {
  if (!session) return locale === 'zh-CN' ? '未连接' : 'Disconnected'
  if (session.a_live || session.hk_live || session.us_live) {
    const liveMarkets = [
      session.a_live ? 'A' : '',
      session.hk_live ? 'H' : '',
      session.us_live ? 'US' : '',
    ].filter(Boolean)
    return `${liveMarkets.join('+')} live`
  }
  return session.ready
    ? (locale === 'zh-CN' ? '已就绪' : 'Ready')
    : (session.running ? (locale === 'zh-CN' ? '启动中' : 'Booting') : (locale === 'zh-CN' ? '等待' : 'Idle'))
}

function shouldUseLiveRefresh(session?: WorkbenchSession): boolean {
  return Boolean(session?.a_live || session?.hk_live || session?.us_live)
}

async function fetchJson<T>(baseUrl: string, path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { signal })
  let payload: unknown = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok) {
    const error = new Error(
      stringValue(recordValue(payload).detail) ??
        stringValue(recordValue(payload).error) ??
        `${response.status} ${path}`,
    ) as ApiError
    error.status = response.status
    error.payload = recordValue(payload)
    throw error
  }
  return payload as T
}

function symbolDataFromIndexChart(
  label: string,
  requestedFreq: string,
  chart: Record<string, unknown>,
): WorkbenchSymbolData {
  const meta = recordValue(chart.meta)
  const report = recordValue(chart.report)
  const reportSignals = Array.isArray(chart.report_signals)
    ? chart.report_signals.map(item => recordValue(item))
    : []
  const ohlcv = Array.isArray(chart.ohlcv) ? chart.ohlcv.map(item => recordValue(item)) : []
  const lastBar = ohlcv[ohlcv.length - 1] ?? {}
  return {
    target: {
      kind: 'index',
      label,
      symbol: compactText(meta.symbol) || compactText(meta.name) || label,
      requested_freq: requestedFreq,
      effective_freq: compactText(meta.freq, requestedFreq),
      available_freqs: ['daily', '30min', '15min'],
    },
    chart,
    summary: {
      title: label,
      subtitle: compactText(meta.symbol) || compactText(meta.name),
      latest_price: numberValue(lastBar.close),
      conclusion: compactText(report.conclusion),
      latest_signal:
        compactText(report.daily_latest_signal) ||
        compactText(reportSignals[0]?.type),
      key_levels: Array.isArray(report.key_levels) ? report.key_levels : [],
    },
    signals: Array.isArray(chart.signals) ? (chart.signals as StrategySignal[]) : [],
    review: {},
    trade: {},
    analysis_target: '',
    candidate_stocks: [],
  }
}

function chartStyles(): DeepPartial<Styles> {
  return {
    grid: {
      horizontal: { color: 'rgba(120, 123, 134, 0.18)' },
      vertical: { color: 'rgba(120, 123, 134, 0.12)' },
    },
    candle: {
      bar: {
        upColor: '#F23645',
        downColor: '#26A69A',
        noChangeColor: '#787B86',
        upBorderColor: '#F23645',
        downBorderColor: '#26A69A',
        noChangeBorderColor: '#787B86',
        upWickColor: '#F23645',
        downWickColor: '#26A69A',
        noChangeWickColor: '#787B86',
      },
      tooltip: {
        text: {
          color: '#D1D4DC',
          size: 12,
          family: 'IBM Plex Mono, Menlo, monospace',
        },
      },
      priceMark: {
        last: {
          line: { show: true, color: '#2962FF', size: 1 },
          text: {
            show: true,
            color: '#FFFFFF',
            backgroundColor: '#2962FF',
            size: 11,
            borderRadius: 4,
          },
        },
      },
    },
    indicator: {
      lines: [
        { color: '#F7931A', size: 1, style: 'solid' },
        { color: '#2962FF', size: 1, style: 'solid' },
        { color: '#E040FB', size: 1, style: 'solid' },
        { color: '#26A69A', size: 1, style: 'solid' },
      ],
      tooltip: {
        text: {
          color: '#D1D4DC',
          size: 11,
          family: 'IBM Plex Mono, Menlo, monospace',
        },
      },
    },
    xAxis: {
      axisLine: { color: 'rgba(120, 123, 134, 0.35)' },
      tickText: { color: '#787B86', size: 11 },
    },
    yAxis: {
      axisLine: { color: 'rgba(120, 123, 134, 0.35)' },
      tickText: { color: '#787B86', size: 11 },
    },
    crosshair: {
      horizontal: {
        line: { color: '#787B86', size: 1 },
        text: { color: '#FFFFFF', backgroundColor: '#2A2E39' },
      },
      vertical: {
        line: { color: '#787B86', size: 1 },
        text: { color: '#FFFFFF', backgroundColor: '#2A2E39' },
      },
    },
    separator: {
      color: 'rgba(120, 123, 134, 0.25)',
      size: 1,
    },
  }
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
      const side = data.side === 'sell' ? 'sell' : 'buy'
      const color = data.color || (side === 'buy' ? '#F7931A' : '#9C27B0')
      const width = Math.max(34, Math.min(78, label.length * 9 + 14))
      const height = 20
      const gap = 10
      const rectX = point.x - width / 2
      const rectY = side === 'buy' ? point.y + gap : point.y - gap - height
      const stemEndY = side === 'buy' ? rectY : rectY + height
      const triangleBaseY = side === 'buy' ? rectY : rectY + height
      const triangleTipY = side === 'buy' ? point.y + 3 : point.y - 3

      return [
        {
          type: 'line',
          attrs: {
            coordinates: [
              { x: point.x, y: triangleTipY },
              { x: point.x, y: stemEndY },
            ],
          },
          styles: { color, size: 1 },
          ignoreEvent: true,
        },
        {
          type: 'polygon',
          attrs: {
            coordinates: [
              { x: point.x, y: triangleTipY },
              { x: point.x - 4, y: triangleBaseY },
              { x: point.x + 4, y: triangleBaseY },
            ],
          },
          styles: { color, borderColor: color },
          ignoreEvent: true,
        },
        {
          type: 'rect',
          attrs: { x: rectX, y: rectY, width, height },
          styles: {
            color,
            borderColor: 'rgba(255, 255, 255, 0.35)',
            borderRadius: 5,
          },
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
            color: '#FFFFFF',
            size: 10,
            weight: 700,
            family: 'IBM Plex Mono, Menlo, monospace',
          },
          ignoreEvent: true,
        },
      ]
    },
  })
  signalOverlayRegistered = true
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
  if (/^[\x00-\x7F]+$/.test(raw)) return raw.toUpperCase().slice(0, 4)
  return raw.slice(0, 3)
}

function createSignalOverlays(chart: Chart, data: KLineData[], signals: StrategySignal[]) {
  chart.removeOverlay({ groupId: SIGNAL_OVERLAY_GROUP })
  const dataByTimestamp = new Map(data.map(item => [item.timestamp, item]))
  signals.slice(-30).forEach(signal => {
    const timestamp = signalTimestamp(signal)
    const price = signalPrice(signal, dataByTimestamp)
    if (!timestamp || price === undefined) return
    const label = shortSignalLabel(signal.type)
    const side = isSellSignal(signal.type) && !isBuySignal(signal.type) ? 'sell' : 'buy'
    chart.createOverlay({
      name: SIGNAL_OVERLAY_NAME,
      groupId: SIGNAL_OVERLAY_GROUP,
      lock: true,
      points: [{ timestamp, value: price }],
      extendData: {
        label,
        side,
        color: side === 'buy' ? '#F7931A' : '#9C27B0',
      } satisfies SignalOverlayData,
    })
  })
}

function createLevelOverlays(chart: Chart, data: KLineData[], keyLevels: StrategyKeyLevel[]) {
  chart.removeOverlay({ groupId: LEVEL_OVERLAY_GROUP })
  const timestamp = data[data.length - 1]?.timestamp
  if (!timestamp) return
  keyLevels.slice(0, 8).forEach(level => {
    const value = numberValue(level.value)
    if (value === undefined) return
    chart.createOverlay({
      name: 'simpleTag',
      groupId: LEVEL_OVERLAY_GROUP,
      lock: true,
      points: [{ timestamp, value }],
      extendData: [level.name, value.toFixed(2)].filter(Boolean).join(' '),
      styles: {
        line: { color: 'rgba(41, 98, 255, 0.55)', size: 1 },
        text: {
          color: '#FFFFFF',
          backgroundColor: 'rgba(41, 98, 255, 0.78)',
          size: 10,
        },
      },
    })
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
      '沪深300',
    kind: shellTarget?.kind ?? inferredKind,
    freq: shellTarget?.freq ?? chartContext?.freq ?? 'daily',
  }
}

function availableFreqs(symbolData: WorkbenchSymbolData | null): string[] {
  const freqs = symbolData?.target?.available_freqs
  return Array.isArray(freqs) && freqs.length > 0 ? freqs : ['daily']
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

function readableTime(value?: Date | null, locale: LongclawLocale = 'zh-CN'): string {
  if (!value) return ''
  return value.toLocaleTimeString(locale === 'zh-CN' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function rowsFromCluster(value: unknown): Record<string, unknown>[] {
  const record = recordValue(value)
  const industryTop = recordValue(record.industry).top ?? record.industry_top
  const conceptTop = recordValue(record.concept).top ?? record.concept_top
  return [
    ...(Array.isArray(industryTop) ? industryTop : []),
    ...(Array.isArray(conceptTop) ? conceptTop : []),
  ].map(item => recordValue(item))
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

export function StrategyChartTerminal({
  locale,
  dashboard,
  signalsWebBaseUrl,
  onOpenRun,
  onOpenRecord,
}: StrategyChartTerminalProps) {
  const baseUrl = trimTrailingSlash(signalsWebBaseUrl) || urlFromDashboard(dashboard)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<Chart | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const activeRequestRef = useRef(0)
  const [shell, setShell] = useState<WorkbenchShell | null>(null)
  const [target, setTarget] = useState<ChartTarget>(() => initialTargetFrom(null, dashboard))
  const [symbolData, setSymbolData] = useState<WorkbenchSymbolData | null>(null)
  const [searchDraft, setSearchDraft] = useState(target.label)
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [bootAttempt, setBootAttempt] = useState(0)

  const klineData = useMemo(() => toKLineData(symbolData?.chart), [symbolData])
  const signals = useMemo(() => signalsFromSymbolData(symbolData), [symbolData])
  const keyLevels = useMemo(() => keyLevelsFromSymbolData(symbolData), [symbolData])
  const targetFreqs = useMemo(() => availableFreqs(symbolData), [symbolData])
  const connectorAlerts = useMemo(
    () =>
      dashboard.connector_health.filter(item => {
        const status = String(item.status ?? '').toLowerCase()
        return status && !['available', 'connected', 'open', 'ready', 'success'].includes(status)
      }).length,
    [dashboard.connector_health],
  )

  const shellBuyCandidates = Array.isArray(shell?.buy_candidates) ? shell.buy_candidates : []
  const buyRows = shellBuyCandidates.length > 0
    ? shellBuyCandidates
    : dashboard.buy_candidates as Array<Record<string, unknown>>
  const sellRows = dashboard.sell_warnings as Array<Record<string, unknown>>
  const indexTargets = shell?.indices ?? []
  const quickTargets = indexTargets.slice(0, 6)
  const clusterRows = rowsFromCluster(shell?.cluster_summary).slice(0, 6)
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

  const loadShell = useCallback(
    async (signal?: AbortSignal) => {
      if (!baseUrl) return null
      const nextShell = await fetchJson<WorkbenchShell>(baseUrl, '/api/workbench/shell', signal)
      setShell(nextShell)
      return nextShell
    },
    [baseUrl],
  )

  const loadSymbol = useCallback(
    async (nextTarget: ChartTarget, options: { signal?: AbortSignal; silent?: boolean } = {}) => {
      if (!baseUrl) return
      const requestId = activeRequestRef.current + 1
      activeRequestRef.current = requestId
      if (!options.silent) setLoading(true)
      setError(null)
      try {
        const nextSymbolData =
          nextTarget.kind === 'index'
            ? symbolDataFromIndexChart(
                nextTarget.label,
                nextTarget.freq || 'daily',
                await fetchJson<Record<string, unknown>>(
                  baseUrl,
                  `/api/chart/${encodeURIComponent(nextTarget.label)}?freq=${encodeURIComponent(nextTarget.freq || 'daily')}`,
                  options.signal,
                ),
              )
            : await fetchJson<WorkbenchSymbolData>(
                baseUrl,
                `/api/workbench/symbol/${encodeURIComponent(nextTarget.label)}?${new URLSearchParams({
                  kind: nextTarget.kind || 'auto',
                  freq: nextTarget.freq || 'daily',
                }).toString()}`,
                options.signal,
              )
        if (requestId !== activeRequestRef.current) return
        setSymbolData(nextSymbolData)
        setBooting(false)
        setBootAttempt(0)
        setLastUpdated(new Date())
        const effectiveTarget = nextSymbolData.target
        if (effectiveTarget) {
          setTarget(previous => {
            const effectiveKind = compactText(effectiveTarget.kind, previous.kind)
            return {
              label:
                effectiveKind === 'index'
                  ? previous.label
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
        if (requestId === activeRequestRef.current) setLoading(false)
      }
    },
    [baseUrl, locale],
  )

  useEffect(() => {
    setSearchDraft(target.label)
  }, [target.label])

  useEffect(() => {
    if (!baseUrl) return
    const controller = new AbortController()
    setShell(null)
    setSymbolData(null)
    setError(null)
    setBooting(false)
    setLoading(true)
    void (async () => {
      try {
        const nextShell = await loadShell(controller.signal)
        const nextTarget = initialTargetFrom(nextShell, dashboard)
        setTarget(nextTarget)
        setSearchDraft(nextTarget.label)
        await loadSymbol(nextTarget, { signal: controller.signal })
      } catch (rawError) {
        if (controller.signal.aborted) return
        const apiError = rawError as ApiError
        setError(apiError.message || (locale === 'zh-CN' ? 'Signals 终端初始化失败。' : 'Failed to initialize Signals terminal.'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [baseUrl, dashboard, loadShell, loadSymbol, locale])

  useEffect(() => {
    if (!baseUrl || !target.label) return
    const controller = new AbortController()
    const refreshMs = shouldUseLiveRefresh(shell?.session) ? 5_000 : 30_000
    const timer = window.setInterval(() => {
      void loadShell(controller.signal).catch(() => undefined)
      void loadSymbol(target, { signal: controller.signal, silent: true })
    }, refreshMs)
    return () => {
      controller.abort()
      window.clearInterval(timer)
    }
  }, [baseUrl, loadShell, loadSymbol, shell?.session, target])

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
    const chart = init(chartContainerRef.current, {
      locale: locale === 'zh-CN' ? 'zh-CN' : 'en-US',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      styles: chartStyles(),
    })
    if (!chart) return
    chartRef.current = chart
    chart.setBarSpace(8)
    chart.setOffsetRightDistance(36)
    chart.createIndicator('MA', true, { id: 'candle_pane' })
    chart.createIndicator('VOL')
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
    chart.setStyles(chartStyles())
    chart.setLocale(locale === 'zh-CN' ? 'zh-CN' : 'en-US')
  }, [locale])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay({ groupId: SIGNAL_OVERLAY_GROUP })
    chart.removeOverlay({ groupId: LEVEL_OVERLAY_GROUP })
    if (klineData.length === 0) {
      chart.clearData()
      return
    }
    chart.applyNewData(klineData)
    createSignalOverlays(chart, klineData, signals)
    createLevelOverlays(chart, klineData, keyLevels)
    chart.scrollToRealTime()
    chart.resize()
  }, [klineData, keyLevels, signals])

  const selectTarget = useCallback(
    (next: ChartTarget) => {
      setTarget(next)
      setSearchDraft(next.label)
      void loadSymbol(next)
    },
    [loadSymbol],
  )

  const submitSearch = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const value = searchDraft.trim()
      if (!value) return
      const isIndex = indexTargets.some(row => targetMatchesSearchValue(row, value)) || looksLikeIndexValue(value)
      selectTarget({ label: value, kind: isIndex ? 'index' : 'auto', freq: target.freq || 'daily' })
    },
    [indexTargets, searchDraft, selectTarget, target.freq],
  )

  const refreshNow = useCallback(() => {
    if (!target.label) return
    void loadShell().catch(() => undefined)
    void loadSymbol(target)
  }, [loadShell, loadSymbol, target])

  if (!baseUrl) {
    return (
      <div style={terminalRootStyle}>
        <div style={warningDarkStyle}>
          {locale === 'zh-CN'
            ? '没有配置 LONGCLAW_SIGNALS_WEB_BASE_URL，策略页只能展示降级摘要，无法直接承接实时 chart。'
            : 'LONGCLAW_SIGNALS_WEB_BASE_URL is not configured, so Strategy can only show a degraded summary instead of the live chart.'}
        </div>
        <div style={terminalGridStyle}>
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '买入候选' : 'Buy candidates'}
            rows={dashboard.buy_candidates as Array<Record<string, unknown>>}
            onOpen={item => onOpenRecord(`Buy ${String(item.symbol ?? 'candidate')}`, item)}
          />
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '卖出预警' : 'Sell warnings'}
            rows={dashboard.sell_warnings as Array<Record<string, unknown>>}
            onOpen={item => onOpenRecord(`Sell ${String(item.symbol ?? 'warning')}`, item)}
          />
          <FallbackList
            locale={locale}
            title={locale === 'zh-CN' ? '连接器' : 'Connectors'}
            rows={dashboard.connector_health as Array<Record<string, unknown>>}
            onOpen={item => onOpenRecord(`Connector ${String(item.connector_id ?? 'record')}`, item)}
          />
        </div>
      </div>
    )
  }

  return (
    <div style={terminalRootStyle}>
      <div style={terminalTopBarStyle}>
        <form style={searchFormStyle} onSubmit={submitSearch}>
          <input
            aria-label={locale === 'zh-CN' ? '搜索标的' : 'Search symbol'}
            style={searchInputStyle}
            value={searchDraft}
            placeholder={locale === 'zh-CN' ? '输入指数 / 行业 / 股票代码或名称' : 'Index, sector, ticker, or name'}
            onChange={event => setSearchDraft(event.target.value)}
          />
          <button type="submit" style={terminalButtonStyle(false)}>
            {locale === 'zh-CN' ? '切换' : 'Switch'}
          </button>
        </form>
        <div style={chartMetaRowStyle}>
          {FREQ_OPTIONS.map(freq => {
            const active = currentFreq === freq
            const disabled = !targetFreqs.includes(freq)
            return (
              <button
                key={freq}
                type="button"
                style={terminalButtonStyle(active, disabled)}
                disabled={disabled}
                onClick={() => selectTarget({ ...target, freq })}
              >
                {freq}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          style={terminalButtonStyle(false, loading)}
          disabled={loading}
          onClick={refreshNow}
        >
          {loading ? (locale === 'zh-CN' ? '刷新中' : 'Refreshing') : (locale === 'zh-CN' ? '刷新' : 'Refresh')}
        </button>
      </div>

      {shell?.notices?.length ? (
        <div style={noticeDarkStyle}>{shell.notices.join(' ')}</div>
      ) : null}
      {error ? (
        <div style={booting ? warningDarkStyle : errorDarkStyle}>{error}</div>
      ) : null}

      <div style={terminalGridStyle}>
        <div style={terminalSideStyle}>
          <Panel
            title={locale === 'zh-CN' ? '主观察列表' : 'Watchlist'}
            meta={marketLabel(shell?.session, locale)}
          >
            <div style={compactListStyle}>
              {quickTargets.length === 0 ? (
                <div style={emptyStateDarkStyle}>
                  {locale === 'zh-CN' ? '等待 Signals shell。' : 'Waiting for Signals shell.'}
                </div>
              ) : (
                quickTargets.map(row => {
                  const label = labelForTarget(row)
                  if (!label) return null
                  const active = label === target.label
                  return (
                    <button
                      key={label}
                      type="button"
                      style={active ? quickChipActiveStyle : quickChipStyle}
                      onClick={() => selectTarget({ label, kind: 'index', freq: target.freq })}
                    >
                      {label}
                    </button>
                  )
                })
              )}
            </div>
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '买入候选' : 'Buy candidates'}
            meta={String(buyRows.length)}
          >
            <TargetRows
              rows={buyRows}
              emptyText={locale === 'zh-CN' ? '暂无买入候选。' : 'No buy candidates.'}
              onSelect={row => {
                const label = labelForTarget(row)
                if (label) selectTarget({ label, kind: kindForTarget(row, 'stock'), freq: target.freq })
              }}
            />
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '卖出预警' : 'Sell warnings'}
            meta={String(sellRows.length)}
          >
            <TargetRows
              rows={sellRows}
              emptyText={locale === 'zh-CN' ? '暂无卖出预警。' : 'No sell warnings.'}
              onSelect={row => {
                const label = labelForTarget(row)
                if (label) selectTarget({ label, kind: kindForTarget(row, 'stock'), freq: target.freq })
              }}
            />
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '行业 / 概念' : 'Sectors'}
            meta={clusterRows.length ? 'web2' : ''}
          >
            <TargetRows
              rows={clusterRows}
              emptyText={locale === 'zh-CN' ? '暂无聚类方向。' : 'No cluster directions.'}
              onSelect={row => {
                const label = labelForTarget(row)
                if (label) selectTarget({ label, kind: 'industry', freq: 'daily' })
              }}
            />
          </Panel>
        </div>

        <div style={chartStageStyle}>
          <div style={chartHeaderStyle}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div style={eyebrowDarkStyle}>
                {compactText(symbolData?.target?.kind, target.kind).toUpperCase()}
              </div>
              <div style={chartTitleStyle}>{summaryTitle}</div>
              <div style={mutedTextStyle}>
                {[summarySubtitle, currentFreq, latestSignal || undefined].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <span style={statusBadgeStyle(booting ? 'warning' : loading ? 'running' : 'open')}>
                {booting
                  ? (locale === 'zh-CN' ? '启动中' : 'Booting')
                  : loading
                    ? (locale === 'zh-CN' ? '刷新中' : 'Refreshing')
                    : marketLabel(shell?.session, locale)}
              </span>
              <div style={mutedTextStyle}>
                {lastUpdated
                  ? `${locale === 'zh-CN' ? '更新' : 'Updated'} ${readableTime(lastUpdated, locale)}`
                  : (locale === 'zh-CN' ? '等待数据' : 'Waiting for data')}
              </div>
            </div>
          </div>

          <div style={statGridStyle}>
            <StatTile
              label={locale === 'zh-CN' ? '最新价' : 'Last'}
              value={formatNumber(symbolData?.summary?.latest_price ?? latestClose(klineData))}
            />
            <StatTile
              label={locale === 'zh-CN' ? '信号' : 'Signal'}
              value={latestSignal || 'N/A'}
            />
            <StatTile
              label={locale === 'zh-CN' ? '涨幅' : 'Change'}
              value={formatPercent(symbolData?.summary?.gain_pct)}
            />
          </div>

          {symbolData?.summary?.conclusion ? (
            <div style={noticeDarkStyle}>{String(symbolData.summary.conclusion)}</div>
          ) : null}

          <div style={chartCanvasShellStyle}>
            <div ref={chartContainerRef} style={chartCanvasStyle} />
            {klineData.length === 0 ? (
              <div style={chartOverlayMessageStyle}>
                {loading || booting
                  ? (locale === 'zh-CN' ? '正在等待 Signals 输出 K 线和买卖点。' : 'Waiting for Signals to provide candles and signals.')
                  : (locale === 'zh-CN' ? '当前标的没有可用 OHLCV。' : 'No OHLCV is available for this target.')}
              </div>
            ) : null}
          </div>
        </div>

        <div style={terminalSideStyle}>
          <Panel
            title={locale === 'zh-CN' ? '买卖点' : 'Signals'}
            meta={String(signals.length)}
          >
            {signals.length === 0 ? (
              <div style={emptyStateDarkStyle}>
                {locale === 'zh-CN' ? '当前标的暂无信号。' : 'No signals for this target.'}
              </div>
            ) : (
              <div style={compactListStyle}>
                {signals.slice(-9).reverse().map((signal, index) => (
                  <div key={`${signal.dt ?? signal.time ?? index}-${signal.type ?? 'signal'}`} style={signalRowStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={statusBadgeStyle(signalTone(signal.type))}>
                          {signal.type || 'Signal'}
                        </span>
                        <span style={monoTextStyle}>{formatNumber(signal.price)}</span>
                      </div>
                      <div style={mutedTextStyle}>
                        {[signal.freq, signal.date_str, signal.confidence !== undefined ? `conf ${formatNumber(signal.confidence, 2)}` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '关键位' : 'Key levels'}
            meta={String(keyLevels.length)}
          >
            {keyLevels.length === 0 ? (
              <div style={emptyStateDarkStyle}>
                {locale === 'zh-CN' ? '暂无关键位。' : 'No key levels.'}
              </div>
            ) : (
              <div style={compactListStyle}>
                {keyLevels.slice(0, 8).map(level => (
                  <div key={`${level.name ?? 'level'}-${level.value ?? ''}`} style={dataRowStyle}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                      <div style={rowTitleStyle}>{level.name || 'Level'}</div>
                      <div style={mutedTextStyle}>
                        {[level.position, level.distance_pct !== undefined ? formatPercent(level.distance_pct) : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div style={monoTextStyle}>{formatNumber(level.value)}</div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '图表侧边 Review' : 'Chart-side review'}
            meta={String(dashboard.review_runs.length)}
          >
            {dashboard.review_runs.length === 0 ? (
              <div style={emptyStateDarkStyle}>
                {locale === 'zh-CN' ? '暂无 review run。' : 'No review runs.'}
              </div>
            ) : (
              <div style={compactListStyle}>
                {dashboard.review_runs.slice(0, 4).map(run => (
                  <button
                    key={run.run_id}
                    type="button"
                    style={targetButtonStyle}
                    onClick={() => {
                      void onOpenRun(run as LongclawRun)
                    }}
                  >
                    <div style={rowTitleStyle}>
                      {run.summary || run.run_id}
                    </div>
                    <div style={mutedTextStyle}>{run.status}</div>
                  </button>
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title={locale === 'zh-CN' ? '连接状态' : 'Connectors'}
            meta={connectorAlerts > 0 ? String(connectorAlerts) : (locale === 'zh-CN' ? '正常' : 'OK')}
          >
            <div style={compactListStyle}>
              {dashboard.connector_health.slice(0, 3).map(item => (
                <div key={String(item.connector_id ?? item.label ?? 'connector')} style={dataRowStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <div style={rowTitleStyle}>
                      {String(item.connector_id ?? item.label ?? 'connector')}
                    </div>
                    <div style={mutedTextStyle}>{String(item.summary ?? '')}</div>
                  </div>
                  <span style={statusBadgeStyle(String(item.status ?? 'open'))}>
                    {humanizeTokenLocale(locale, String(item.status ?? 'open'))}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
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
    <div style={terminalPanelStyle}>
      <div style={panelHeaderStyle}>
        <div style={panelTitleStyle}>{title}</div>
        {meta ? <div style={mutedTextStyle}>{meta}</div> : null}
      </div>
      {children}
    </div>
  )
}

function TargetRows({
  rows,
  emptyText,
  onSelect,
}: {
  rows: Record<string, unknown>[]
  emptyText: string
  onSelect: (row: Record<string, unknown>) => void
}) {
  if (rows.length === 0) {
    return <div style={emptyStateDarkStyle}>{emptyText}</div>
  }
  return (
    <div style={compactListStyle}>
      {rows.slice(0, 8).map((row, index) => {
        const label = labelForTarget(row)
        return (
          <button
            key={`${label || 'target'}-${index}`}
            type="button"
            style={targetButtonStyle}
            onClick={() => onSelect(row)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={rowTitleStyle}>
                {compactText(row.name) || label || 'N/A'}
              </div>
              <div style={monoTextStyle}>
                {compactText(row.fused_total) || compactText(row.total_score) || compactText(row.score)}
              </div>
            </div>
            <div style={mutedTextStyle}>
              {[compactText(row.symbol) || compactText(row.code), compactText(row.direction), compactText(row.reason)]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={statTileStyle}>
      <div style={eyebrowDarkStyle}>{label}</div>
      <div style={{ color: '#F2F6FB', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </div>
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
                {compactText(row.name) || compactText(row.symbol) || compactText(row.connector_id) || 'N/A'}
              </div>
              <div style={mutedTextStyle}>
                {[compactText(row.status), compactText(row.direction), compactText(row.summary)]
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
