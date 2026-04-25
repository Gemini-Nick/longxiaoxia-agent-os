import React, { useEffect, useMemo, useState } from 'react'

import type {
  LongclawCapabilityEntry,
  LongclawCapabilitySubstrateSummary,
} from '../../../../src/services/longclawControlPlane/models.js'
import type { PluginDevIssue } from '../../runtime/wechatPluginDev.js'
import {
  chromeStyles,
  palette,
  secondaryButtonStyle,
  segmentedButtonStyle,
  statusBadgeStyle,
  surfaceStyles,
  utilityStyles,
} from '../designSystem.js'
import { type LongclawLocale, humanizeTokenLocale, t, tf } from '../i18n.js'
import { Section, StatusStrip } from './shared.js'

export type WorkMode = 'local' | 'cloud_sandbox' | 'weclaw_dispatch'
export type LocalRuntimeSeatPreference = 'auto' | 'force_acp' | 'force_local_runtime_api'
export type CapabilitySourceBucket =
  | 'runtime-managed'
  | 'agents'
  | 'claude'
  | 'codex'
  | 'workspace-repos'
  | 'other'

export type CapabilityItem = {
  id: string
  label: string
  kind: 'pack' | 'skill' | 'plugin'
  mention: string
  hint: string
  description: string
}

export type AgentModeInfo = { mode: string; alive: boolean }

export type SidebarStatusItem = {
  id: string
  label: string
  meta?: string
  status: string
}

export type RuntimeStatusSummary = {
  longclawCoreConnected: boolean
  longclawCoreBaseUrl?: string
  dueDiligenceConnected: boolean
  dueDiligenceBaseUrl?: string
  signalsAvailable: boolean
  signalsStateRoot?: string
  signalsWebBaseUrl?: string
  signalsWeb2BaseUrl?: string
  localRuntimeSeat?: string
  localRuntimeAvailable: boolean
  localRuntimeApiUrl?: string
  localRuntimeApiAvailable: boolean
  localAcpAvailable: boolean
  localAcpScript?: string
  localAcpSource?: string
  localRuntimeSeatPreference: LocalRuntimeSeatPreference
  localRuntimeSeatOverrideActive: boolean
  devMachineAcpTakeover: boolean
  runtimeProfile?: string
  stackEnvLoaded: boolean
  stackEnvPath?: string
}

export type CapabilityManagerSettings = {
  disabled_capabilities: string[]
  capability_groups: Record<string, string>
  extra_skill_roots: string[]
  extra_plugin_roots: string[]
}

export type RuntimeCapabilityRegistryEntry = {
  registry_id: string
  kind: 'skill' | 'plugin'
  label: string
  source_path: string
  managed_path: string
  source: string
  installed_at: string
  removable: boolean
  health: string
  metadata: Record<string, unknown>
}

export type CapabilityRegistryOperation =
  | { type: 'refresh' }
  | { type: 'register'; kind: 'skill' | 'plugin'; sourcePath: string }
  | { type: 'remove'; registryId: string }

export type CapabilitySummaryItem = {
  label: string
  value: number
  tone?: string
}

export type WorkModeSpec = {
  label: string
  eyebrow: string
  detail: string
  runtimeTarget: string
  modelPlane: string
  interactionSurface: string
  workspaceHint: string
}

export type ModePostureItem = {
  mode: WorkMode
  spec: WorkModeSpec
  capabilities: CapabilityItem[]
}

export type CapabilitySkillGroup = {
  group: string
  items: LongclawCapabilityEntry[]
}

export type CapabilitiesWorkspaceProps = {
  locale: LongclawLocale
  capabilitySummaryItems: CapabilitySummaryItem[]
  modePosture: ModePostureItem[]
  sidebarStatusItems: SidebarStatusItem[]
  runtimeStatus: RuntimeStatusSummary
  selectedWorkMode: WorkMode
  selectedModeSpec: Pick<WorkModeSpec, 'label'>
  localSeatPreference: LocalRuntimeSeatPreference
  launchBusy: boolean
  agentMode: AgentModeInfo | null
  agentCwd?: string | null
  substrateSummary: LongclawCapabilitySubstrateSummary | null
  managedSkillEntries: LongclawCapabilityEntry[]
  capabilitySkillGroups: CapabilitySkillGroup[]
  managedPluginEntries: LongclawCapabilityEntry[]
  managedRegistryEntries: RuntimeCapabilityRegistryEntry[]
  pluginDevIssues: PluginDevIssue[]
  capabilityManagerSettings: CapabilityManagerSettings
  managedSkillPathDraft: string
  onManagedSkillPathDraftChange: (value: string) => void
  managedPluginPathDraft: string
  onManagedPluginPathDraftChange: (value: string) => void
  extraSkillRootDraft: string
  onExtraSkillRootDraftChange: (value: string) => void
  extraPluginRootDraft: string
  onExtraPluginRootDraftChange: (value: string) => void
  useCapability: (item: CapabilityItem) => void
  syncCapabilityRegistry: (operation: CapabilityRegistryOperation) => void
  updateCapabilityGroup: (entry: LongclawCapabilityEntry, group: string) => void
  toggleCapabilityVisibility: (entry: LongclawCapabilityEntry) => void
  openCapabilityLocalPath: (targetPath?: string) => void | Promise<void>
  copyCapabilityMention: (mention: string) => void | Promise<void>
  addDiscoveryRoot: (kind: 'skill' | 'plugin') => void
  removeDiscoveryRoot: (kind: 'skill' | 'plugin', root: string) => void
  openPluginDevIssue: (issue: PluginDevIssue) => void | Promise<void>
  startPluginDevIssue: (issueId: string) => void | Promise<void>
  runPluginDevIssueCi: (issueId: string) => void | Promise<void>
  mergePluginDevIssue: (issueId: string) => void | Promise<void>
  registerPluginDevIssue: (issueId: string) => void | Promise<void>
}

type PluginBucketView = {
  key: CapabilitySourceBucket
  label: string
  subtitle: string
  items: LongclawCapabilityEntry[]
  totalCount: number
  disabledCount: number
  attentionCount: number
  managedCount: number
  currentWorkspaceCount: number
  tone: string
  defaultExpanded: boolean
}

const studioGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
  gap: 12,
}

const studioGroupStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const studioGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: palette.panel,
  border: `1px solid ${palette.border}`,
}

const studioGroupHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  gap: 10,
}

const managerCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 10,
  borderRadius: 8,
  border: `1px solid ${palette.border}`,
  background: palette.panelRaised,
}

const managerRowMetaStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.5,
  wordBreak: 'break-all',
}

const managerActionsRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
}

const capabilityDetailsStyle: React.CSSProperties = {
  width: '100%',
}

const capabilitySummaryStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  display: 'inline-flex',
  listStyle: 'none',
  cursor: 'pointer',
}

