import type { CSSProperties } from 'react'

export const fontStacks = {
  display:
    '"Instrument Serif", "Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
  ui: '"Instrument Sans", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  mono: '"IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", monospace',
} as const

export const palette = {
  paper: '#F7F2E8',
  stone: '#E7DDCC',
  panel: '#F0E6D7',
  panelRaised: '#FBF7F0',
  ink: '#171A1F',
  slate: '#2C3440',
  slateSoft: '#4C5866',
  copper: '#B8643B',
  teal: '#2C7A78',
  success: '#2E8B57',
  warning: '#C7922F',
  error: '#C84F44',
  info: '#586472',
  border: 'rgba(23, 26, 31, 0.12)',
  borderStrong: 'rgba(23, 26, 31, 0.2)',
  surfaceOverlay: 'rgba(23, 26, 31, 0.46)',
  textMuted: '#67717D',
  textSoft: '#82909F',
  inspect: '#1D232C',
  inspectSoft: '#11161D',
  inspectText: '#F6EFE4',
} as const

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const

export const motion = {
  micro: '120ms ease-out',
  short: '170ms ease-out',
  medium: '220ms ease-out',
} as const

export function humanizeToken(value?: string | null): string {
  if (!value) return 'Unknown'
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function statusPalette(status: string) {
  const normalized = String(status).toLowerCase()
  if (
    ['failed', 'repair_required', 'critical', 'delivery_failed', 'rejected'].includes(
      normalized,
    )
  ) {
    return {
      background: 'rgba(200, 79, 68, 0.12)',
      border: 'rgba(200, 79, 68, 0.24)',
      color: palette.error,
    }
  }
  if (
    ['partial', 'warning', 'needs_review', 'needs retry', 'needs_retry', 'degraded'].includes(
      normalized,
    )
  ) {
    return {
      background: 'rgba(199, 146, 47, 0.12)',
      border: 'rgba(199, 146, 47, 0.26)',
      color: palette.warning,
    }
  }
  if (['succeeded', 'ok', 'approved', 'reviewed_insight', 'success'].includes(normalized)) {
    return {
      background: 'rgba(46, 139, 87, 0.12)',
      border: 'rgba(46, 139, 87, 0.24)',
      color: palette.success,
    }
  }
  if (['running', 'active', 'open', 'info'].includes(normalized)) {
    return {
      background: 'rgba(44, 122, 120, 0.12)',
      border: 'rgba(44, 122, 120, 0.24)',
      color: palette.teal,
    }
  }
  return {
    background: 'rgba(88, 100, 114, 0.1)',
    border: 'rgba(88, 100, 114, 0.18)',
    color: palette.info,
  }
}

export function statusBadgeStyle(status: string): CSSProperties {
  const tone = statusPalette(status)
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.pill,
    padding: '5px 10px',
    border: `1px solid ${tone.border}`,
    background: tone.background,
    color: tone.color,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1.1,
    whiteSpace: 'nowrap',
  }
}

export function navButtonStyle(active = false): CSSProperties {
  return {
    width: '100%',
    borderRadius: radii.md,
    border: `1px solid ${active ? 'rgba(231, 221, 204, 0.2)' : 'transparent'}`,
    background: active ? 'rgba(247, 242, 232, 0.12)' : 'transparent',
    color: active ? palette.paper : 'rgba(247, 242, 232, 0.76)',
    padding: '11px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: `background ${motion.micro}, border-color ${motion.micro}, color ${motion.micro}`,
    fontFamily: fontStacks.ui,
    fontSize: 14,
    fontWeight: active ? 600 : 500,
  }
}

export function segmentedButtonStyle(active = false): CSSProperties {
  return {
    borderRadius: radii.pill,
    border: `1px solid ${active ? palette.copper : palette.borderStrong}`,
    background: active ? 'rgba(184, 100, 59, 0.14)' : palette.panelRaised,
    color: active ? palette.ink : palette.textMuted,
    padding: '8px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: `background ${motion.micro}, border-color ${motion.micro}, color ${motion.micro}`,
    fontFamily: fontStacks.ui,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
  }
}

export const primaryButtonStyle: CSSProperties = {
  border: `1px solid ${palette.copper}`,
  borderRadius: radii.pill,
  padding: '10px 14px',
  background: palette.copper,
  color: palette.paper,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 13,
  fontWeight: 600,
}