const managerInputStyle: React.CSSProperties = {
  minWidth: 180,
  flex: '1 1 220px',
  borderRadius: 12,
  border: `1px solid ${palette.borderStrong}`,
  background: palette.panel,
  color: palette.ink,
  padding: '10px 12px',
  fontSize: 13,
  lineHeight: 1.4,
  outline: 'none',
}

const modePostureGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 12,
}

const modePostureCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 14,
  borderRadius: 16,
  background: palette.panel,
  border: `1px solid ${palette.border}`,
}

const modeCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 10,
}

const modeCardTitleStyle: React.CSSProperties = {
  color: palette.ink,
  fontSize: 16,
  lineHeight: 1.3,
  fontWeight: 600,
}

const queueRowLeadStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
  flex: 1,
}

const queueRowTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.3,
  color: palette.ink,
}

const queueRowDescriptionStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 13,
  lineHeight: 1.5,
}

const capabilityRailStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 10,
}

function capabilityChipStyle(kind: CapabilityItem['kind']): React.CSSProperties {
  return {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    padding: '12px 14px',
    borderRadius: 14,
    border: `1px solid ${kind === 'pack' ? 'rgba(44, 122, 120, 0.22)' : palette.border}`,
    background: kind === 'pack' ? 'rgba(44, 122, 120, 0.08)' : palette.panel,
    color: palette.ink,
    cursor: 'pointer',
    textAlign: 'left',
  }
}

const capabilityChipBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
}

const capabilityChipLabelStyle: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 600,
  color: palette.ink,
}

const capabilityChipHintStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.4,
}

const accordionStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

function accordionButtonStyle(expanded: boolean): React.CSSProperties {
  return {
    ...surfaceStyles.listRow,
    ...surfaceStyles.listRowInteractive,
    cursor: 'pointer',
    background: expanded ? 'rgba(184, 100, 59, 0.08)' : palette.panel,
    borderColor: expanded ? 'rgba(184, 100, 59, 0.28)' : palette.border,
  }
}

const accordionTailStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
  flexShrink: 0,
}

const accordionBadgeRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: 8,
}

const accordionPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 10,
  paddingTop: 10,
  borderTop: `1px solid ${palette.border}`,
}

const bucketCardStyle: React.CSSProperties = {
  ...studioGroupStyle,
  gap: 0,
}

const pluginMetaLineStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  alignItems: 'center',
}

const monoPathStyle: React.CSSProperties = {
  ...chromeStyles.monoMeta,
  wordBreak: 'break-all',
}

const sectionSpacerStyle: React.CSSProperties = {
  marginTop: 12,
}

const bucketOrder: CapabilitySourceBucket[] = [
  'runtime-managed',
  'agents',
  'claude',
  'codex',
  'workspace-repos',
  'other',
]

function formatModeMeta(parts: Array<string | undefined>): string | undefined {
  const values = parts.filter((part): part is string => Boolean(part && part.trim()))
  return values.length > 0 ? values.join(' · ') : undefined
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

function readMetadataBoolean(
  value: { metadata?: Record<string, unknown> } | Record<string, unknown> | null | undefined,
  key: string,
): boolean | undefined {
  if (!value) return undefined
  const record = value as Record<string, unknown>
  const direct = record[key]
  if (typeof direct === 'boolean') return direct
  const metadata = record.metadata
  if (metadata && typeof metadata === 'object') {
    const nested = (metadata as Record<string, unknown>)[key]
    if (typeof nested === 'boolean') return nested
  }
  return undefined
}

function capabilityDisabled(entry: LongclawCapabilityEntry): boolean {
  return Boolean(readMetadataBoolean(entry, 'disabled'))
}

function capabilityGroup(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'group')
}

function capabilityPath(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'path')
}

function capabilityConfigPath(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'config_path')
}

function capabilityManaged(entry: LongclawCapabilityEntry): boolean {
  return Boolean(readMetadataBoolean(entry, 'managed'))
}

function capabilityRegistryId(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'registry_id')
}

function capabilityHealth(entry: LongclawCapabilityEntry): string | undefined {
  return readMetadataString(entry, 'health')
}

function capabilityToItem(entry: LongclawCapabilityEntry): CapabilityItem {
  return {
    id: entry.capability_id,
    label: entry.label,
    kind: entry.kind,
    mention: entry.mention,
    hint: entry.summary,
    description: entry.description,
  }
}

function normalizePath(value?: string | null): string | null {
  if (!value) return null
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalized || null
}

function pathMatchesSegment(path: string | null, segment: string): boolean {
  if (!path) return false
  return path.includes(`/${segment}/`) || path.endsWith(`/${segment}`)
}

function isPathInside(path: string | null, root: string | null): boolean {
  if (!path || !root) return false
  return path === root || path.startsWith(`${root}/`)
}

function capabilityLooksHealthy(status?: string | null): boolean {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return true
  return ['open', 'ok', 'active', 'running', 'ready', 'success', 'succeeded', 'info'].includes(
    normalized,
  )
}

function capabilityNeedsAttention(entry: LongclawCapabilityEntry): boolean {
  if (capabilityDisabled(entry)) return false
  return !capabilityLooksHealthy(capabilityHealth(entry))
}

function capabilityTone(entry: LongclawCapabilityEntry): string {
  if (capabilityDisabled(entry)) return 'degraded'
  return capabilityHealth(entry) ?? 'open'
}

function preferredCapabilityPath(
  entry: LongclawCapabilityEntry,
  registryById: Map<string, RuntimeCapabilityRegistryEntry>,
): string | undefined {
  const registryId = capabilityRegistryId(entry)
  if (registryId && registryById.has(registryId)) {
    return (
      registryById.get(registryId)?.source_path ??
      registryById.get(registryId)?.managed_path ??
      capabilityPath(entry) ??
      capabilityConfigPath(entry) ??
      readMetadataString(entry, 'source_path')
    )
  }
  return (
    capabilityPath(entry) ??
    capabilityConfigPath(entry) ??
    readMetadataString(entry, 'source_path') ??
    readMetadataString(entry, 'managed_path')
  )
}

function classifyPluginBucket(
  entry: LongclawCapabilityEntry,
  registryById: Map<string, RuntimeCapabilityRegistryEntry>,
  currentWorkspaceRoot: string | null,
): CapabilitySourceBucket {
  const resolvedPath = normalizePath(preferredCapabilityPath(entry, registryById))
  if (
    capabilityManaged(entry) ||
    Boolean(capabilityRegistryId(entry)) ||
    pathMatchesSegment(resolvedPath, '.longclaw/runtime-v2/capabilities')
  ) {
    return 'runtime-managed'
  }
  if (pathMatchesSegment(resolvedPath, '.agents')) return 'agents'
  if (pathMatchesSegment(resolvedPath, '.claude')) return 'claude'
  if (pathMatchesSegment(resolvedPath, '.codex')) return 'codex'
  if (isPathInside(resolvedPath, currentWorkspaceRoot)) return 'workspace-repos'
  return 'other'
}

function bucketLabel(locale: LongclawLocale, bucket: CapabilitySourceBucket): string {
  if (bucket === 'runtime-managed') {
    return locale === 'zh-CN' ? '运行时托管' : 'Runtime-managed'
  }
  if (bucket === 'agents') return '~/.agents'
  if (bucket === 'claude') return '~/.claude'
  if (bucket === 'codex') return '~/.codex'
  if (bucket === 'workspace-repos') return locale === 'zh-CN' ? '工作区' : 'Workspace repos'
  return locale === 'zh-CN' ? '其他来源' : 'Other sources'
}

function bucketSubtitle(
  locale: LongclawLocale,
  bucket: CapabilitySourceBucket,
  currentWorkspaceRoot: string | null,
): string {
  if (bucket === 'runtime-managed') {
    return locale === 'zh-CN'
      ? '运行时托管的插件。'
      : 'Plugins installed into the runtime overlay. Overlay removal stays available.'
  }
  if (bucket === 'agents') {
    return locale === 'zh-CN' ? '来自 ~/.agents。' : 'Plugins discovered from ~/.agents.'
  }
  if (bucket === 'claude') {
    return locale === 'zh-CN' ? '来自 ~/.claude。' : 'Plugins discovered from ~/.claude.'
  }
  if (bucket === 'codex') {
    return locale === 'zh-CN' ? '来自 ~/.codex。' : 'Plugins discovered from ~/.codex.'
  }
  if (bucket === 'workspace-repos') {
    return currentWorkspaceRoot
      ? currentWorkspaceRoot
      : locale === 'zh-CN'
        ? '当前工作区。'
        : 'Plugins discovered inside the current workspace.'
  }
  return locale === 'zh-CN'
    ? '未归类来源。'
    : 'Plugins that do not fall into a known source root.'
}

function localSeatPreferenceLabel(
  locale: LongclawLocale,
  preference: LocalRuntimeSeatPreference,
): string {
  if (preference === 'force_acp') return t(locale, 'seat_pref.force_acp')
  if (preference === 'force_local_runtime_api') {
    return t(locale, 'seat_pref.force_local_runtime_api')
  }
  return t(locale, 'seat_pref.auto')
}

function effectiveLocalRuntimeSeat(
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference,
): string {
  if (localSeatPreference === 'force_acp') {
    return runtimeStatus.localAcpAvailable ? 'acp_bridge' : 'unavailable'
  }
  if (localSeatPreference === 'force_local_runtime_api') {
    return runtimeStatus.localRuntimeApiAvailable ? 'local_runtime_api' : 'unavailable'
  }
  return runtimeStatus.localRuntimeSeat ?? 'unavailable'
}

function workModeAvailabilityNotice(
  locale: LongclawLocale,
  workMode: WorkMode,
  runtimeStatus: RuntimeStatusSummary,
  localSeatPreference: LocalRuntimeSeatPreference = runtimeStatus.localRuntimeSeatPreference,
): string | undefined {
  if (
    workMode === 'local' &&
    effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference) === 'unavailable'
  ) {
    return t(locale, 'notice.local_unavailable')
  }
  if (workMode === 'cloud_sandbox' && !runtimeStatus.longclawCoreConnected) {
    return t(locale, 'notice.cloud_unavailable')
  }
  if (
    workMode === 'weclaw_dispatch' &&
    (!runtimeStatus.longclawCoreConnected ||
      effectiveLocalRuntimeSeat(runtimeStatus, localSeatPreference) === 'unavailable')
  ) {
    return t(locale, 'notice.weclaw_unavailable')
  }
  return undefined
}