export const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${palette.borderStrong}`,
  borderRadius: radii.pill,
  padding: '8px 12px',
  background: palette.panelRaised,
  color: palette.ink,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 13,
  fontWeight: 500,
}

export type ButtonTone = 'primary' | 'secondary'

export function buttonStyleForState(
  base: CSSProperties,
  disabled = false,
  tone: ButtonTone = 'secondary',
): CSSProperties {
  if (!disabled) return base

  if (tone === 'primary') {
    return {
      ...base,
      border: `1px solid ${palette.borderStrong}`,
      background: palette.stone,
      color: palette.textMuted,
      cursor: 'not-allowed',
      boxShadow: 'none',
      opacity: 1,
    }
  }

  return {
    ...base,
    border: `1px solid ${palette.border}`,
    background: palette.panel,
    color: palette.textSoft,
    cursor: 'not-allowed',
    boxShadow: 'none',
    opacity: 1,
  }
}

export const chromeStyles = {
  brand: {
    fontFamily: fontStacks.display,
    fontSize: 24,
    lineHeight: 1.05,
    fontWeight: 600,
    color: palette.paper,
    letterSpacing: '-0.02em',
  } satisfies CSSProperties,
  eyebrow: {
    fontFamily: fontStacks.mono,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: 'rgba(247, 242, 232, 0.56)',
  } satisfies CSSProperties,
  eyebrowLight: {
    fontFamily: fontStacks.mono,
    fontSize: 11,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: palette.textMuted,
  } satisfies CSSProperties,
  headerTitle: {
    margin: 0,
    fontFamily: fontStacks.display,
    fontSize: 34,
    lineHeight: 1.05,
    fontWeight: 600,
    color: palette.ink,
    letterSpacing: '-0.03em',
  } satisfies CSSProperties,
  sectionTitle: {
    margin: 0,
    fontFamily: fontStacks.display,
    fontSize: 22,
    lineHeight: 1.1,
    fontWeight: 600,
    color: palette.ink,
    letterSpacing: '-0.02em',
  } satisfies CSSProperties,
  subtleText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  quietMeta: {
    color: palette.textSoft,
    fontSize: 12,
    lineHeight: 1.4,
    fontFamily: fontStacks.ui,
  } satisfies CSSProperties,
  monoMeta: {
    color: palette.textSoft,
    fontSize: 12,
    lineHeight: 1.45,
    fontFamily: fontStacks.mono,
    fontVariantNumeric: 'tabular-nums',
  } satisfies CSSProperties,
} as const

export const surfaceStyles = {
  section: {
    background: palette.panelRaised,
    border: `1px solid ${palette.border}`,
    borderRadius: radii.lg,
    padding: spacing.md,
    boxShadow: '0 10px 30px rgba(23, 26, 31, 0.06)',
  } satisfies CSSProperties,
  mutedSection: {
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    borderRadius: radii.lg,
    padding: spacing.md,
  } satisfies CSSProperties,
  listRow: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: radii.md,
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    textAlign: 'left',
    color: palette.ink,
  } satisfies CSSProperties,
  listRowInteractive: {
    cursor: 'pointer',
    transition: `transform ${motion.micro}, border-color ${motion.micro}, background ${motion.micro}`,
  } satisfies CSSProperties,
  strip: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: spacing.sm,
  } satisfies CSSProperties,
  stripItem: {
    background: palette.stone,
    borderRadius: radii.md,
    border: `1px solid ${palette.border}`,
    padding: '12px 14px',
  } satisfies CSSProperties,
  drawerPre: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    background: palette.inspect,
    color: palette.inspectText,
    overflow: 'auto',
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily: fontStacks.mono,
  } satisfies CSSProperties,
  inspectPanel: {
    background: palette.inspectSoft,
    color: palette.inspectText,
    borderRadius: radii.md,
    border: '1px solid rgba(247, 242, 232, 0.08)',
    padding: spacing.sm,
  } satisfies CSSProperties,
} as const

export const utilityStyles = {
  stackedList: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.xs,
  } satisfies CSSProperties,
  splitMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  } satisfies CSSProperties,
  buttonCluster: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing.xs,
  } satisfies CSSProperties,
  emptyState: {
    padding: spacing.md,
    borderRadius: radii.md,
    background: palette.panel,
    border: `1px dashed ${palette.borderStrong}`,
    color: palette.textMuted,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  errorBanner: {
    padding: '10px 14px',
    borderRadius: radii.md,
    background: 'rgba(200, 79, 68, 0.12)',
    color: palette.error,
    border: '1px solid rgba(200, 79, 68, 0.18)',
  } satisfies CSSProperties,
  noticeBanner: {
    padding: '10px 14px',
    borderRadius: radii.md,
    background: 'rgba(44, 122, 120, 0.12)',
    color: palette.teal,
    border: '1px solid rgba(44, 122, 120, 0.18)',
  } satisfies CSSProperties,
  warningBanner: {
    padding: '10px 14px',
    borderRadius: radii.md,
    background: 'rgba(199, 146, 47, 0.14)',
    color: palette.warning,
    border: '1px solid rgba(199, 146, 47, 0.22)',
    lineHeight: 1.5,
  } satisfies CSSProperties,
  select: {
    borderRadius: radii.pill,
    padding: '8px 12px',
    border: `1px solid ${palette.borderStrong}`,
    background: palette.panelRaised,
    color: palette.ink,
    fontFamily: fontStacks.ui,
    fontSize: 13,
  } satisfies CSSProperties,
} as const