function workModeAvailabilityState(
  locale: LongclawLocale,
  workMode: WorkMode,
  runtimeStatus: RuntimeStatusSummary,
  selected: boolean,
  localSeatPreference: LocalRuntimeSeatPreference = runtimeStatus.localRuntimeSeatPreference,
): { tone: string; label: string } {
  const unavailable = workModeAvailabilityNotice(
    locale,
    workMode,
    runtimeStatus,
    localSeatPreference,
  )
  if (unavailable) {
    return {
      tone: 'degraded',
      label: workMode === 'local' ? t(locale, 'state.unavailable') : t(locale, 'state.degraded'),
    }
  }
  if (selected) return { tone: 'running', label: t(locale, 'state.ready') }
  return { tone: 'open', label: t(locale, 'state.visible') }
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function attentionBadgeText(locale: LongclawLocale, count: number): string {
  return locale === 'zh-CN' ? `${count} 需关注` : `${count} needs attention`
}

function hiddenBadgeText(locale: LongclawLocale, count: number): string {
  return locale === 'zh-CN' ? `${count} 已隐藏` : `${count} hidden`
}

function overlayBadgeText(locale: LongclawLocale, count: number): string {
  return locale === 'zh-CN' ? `${count} 托管` : `${count} overlay`
}

function workspaceBadgeText(locale: LongclawLocale, count: number): string {
  return locale === 'zh-CN' ? `${count} 当前工作区` : `${count} workspace`
}

function CapabilitiesChip({
  locale,
  item,
  onUse,
}: {
  locale: LongclawLocale
  item: CapabilityItem
  onUse: (item: CapabilityItem) => void
}) {
  return (
    <button type="button" style={capabilityChipStyle(item.kind)} onClick={() => onUse(item)}>
      <div style={capabilityChipBodyStyle}>
        <div style={capabilityChipLabelStyle}>{item.label}</div>
        <div style={capabilityChipHintStyle}>{item.hint || item.description || item.mention}</div>
      </div>
      <span style={statusBadgeStyle(item.kind === 'pack' ? 'running' : 'open')}>
        {humanizeTokenLocale(locale, item.kind)}
      </span>
    </button>
  )
}

function buildPluginBuckets(
  locale: LongclawLocale,
  entries: LongclawCapabilityEntry[],
  registryEntries: RuntimeCapabilityRegistryEntry[],
  currentWorkspaceRoot: string | null,
): PluginBucketView[] {
  const registryById = new Map(registryEntries.map(entry => [entry.registry_id, entry]))
  const buckets = new Map<CapabilitySourceBucket, LongclawCapabilityEntry[]>()
  for (const key of bucketOrder) buckets.set(key, [])

  for (const entry of entries) {
    buckets.get(classifyPluginBucket(entry, registryById, currentWorkspaceRoot))?.push(entry)
  }

  return bucketOrder
    .map(key => {
      const items = [...(buckets.get(key) ?? [])].sort((left, right) =>
        left.label.localeCompare(right.label),
      )
      if (items.length === 0) return null
      const disabledCount = items.filter(capabilityDisabled).length
      const attentionCount = items.filter(capabilityNeedsAttention).length
      const managedCount = items.filter(capabilityManaged).length
      const currentWorkspaceCount = items.filter(item =>
        isPathInside(
          normalizePath(preferredCapabilityPath(item, registryById)),
          currentWorkspaceRoot,
        ),
      ).length
      return {
        key,
        label: bucketLabel(locale, key),
        subtitle: bucketSubtitle(locale, key, currentWorkspaceRoot),
        items,
        totalCount: items.length,
        disabledCount,
        attentionCount,
        managedCount,
        currentWorkspaceCount,
        tone: attentionCount > 0 || disabledCount > 0 ? 'degraded' : 'open',
        defaultExpanded: key === 'runtime-managed' || attentionCount > 0 || disabledCount > 0,
      } satisfies PluginBucketView
    })
    .filter((bucket): bucket is PluginBucketView => bucket !== null)
}

function CapabilityRow({
  locale,
  entry,
  kind,
  registryById,
  updateCapabilityGroup,
  useCapability,
  copyCapabilityMention,
  openCapabilityLocalPath,
  toggleCapabilityVisibility,
  syncCapabilityRegistry,
}: {
  locale: LongclawLocale
  entry: LongclawCapabilityEntry
  kind: 'skill' | 'plugin'
  registryById: Map<string, RuntimeCapabilityRegistryEntry>
  updateCapabilityGroup: (entry: LongclawCapabilityEntry, group: string) => void
  useCapability: (item: CapabilityItem) => void
  copyCapabilityMention: (mention: string) => void | Promise<void>
  openCapabilityLocalPath: (targetPath?: string) => void | Promise<void>
  toggleCapabilityVisibility: (entry: LongclawCapabilityEntry) => void
  syncCapabilityRegistry: (operation: CapabilityRegistryOperation) => void
}) {
  const registryId = capabilityRegistryId(entry)
  const registryEntry = registryId ? registryById.get(registryId) : undefined
  const sourcePath = registryEntry?.source_path ?? preferredCapabilityPath(entry, registryById)
  const pathMeta = formatModeMeta([
    entry.mention,
    capabilityGroup(entry) ? `${locale === 'zh-CN' ? '分组' : 'Group'}: ${capabilityGroup(entry)}` : undefined,
  ])

  return (
    <div style={managerCardStyle}>
      <div style={queueRowLeadStyle}>
        <div style={queueRowTitleStyle}>{entry.label}</div>
        {pathMeta && <div style={managerRowMetaStyle}>{pathMeta}</div>}
        <div style={pluginMetaLineStyle}>
          <span style={statusBadgeStyle(capabilityTone(entry))}>
            {humanizeTokenLocale(locale, capabilityTone(entry))}
          </span>
          {capabilityManaged(entry) && (
            <span style={statusBadgeStyle('running')}>
              {locale === 'zh-CN' ? '托管' : 'runtime-managed'}
            </span>
          )}
        </div>
      </div>
      <div style={managerActionsRowStyle}>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => useCapability(capabilityToItem(entry))}
        >
          {t(locale, 'action.use_in_tasks')}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            void copyCapabilityMention(entry.mention)
          }}
        >
          {t(locale, 'action.copy_mention')}
        </button>
        <details style={capabilityDetailsStyle}>
          <summary style={capabilitySummaryStyle}>{locale === 'zh-CN' ? '更多' : 'More'}</summary>
          <div style={{ ...managerActionsRowStyle, marginTop: 8 }}>
            <input
              key={`${entry.capability_id}:${capabilityGroup(entry) ?? ''}`}
              defaultValue={capabilityGroup(entry) ?? ''}
              placeholder={t(locale, 'action.set_group')}
              style={managerInputStyle}
              onBlur={event => updateCapabilityGroup(entry, event.target.value)}
            />
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                void openCapabilityLocalPath(capabilityConfigPath(entry) ?? capabilityPath(entry))
              }}
            >
              {t(locale, 'action.open_config')}
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => {
                void openCapabilityLocalPath(sourcePath ?? capabilityPath(entry))
              }}
            >
              {t(locale, 'action.open_source')}
            </button>
            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={() => toggleCapabilityVisibility(entry)}
            >
              {capabilityDisabled(entry)
                ? t(locale, 'action.enable_capability')
                : t(locale, 'action.disable_capability')}
            </button>
            {capabilityManaged(entry) && capabilityRegistryId(entry) && (
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  void syncCapabilityRegistry({
                    type: 'remove',
                    registryId: capabilityRegistryId(entry)!,
                  })
                }}
              >
                {locale === 'zh-CN' ? '移除托管' : 'Remove overlay'}
              </button>
            )}
            {sourcePath && <div style={monoPathStyle}>{sourcePath}</div>}
          </div>
        </details>
      </div>
    </div>
  )
}

function PluginDevIssueRow({
  locale,
  issue,
  onOpen,
  onStart,
  onRunCi,
  onMerge,
  onRegister,
}: {
  locale: LongclawLocale
  issue: PluginDevIssue
  onOpen: (issue: PluginDevIssue) => void | Promise<void>
  onStart: (issueId: string) => void | Promise<void>
  onRunCi: (issueId: string) => void | Promise<void>
  onMerge: (issueId: string) => void | Promise<void>
  onRegister: (issueId: string) => void | Promise<void>
}) {
  const canStart = issue.status === 'issue_created'
  const canCi = issue.status === 'branch_created' || issue.status === 'implementing'
  const canMerge = issue.status === 'mr_ready'
  const canRegister = issue.status === 'merged'

  return (
    <div style={managerCardStyle}>
      <div style={queueRowLeadStyle}>
        <div style={queueRowTitleStyle}>{issue.title}</div>
        <div style={managerRowMetaStyle}>
          {formatModeMeta([
            issue.kind,
            issue.branch_name,
            issue.target_repo,
            issue.merge_request?.provider ?? 'provider-neutral',
          ])}
        </div>
        <div style={pluginMetaLineStyle}>
          <span style={statusBadgeStyle(issue.status === 'registered' ? 'open' : 'running')}>
            {humanizeTokenLocale(locale, issue.status)}
          </span>
          <span style={statusBadgeStyle(issue.ci_status === 'failed' ? 'degraded' : 'info')}>
            {locale === 'zh-CN' ? '检查' : 'CI'} {humanizeTokenLocale(locale, issue.ci_status)}
          </span>
          <span style={statusBadgeStyle(issue.merge_status === 'merged' ? 'open' : 'info')}>
            {locale === 'zh-CN' ? '合并' : 'MR'} {humanizeTokenLocale(locale, issue.merge_status)}
          </span>
        </div>
        <div style={queueRowDescriptionStyle}>{issue.problem_statement}</div>
      </div>
      <div style={managerActionsRowStyle}>
        <button
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            void onOpen(issue)
          }}
        >
          {locale === 'zh-CN' ? '查看需求' : 'Open issue'}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={!canStart}
          onClick={() => {
            void onStart(issue.issue_id)
          }}
        >
          {locale === 'zh-CN' ? '创建分支' : 'Create branch'}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={!canCi}
          onClick={() => {
            void onRunCi(issue.issue_id)
          }}
        >
          {locale === 'zh-CN' ? '跑检查' : 'Run CI'}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={!canMerge}
          onClick={() => {
            void onMerge(issue.issue_id)
          }}
        >
          {locale === 'zh-CN' ? '合并' : 'Merge'}
        </button>
        <button
          type="button"
          style={secondaryButtonStyle}
          disabled={!canRegister}
          onClick={() => {
            void onRegister(issue.issue_id)
          }}
        >
          {locale === 'zh-CN' ? '注册托管' : 'Register overlay'}
        </button>
      </div>
    </div>
  )
}

export function CapabilitiesWorkspace({
  locale,
  capabilitySummaryItems,
  modePosture,
  sidebarStatusItems,
  runtimeStatus,
  selectedWorkMode,
  selectedModeSpec,
  localSeatPreference,
  launchBusy,
  agentMode,
  agentCwd,
  substrateSummary,
  capabilitySkillGroups,
  managedPluginEntries,
  managedRegistryEntries,
  pluginDevIssues,
  capabilityManagerSettings,
  managedSkillPathDraft,
  onManagedSkillPathDraftChange,
  managedPluginPathDraft,
  onManagedPluginPathDraftChange,
  extraSkillRootDraft,
  onExtraSkillRootDraftChange,
  extraPluginRootDraft,
  onExtraPluginRootDraftChange,
  useCapability,
  syncCapabilityRegistry,
  updateCapabilityGroup,
  toggleCapabilityVisibility,
  openCapabilityLocalPath,
  copyCapabilityMention,
  addDiscoveryRoot,
  removeDiscoveryRoot,
  openPluginDevIssue,
  startPluginDevIssue,
  runPluginDevIssueCi,
  mergePluginDevIssue,
  registerPluginDevIssue,
}: CapabilitiesWorkspaceProps) {
  const rawWorkspaceRoot = normalizePath(agentCwd ?? null)
  const currentWorkspaceRoot =
    rawWorkspaceRoot && rawWorkspaceRoot.split('/').filter(Boolean).length > 2
      ? rawWorkspaceRoot
      : null
  const registryById = useMemo(
    () => new Map(managedRegistryEntries.map(entry => [entry.registry_id, entry])),
    [managedRegistryEntries],
  )
  const pluginBuckets = useMemo(
    () =>
      buildPluginBuckets(locale, managedPluginEntries, managedRegistryEntries, currentWorkspaceRoot),
    [currentWorkspaceRoot, locale, managedPluginEntries, managedRegistryEntries],
  )
  const recommendedExpanded = useMemo(
    () => pluginBuckets.filter(bucket => bucket.defaultExpanded).map(bucket => bucket.key),
    [pluginBuckets],
  )
  const [expandedBuckets, setExpandedBuckets] =
    useState<CapabilitySourceBucket[]>(recommendedExpanded)

  useEffect(() => {
    setExpandedBuckets(previous => {
      const validKeys = new Set(pluginBuckets.map(bucket => bucket.key))
      const next = previous.filter(key => validKeys.has(key))
      for (const key of recommendedExpanded) {
        if (!next.includes(key)) next.push(key)
      }
      return arraysEqual(previous, next) ? previous : next
    })
  }, [pluginBuckets, recommendedExpanded])

  const runtimeProfile =
    runtimeStatus.runtimeProfile ??
    readMetadataString(substrateSummary ?? undefined, 'runtime_profile') ??
    'dev_local_acp_bridge'
  const [activePanel, setActivePanel] =
    useState<'installed' | 'development' | 'released' | 'skills' | 'runtime'>('installed')
  const capabilityPanels = [
    {
      id: 'installed' as const,
      label: locale === 'zh-CN' ? '已安装' : 'Installed',
    },
    {
      id: 'development' as const,
      label: locale === 'zh-CN' ? '开发中' : 'In dev',
    },
    {
      id: 'released' as const,
      label: locale === 'zh-CN' ? '发布库' : 'Released',
    },
    {
      id: 'skills' as const,
      label: locale === 'zh-CN' ? '技能' : 'Skills',
    },
    {
      id: 'runtime' as const,
      label: locale === 'zh-CN' ? '运行环境' : 'Runtime',
    },
  ]

  return (
    <>
      <Section
        title={t(locale, 'section.capabilities.posture.title')}
        subtitle={t(locale, 'section.capabilities.posture.subtitle')}
        actions={
          <div style={utilityStyles.buttonCluster}>
            {capabilityPanels.map(panel => (
              <button
                key={panel.id}
                type="button"
                aria-pressed={activePanel === panel.id}
                style={segmentedButtonStyle(activePanel === panel.id)}
                onClick={() => setActivePanel(panel.id)}
              >
                {panel.label}
              </button>
            ))}
          </div>
        }
      >
        <StatusStrip locale={locale} items={capabilitySummaryItems} />
      </Section>

      {activePanel === 'runtime' && (
        <>
          <Section
            title={t(locale, 'section.capabilities.mode_recommendations.title')}
            subtitle={t(locale, 'section.capabilities.mode_recommendations.subtitle')}
          >
            <div style={modePostureGridStyle}>
              {modePosture.map(({ mode, spec, capabilities }) => {
                const availabilityState = workModeAvailabilityState(
                  locale,
                  mode,
                  runtimeStatus,
                  selectedWorkMode === mode,
                  localSeatPreference,
                )
                return (
                  <div key={mode} style={modePostureCardStyle}>
                    <div style={modeCardHeaderStyle}>
                      <div style={chromeStyles.eyebrowLight}>{spec.eyebrow}</div>
                      <span style={statusBadgeStyle(availabilityState.tone)}>
                        {selectedWorkMode === mode && availabilityState.tone === 'running'
                          ? t(locale, 'context.selected_home_mode')
                          : availabilityState.label}
                      </span>
                    </div>
                    <div style={modeCardTitleStyle}>{spec.label}</div>
                    <div style={queueRowDescriptionStyle}>{spec.detail}</div>
                    <div style={chromeStyles.quietMeta}>
                      {humanizeTokenLocale(locale, spec.runtimeTarget)} ·{' '}
                      {humanizeTokenLocale(locale, spec.modelPlane)} ·{' '}
                      {humanizeTokenLocale(locale, spec.interactionSurface)}
                    </div>
                    <div style={chromeStyles.quietMeta}>{spec.workspaceHint}</div>
                    {capabilities.length === 0 ? (
                      <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_capabilities')}</div>
                    ) : (
                      <div style={capabilityRailStyle}>
                        {capabilities.map(item => (
                          <CapabilitiesChip
                            locale={locale}
                            key={`${mode}:${item.id}`}
                            item={item}
                            onUse={useCapability}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          <div style={studioGridStyle}>
            <Section
              title={t(locale, 'section.runtime_health.title')}
              subtitle={t(locale, 'section.runtime_health.subtitle')}
            >
              <div style={utilityStyles.stackedList}>
                {sidebarStatusItems.map(item => (
                  <div key={item.id} style={surfaceStyles.listRow}>
                    <div style={queueRowLeadStyle}>
                      <div style={queueRowTitleStyle}>{item.label}</div>
                      {item.meta && <div style={chromeStyles.quietMeta}>{item.meta}</div>}
                    </div>
                    <span style={statusBadgeStyle(item.status)}>
                      {humanizeTokenLocale(locale, item.status)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title={t(locale, 'section.workspace_context.title')}
              subtitle={t(locale, 'section.workspace_context.subtitle')}
            >
              <div style={utilityStyles.stackedList}>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.local_executor_runtime')}</div>
                    <div style={chromeStyles.quietMeta}>
                      {t(locale, 'context.local_executor_runtime_desc')}
                    </div>
                  </div>
                  <span style={statusBadgeStyle(launchBusy ? 'running' : agentMode?.alive ? 'open' : 'info')}>
                    {launchBusy
                      ? t(locale, 'state.launching')
                      : agentMode
                        ? humanizeTokenLocale(locale, agentMode.mode)
                        : t(locale, 'state.pending')}
                  </span>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'runtime.local_runtime_seat')}</div>
                    <div style={chromeStyles.quietMeta}>
                      {runtimeStatus.localRuntimeApiUrl || runtimeStatus.localAcpScript
                        ? formatModeMeta([
                            runtimeStatus.localAcpScript,
                            runtimeStatus.localRuntimeApiUrl,
                          ])
                        : t(locale, 'runtime.no_local_runtime_api')}
                    </div>
                  </div>
                  <span
                    style={statusBadgeStyle(
                      runtimeStatus.localRuntimeAvailable ? 'open' : 'degraded',
                    )}
                  >
                    {humanizeTokenLocale(locale, runtimeStatus.localRuntimeSeat ?? 'unavailable')}
                  </span>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.local_seat_strategy')}</div>
                    <div style={chromeStyles.quietMeta}>{t(locale, 'context.local_seat_strategy_desc')}</div>
                  </div>
                  <span style={statusBadgeStyle(localSeatPreference !== 'auto' ? 'running' : 'open')}>
                    {localSeatPreferenceLabel(locale, localSeatPreference)}
                  </span>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.dev_machine_acp_takeover')}</div>
                    <div style={chromeStyles.quietMeta}>
                      {t(locale, 'context.dev_machine_acp_takeover_desc')}
                    </div>
                  </div>
                  <span style={statusBadgeStyle(runtimeStatus.devMachineAcpTakeover ? 'running' : 'open')}>
                    {runtimeStatus.devMachineAcpTakeover
                      ? t(locale, 'state.active')
                      : t(locale, 'state.inactive')}
                  </span>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.selected_home_mode')}</div>
                    <div style={chromeStyles.quietMeta}>{t(locale, 'context.selected_home_mode_desc')}</div>
                  </div>
                  <span style={statusBadgeStyle('running')}>{selectedModeSpec.label}</span>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.workspace_root')}</div>
                    <div style={chromeStyles.quietMeta}>{t(locale, 'context.workspace_root_desc')}</div>
                  </div>
                  <div style={chromeStyles.monoMeta}>
                    {agentCwd || humanizeTokenLocale(locale, 'unavailable')}
                  </div>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.runtime_profile')}</div>
                    <div style={chromeStyles.quietMeta}>{t(locale, 'context.runtime_profile_desc')}</div>
                  </div>
                  <span style={statusBadgeStyle('open')}>
                    {humanizeTokenLocale(locale, String(runtimeProfile))}
                  </span>
                </div>
                <div style={surfaceStyles.listRow}>
                  <div style={queueRowLeadStyle}>
                    <div style={queueRowTitleStyle}>{t(locale, 'context.plugin_visibility')}</div>
                    <div style={chromeStyles.quietMeta}>{t(locale, 'context.plugin_visibility_desc')}</div>
                  </div>
                  <span
                    style={statusBadgeStyle(
                      (substrateSummary?.plugins.length ?? 0) > 0 ? 'open' : 'degraded',
                    )}
                  >
                    {(substrateSummary?.plugins.length ?? 0) > 0
                      ? t(locale, 'state.visible')
                      : t(locale, 'state.pending')}
                  </span>
                </div>
              </div>
            </Section>
          </div>
        </>
      )}

      {activePanel === 'development' && (
        <Section
          title={locale === 'zh-CN' ? '开发' : 'Plugin development pipeline'}
          subtitle={
            locale === 'zh-CN'
              ? '从微信创建需求，桌面端推进。'
              : 'WeChat creates issues; desktop advances Issue / Branch / CI / MR / Merge / Register.'
          }
        >
          {pluginDevIssues.filter(issue => issue.status !== 'registered').length === 0 ? (
            <div style={utilityStyles.emptyState}>
              {locale === 'zh-CN'
                ? '暂无开发需求。可从微信发送 /plugin 或 /skill。'
                : 'No plugin or skill issues in development. Use /plugin or /skill from WeChat.'}
            </div>
          ) : (
            <div style={utilityStyles.stackedList}>
              {pluginDevIssues
                .filter(issue => issue.status !== 'registered')
                .map(issue => (
                  <PluginDevIssueRow
                    key={issue.issue_id}
                    locale={locale}
                    issue={issue}
                    onOpen={openPluginDevIssue}
                    onStart={startPluginDevIssue}
                    onRunCi={runPluginDevIssueCi}
                    onMerge={mergePluginDevIssue}
                    onRegister={registerPluginDevIssue}
                  />
                ))}
            </div>
          )}
        </Section>
      )}

      {activePanel === 'released' && (
        <Section
          title={locale === 'zh-CN' ? '发布库' : 'Release library'}
          subtitle={
            locale === 'zh-CN'
              ? '已合并并注册的可复用能力，后续可从微信再次调用。'
              : 'Merged and registered reusable skills/plugins callable from WeChat later.'
          }
        >
          {pluginDevIssues.filter(issue => issue.status === 'registered').length === 0 ? (
            <div style={utilityStyles.emptyState}>
              {locale === 'zh-CN' ? '还没有已发布能力。' : 'No released capabilities yet.'}
            </div>
          ) : (
            <div style={utilityStyles.stackedList}>
              {pluginDevIssues
                .filter(issue => issue.status === 'registered')
                .map(issue => (
                  <PluginDevIssueRow
                    key={issue.issue_id}
                    locale={locale}
                    issue={issue}
                    onOpen={openPluginDevIssue}
                    onStart={startPluginDevIssue}
                    onRunCi={runPluginDevIssueCi}
                    onMerge={mergePluginDevIssue}
                    onRegister={registerPluginDevIssue}
                  />
                ))}
            </div>
          )}
        </Section>
      )}

      {activePanel === 'installed' && (
        <Section
          title={t(locale, 'section.capabilities.plugins.title')}
          subtitle={locale === 'zh-CN' ? '按来源分组，只展开需关注项。' : 'Grouped by source. Attention buckets expand first.'}
        >
          {pluginBuckets.length === 0 ? (
            <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_capability_plugins')}</div>
          ) : (
            <div style={accordionStackStyle}>
              {pluginBuckets.map(bucket => {
                const expanded = expandedBuckets.includes(bucket.key)
                return (
                  <div key={bucket.key} style={bucketCardStyle}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      style={accordionButtonStyle(expanded)}
                      onClick={() => {
                        setExpandedBuckets(previous =>
                          previous.includes(bucket.key)
                            ? previous.filter(key => key !== bucket.key)
                            : [...previous, bucket.key],
                        )
                      }}
                    >
                      <div style={queueRowLeadStyle}>
                        <div style={queueRowTitleStyle}>{bucket.label}</div>
                        <div style={chromeStyles.quietMeta}>{bucket.subtitle}</div>
                      </div>
                      <div style={accordionTailStyle}>
                        <div style={accordionBadgeRowStyle}>
                          <span style={statusBadgeStyle(bucket.tone)}>
                            {tf(locale, 'label.plugins_count', { count: bucket.totalCount })}
                          </span>
                          {bucket.disabledCount > 0 && (
                            <span style={statusBadgeStyle('degraded')}>
                              {hiddenBadgeText(locale, bucket.disabledCount)}
                            </span>
                          )}
                          {bucket.attentionCount > 0 && (
                            <span style={statusBadgeStyle('degraded')}>
                              {attentionBadgeText(locale, bucket.attentionCount)}
                            </span>
                          )}
                        </div>
                        <span style={statusBadgeStyle(expanded ? 'running' : 'info')}>
                          {expanded
                            ? locale === 'zh-CN'
                              ? '收起'
                              : 'Collapse'
                            : locale === 'zh-CN'
                              ? '展开'
                              : 'Expand'}
                        </span>
                      </div>
                    </button>
                    {expanded && (
                      <div style={accordionPanelStyle}>
                        {bucket.items.map(plugin => (
                          <CapabilityRow
                            key={plugin.capability_id}
                            locale={locale}
                            entry={plugin}
                            kind="plugin"
                            registryById={registryById}
                            updateCapabilityGroup={updateCapabilityGroup}
                            useCapability={useCapability}
                            copyCapabilityMention={copyCapabilityMention}
                            openCapabilityLocalPath={openCapabilityLocalPath}
                            toggleCapabilityVisibility={toggleCapabilityVisibility}
                            syncCapabilityRegistry={syncCapabilityRegistry}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>
      )}

      {activePanel === 'runtime' && (
        <>
          <Section
            title={locale === 'zh-CN' ? '托管插件' : 'Runtime-managed plugins'}
        subtitle={
          locale === 'zh-CN'
            ? '注册、重扫、移除托管副本。'
            : 'Register skills/plugins into the runtime overlay. Removal only deletes the overlay, never the repo source.'
        }
      >
        <div style={studioGridStyle}>
          <div style={studioGroupStyle}>
            <div style={studioGroupHeaderStyle}>
              <div style={queueRowTitleStyle}>{locale === 'zh-CN' ? '注册技能' : 'Register skill'}</div>
            </div>
            <div style={managerActionsRowStyle}>
              <input
                value={managedSkillPathDraft}
                placeholder={
                  locale === 'zh-CN'
                    ? 'SKILL.md 目录或技能根目录…'
                    : 'Path to skill root or directory containing SKILL.md'
                }
                style={managerInputStyle}
                onChange={event => onManagedSkillPathDraftChange(event.target.value)}
              />
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  if (!managedSkillPathDraft.trim()) return
                  syncCapabilityRegistry({
                    type: 'register',
                    kind: 'skill',
                    sourcePath: managedSkillPathDraft.trim(),
                  })
                  onManagedSkillPathDraftChange('')
                }}
              >
                {locale === 'zh-CN' ? '注册' : 'Register'}
              </button>
            </div>
          </div>

          <div style={studioGroupStyle}>
            <div style={studioGroupHeaderStyle}>
              <div style={queueRowTitleStyle}>{locale === 'zh-CN' ? '注册插件' : 'Register plugin'}</div>
            </div>
            <div style={managerActionsRowStyle}>
              <input
                value={managedPluginPathDraft}
                placeholder={locale === 'zh-CN' ? '插件目录路径…' : 'Path to plugin directory…'}
                style={managerInputStyle}
                onChange={event => onManagedPluginPathDraftChange(event.target.value)}
              />
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  if (!managedPluginPathDraft.trim()) return
                  syncCapabilityRegistry({
                    type: 'register',
                    kind: 'plugin',
                    sourcePath: managedPluginPathDraft.trim(),
                  })
                  onManagedPluginPathDraftChange('')
                }}
              >
                {locale === 'zh-CN' ? '注册' : 'Register'}
              </button>
              <button
                type="button"
                style={secondaryButtonStyle}
                onClick={() => {
                  syncCapabilityRegistry({ type: 'refresh' })
                }}
              >
                {locale === 'zh-CN' ? '重扫' : 'Rescan'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ ...utilityStyles.stackedList, ...sectionSpacerStyle }}>
          {managedRegistryEntries.length === 0 ? (
            <div style={utilityStyles.emptyState}>
              {locale === 'zh-CN'
                ? '当前没有托管副本。'
                : 'No runtime-managed overlay capabilities are registered yet.'}
            </div>
          ) : (
            managedRegistryEntries.map(entry => (
              <div key={entry.registry_id} style={managerCardStyle}>
                <div style={queueRowLeadStyle}>
                  <div style={queueRowTitleStyle}>{entry.label}</div>
                  <div style={managerRowMetaStyle}>
                    {formatModeMeta([entry.kind, entry.health, entry.source_path])}
                  </div>
                </div>
                <div style={managerActionsRowStyle}>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => {
                      void openCapabilityLocalPath(entry.managed_path)
                    }}
                  >
                    {locale === 'zh-CN' ? '打开托管副本' : 'Open overlay'}
                  </button>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => {
                      void openCapabilityLocalPath(entry.source_path)
                    }}
                  >
                    {locale === 'zh-CN' ? '打开源目录' : 'Open source'}
                  </button>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => {
                      syncCapabilityRegistry({
                        type: 'remove',
                        registryId: entry.registry_id,
                      })
                    }}
                  >
                    {locale === 'zh-CN' ? '移除托管副本' : 'Remove overlay'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
          </Section>

          <Section
            title={t(locale, 'section.capabilities.plugins.title')}
            subtitle={
              locale === 'zh-CN'
                ? '按来源分组，默认只展开需关注项。'
                : 'Manage plugins by source bucket. Only overlay and attention buckets expand by default.'
            }
          >
            {pluginBuckets.length === 0 ? (
              <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_capability_plugins')}</div>
            ) : (
              <div style={accordionStackStyle}>
                {pluginBuckets.map(bucket => {
                  const expanded = expandedBuckets.includes(bucket.key)
                  return (
                    <div key={bucket.key} style={bucketCardStyle}>
                      <button
                        type="button"
                        aria-expanded={expanded}
                        style={accordionButtonStyle(expanded)}
                        onClick={() => {
                          setExpandedBuckets(previous =>
                            previous.includes(bucket.key)
                              ? previous.filter(key => key !== bucket.key)
                              : [...previous, bucket.key],
                          )
                        }}
                      >
                        <div style={queueRowLeadStyle}>
                          <div style={queueRowTitleStyle}>{bucket.label}</div>
                          <div style={chromeStyles.quietMeta}>{bucket.subtitle}</div>
                        </div>
                        <div style={accordionTailStyle}>
                          <div style={accordionBadgeRowStyle}>
                            <span style={statusBadgeStyle(bucket.tone)}>
                              {tf(locale, 'label.plugins_count', { count: bucket.totalCount })}
                            </span>
                            {bucket.disabledCount > 0 && (
                              <span style={statusBadgeStyle('degraded')}>
                                {hiddenBadgeText(locale, bucket.disabledCount)}
                              </span>
                            )}
                            {bucket.attentionCount > 0 && (
                              <span style={statusBadgeStyle('degraded')}>
                                {attentionBadgeText(locale, bucket.attentionCount)}
                              </span>
                            )}
                            {bucket.managedCount > 0 && (
                              <span style={statusBadgeStyle('running')}>
                                {overlayBadgeText(locale, bucket.managedCount)}
                              </span>
                            )}
                            {bucket.currentWorkspaceCount > 0 && (
                              <span style={statusBadgeStyle('open')}>
                                {workspaceBadgeText(locale, bucket.currentWorkspaceCount)}
                              </span>
                            )}
                          </div>
                          <span style={statusBadgeStyle(expanded ? 'running' : 'info')}>
                            {expanded
                              ? locale === 'zh-CN'
                                ? '收起'
                                : 'Collapse'
                              : locale === 'zh-CN'
                                ? '展开'
                                : 'Expand'}
                          </span>
                        </div>
                      </button>
                      {expanded && (
                        <div style={accordionPanelStyle}>
                          {bucket.items.map(plugin => (
                            <CapabilityRow
                              key={plugin.capability_id}
                              locale={locale}
                              entry={plugin}
                              kind="plugin"
                              registryById={registryById}
                              updateCapabilityGroup={updateCapabilityGroup}
                              useCapability={useCapability}
                              copyCapabilityMention={copyCapabilityMention}
                              openCapabilityLocalPath={openCapabilityLocalPath}
                              toggleCapabilityVisibility={toggleCapabilityVisibility}
                              syncCapabilityRegistry={syncCapabilityRegistry}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          <Section
            title={t(locale, 'section.capabilities.extra_roots.title')}
            subtitle={t(locale, 'section.capabilities.extra_roots.subtitle')}
          >
            <div style={studioGridStyle}>
              <div style={studioGroupStyle}>
                <div style={studioGroupHeaderStyle}>
                  <div style={queueRowTitleStyle}>{t(locale, 'label.skills')}</div>
                </div>
                <div style={managerActionsRowStyle}>
                  <input
                    value={extraSkillRootDraft}
                    placeholder={t(locale, 'action.add_skill_root')}
                    style={managerInputStyle}
                    onChange={event => onExtraSkillRootDraftChange(event.target.value)}
                  />
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => addDiscoveryRoot('skill')}
                  >
                    {t(locale, 'action.add_root')}
                  </button>
                </div>
                <div style={utilityStyles.stackedList}>
                  {capabilityManagerSettings.extra_skill_roots.length === 0 ? (
                    <div style={utilityStyles.emptyState}>
                      {locale === 'zh-CN'
                        ? '当前没有额外技能路径。'
                        : 'No extra skill roots are configured.'}
                    </div>
                  ) : (
                    capabilityManagerSettings.extra_skill_roots.map(root => (
                      <div key={root} style={surfaceStyles.listRow}>
                        <div style={monoPathStyle}>{root}</div>
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => removeDiscoveryRoot('skill', root)}
                        >
                          {t(locale, 'action.remove_root')}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={studioGroupStyle}>
                <div style={studioGroupHeaderStyle}>
                  <div style={queueRowTitleStyle}>{t(locale, 'label.plugins')}</div>
                </div>
                <div style={managerActionsRowStyle}>
                  <input
                    value={extraPluginRootDraft}
                    placeholder={t(locale, 'action.add_plugin_root')}
                    style={managerInputStyle}
                    onChange={event => onExtraPluginRootDraftChange(event.target.value)}
                  />
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => addDiscoveryRoot('plugin')}
                  >
                    {t(locale, 'action.add_root')}
                  </button>
                </div>
                <div style={utilityStyles.stackedList}>
                  {capabilityManagerSettings.extra_plugin_roots.length === 0 ? (
                    <div style={utilityStyles.emptyState}>
                      {locale === 'zh-CN'
                        ? '当前没有额外插件路径。'
                        : 'No extra plugin roots are configured.'}
                    </div>
                  ) : (
                    capabilityManagerSettings.extra_plugin_roots.map(root => (
                      <div key={root} style={surfaceStyles.listRow}>
                        <div style={monoPathStyle}>{root}</div>
                        <button
                          type="button"
                          style={secondaryButtonStyle}
                          onClick={() => removeDiscoveryRoot('plugin', root)}
                        >
                          {t(locale, 'action.remove_root')}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Section>
        </>
      )}

      {activePanel === 'skills' && (
        <Section
          title={t(locale, 'section.capabilities.skills.title')}
          subtitle={t(locale, 'section.capabilities.skills.subtitle')}
        >
          {capabilitySkillGroups.length === 0 ? (
            <div style={utilityStyles.emptyState}>{t(locale, 'empty.no_local_skills')}</div>
          ) : (
            <div style={studioGroupStackStyle}>
              {capabilitySkillGroups.map(group => (
                <div key={group.group} style={studioGroupStyle}>
                  <div style={studioGroupHeaderStyle}>
                    <div style={queueRowTitleStyle}>{humanizeTokenLocale(locale, group.group)}</div>
                    <div style={chromeStyles.quietMeta}>
                      {tf(locale, 'label.skill_count', { count: group.items.length })}
                    </div>
                  </div>
                  <div style={utilityStyles.stackedList}>
                    {group.items.map(skill => (
                      <CapabilityRow
                        key={skill.capability_id}
                        locale={locale}
                        entry={skill}
                        kind="skill"
                        registryById={registryById}
                        updateCapabilityGroup={updateCapabilityGroup}
                        useCapability={useCapability}
                        copyCapabilityMention={copyCapabilityMention}
                        openCapabilityLocalPath={openCapabilityLocalPath}
                        toggleCapabilityVisibility={toggleCapabilityVisibility}
                        syncCapabilityRegistry={syncCapabilityRegistry}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </>
  )
}

export default CapabilitiesWorkspace
