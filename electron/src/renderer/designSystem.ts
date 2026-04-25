import type { CSSProperties } from 'react'

export const fontStacks = {
  display:
    '"Instrument Sans", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  ui: '"Instrument Sans", "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',
  mono:
    '"Departure Mono", "DepartureMono", "IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", monospace',
} as const

export const tradingDeskTheme = {
  name: 'aurora-native-trading-desk',
  colors: {
    root: '#080B12',
    rootElevated: '#0B1118',
    panel: '#0F1620',
    panelSoft: '#121B27',
    panelRaised: '#151F2D',
    panelInset: '#101926',
    control: '#111A25',
    grid: '#1C2633',
    empty: '#0E1722',
    chartPanel: '#131722',
    chartBorder: '#202A38',
    border: '#222D3B',
    borderStrong: '#263244',
    borderMuted: '#2A3748',
    text: '#D7DEE8',
    textStrong: '#F2F6FB',
    muted: '#7F8EA3',
    mutedStrong: '#8EA0B8',
    mono: '#9CB1CE',
    controlText: '#B7C2D0',
    inspectText: '#F6EFE4',
    white: '#FFFFFF',
    accent: '#D08A54',
    accentText: '#FFD0A8',
    accentSoft: 'rgba(208, 138, 84, 0.18)',
    auroraBlue: '#2F8CFF',
    auroraViolet: '#8B6DFF',
    auroraGold: '#FFB86B',
    infoText: '#BFD9F5',
    errorText: '#FFB4BD',
    crosshair: '#2A2E39',
  },
  alpha: {
    textHairline: 'rgba(215, 222, 232, 0.06)',
    textBorder: 'rgba(215, 222, 232, 0.12)',
    textBorderStrong: 'rgba(215, 222, 232, 0.22)',
    panelWash: 'rgba(215, 222, 232, 0.055)',
    panelWashStrong: 'rgba(215, 222, 232, 0.11)',
    auroraBlue: 'rgba(47, 140, 255, 0.18)',
    auroraViolet: 'rgba(139, 109, 255, 0.18)',
    auroraGold: 'rgba(255, 184, 107, 0.18)',
    accentBorder: 'rgba(208, 138, 84, 0.38)',
    accentSurface: 'rgba(208, 138, 84, 0.16)',
    infoBorder: 'rgba(70, 132, 194, 0.35)',
    infoSurface: 'rgba(43, 91, 137, 0.16)',
    errorBorder: 'rgba(242, 54, 69, 0.38)',
    errorSurface: 'rgba(242, 54, 69, 0.14)',
    overlay: 'rgba(2, 5, 10, 0.64)',
  },
  gradients: {
    app:
      'linear-gradient(180deg, #080B12 0%, #0B1118 52%, #0A0F16 100%)',
    rail:
      'linear-gradient(180deg, #05070B 0%, #0B1118 48%, #111827 100%)',
    island:
      'linear-gradient(145deg, rgba(215, 222, 232, 0.18), rgba(208, 138, 84, 0.18) 44%, rgba(47, 140, 255, 0.12))',
    header:
      'linear-gradient(135deg, rgba(21, 31, 45, 0.94), rgba(15, 22, 32, 0.84))',
    auroraLine:
      'linear-gradient(90deg, rgba(47, 140, 255, 0.0), rgba(47, 140, 255, 0.72), rgba(255, 184, 107, 0.72), rgba(139, 109, 255, 0.0))',
  },
  radius: {
    compact: 5,
    control: 8,
    panel: 8,
    island: 16,
    pill: 999,
  },
  shadows: {
    panel: '0 10px 24px rgba(0, 0, 0, 0.22)',
    island:
      '0 18px 46px rgba(0, 0, 0, 0.34), inset 0 1px rgba(255, 255, 255, 0.12)',
    glow: '0 0 0 1px rgba(208, 138, 84, 0.18), 0 18px 48px rgba(47, 140, 255, 0.12)',
  },
  market: {
    up: '#F23645',
    down: '#26A69A',
    flat: '#787B86',
  },
  chart: {
    axis: '#787B86',
    line: '#2F8CFF',
    orange: '#F7931A',
    violet: '#E040FB',
    purple: '#9C27B0',
    gold: '#FF9800',
    separator: 'rgba(120, 123, 134, 0.25)',
    gridHorizontal: 'rgba(120, 123, 134, 0.18)',
    gridVertical: 'rgba(120, 123, 134, 0.12)',
  },
} as const

export const palette = {
  paper: tradingDeskTheme.colors.root,
  stone: tradingDeskTheme.colors.rootElevated,
  panel: tradingDeskTheme.colors.panel,
  panelRaised: tradingDeskTheme.colors.panelRaised,
  ink: tradingDeskTheme.colors.textStrong,
  slate: '#05070B',
  slateSoft: tradingDeskTheme.colors.rootElevated,
  copper: tradingDeskTheme.colors.accent,
  teal: '#4FBFCB',
  success: '#59D98E',
  warning: '#F2B85B',
  error: '#FF5D6C',
  info: tradingDeskTheme.colors.mutedStrong,
  border: tradingDeskTheme.alpha.textBorder,
  borderStrong: tradingDeskTheme.alpha.textBorderStrong,
  surfaceOverlay: tradingDeskTheme.alpha.overlay,
  textMuted: tradingDeskTheme.colors.muted,
  textSoft: tradingDeskTheme.colors.mono,
  inspect: tradingDeskTheme.colors.root,
  inspectSoft: tradingDeskTheme.colors.panel,
  inspectText: tradingDeskTheme.colors.inspectText,
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
  micro: '120ms cubic-bezier(0.2, 0, 0.2, 1)',
  short: '170ms cubic-bezier(0.2, 0, 0.2, 1)',
  medium: '240ms cubic-bezier(0.2, 0, 0.2, 1)',
} as const

export const interaction = {
  focusRing: `0 0 0 2px ${tradingDeskTheme.colors.root}, 0 0 0 4px rgba(255, 184, 107, 0.7)`,
  hoverLift: 'translateY(-1px)',
  press: 'translateY(0)',
  transition:
    `background ${motion.micro}, border-color ${motion.micro}, color ${motion.micro}, box-shadow ${motion.micro}, transform ${motion.micro}, opacity ${motion.micro}`,
  touchAction: 'manipulation',
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
      background: tradingDeskTheme.alpha.errorSurface,
      border: tradingDeskTheme.alpha.errorBorder,
      color: palette.error,
    }
  }
  if (
    ['partial', 'warning', 'needs_review', 'needs retry', 'needs_retry', 'degraded'].includes(
      normalized,
    )
  ) {
    return {
      background: tradingDeskTheme.alpha.accentSurface,
      border: tradingDeskTheme.alpha.accentBorder,
      color: palette.warning,
    }
  }
  if (['succeeded', 'ok', 'approved', 'reviewed_insight', 'success'].includes(normalized)) {
    return {
      background: 'rgba(89, 217, 142, 0.12)',
      border: 'rgba(89, 217, 142, 0.28)',
      color: palette.success,
    }
  }
  if (['running', 'active', 'open', 'info'].includes(normalized)) {
    return {
      background: tradingDeskTheme.alpha.auroraBlue,
      border: 'rgba(47, 140, 255, 0.32)',
      color: palette.teal,
    }
  }
  return {
    background: tradingDeskTheme.alpha.panelWashStrong,
    border: tradingDeskTheme.alpha.textBorder,
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
    borderRadius: tradingDeskTheme.radius.panel,
    border: `1px solid ${active ? tradingDeskTheme.alpha.textBorderStrong : 'transparent'}`,
    background: active ? tradingDeskTheme.alpha.panelWashStrong : 'transparent',
    color: active ? palette.ink : palette.textMuted,
    padding: '11px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: interaction.transition,
    fontFamily: fontStacks.ui,
    fontSize: 14,
    fontWeight: active ? 600 : 500,
    touchAction: interaction.touchAction,
  }
}

export function segmentedButtonStyle(active = false): CSSProperties {
  return {
    borderRadius: radii.pill,
    border: `1px solid ${active ? palette.copper : palette.borderStrong}`,
    background: active ? tradingDeskTheme.colors.accentSoft : palette.panelRaised,
    color: active ? tradingDeskTheme.colors.accentText : palette.textMuted,
    padding: '8px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    transition: interaction.transition,
    fontFamily: fontStacks.ui,
    fontSize: 13,
    fontWeight: active ? 600 : 500,
    touchAction: interaction.touchAction,
  }
}

export const primaryButtonStyle: CSSProperties = {
  border: `1px solid ${palette.copper}`,
  borderRadius: tradingDeskTheme.radius.pill,
  padding: '10px 14px',
  background: palette.copper,
  color: '#14100D',
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 13,
  fontWeight: 700,
  boxShadow: tradingDeskTheme.shadows.glow,
  transition: interaction.transition,
  touchAction: interaction.touchAction,
}

export const secondaryButtonStyle: CSSProperties = {
  border: `1px solid ${palette.borderStrong}`,
  borderRadius: tradingDeskTheme.radius.pill,
  padding: '8px 12px',
  background: tradingDeskTheme.colors.control,
  color: palette.ink,
  cursor: 'pointer',
  fontFamily: fontStacks.ui,
  fontSize: 13,
  fontWeight: 650,
  transition: interaction.transition,
  touchAction: interaction.touchAction,
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
    letterSpacing: 0,
  } satisfies CSSProperties,
  eyebrow: {
    fontFamily: fontStacks.mono,
    fontSize: 11,
    letterSpacing: 0,
    textTransform: 'uppercase',
    color: 'rgba(247, 242, 232, 0.56)',
  } satisfies CSSProperties,
  eyebrowLight: {
    fontFamily: fontStacks.mono,
    fontSize: 11,
    letterSpacing: 0,
    textTransform: 'uppercase',
    color: palette.textMuted,
  } satisfies CSSProperties,
  headerTitle: {
    margin: 0,
    fontFamily: fontStacks.display,
    fontSize: 30,
    lineHeight: 1.05,
    fontWeight: 800,
    color: palette.ink,
    letterSpacing: 0,
  } satisfies CSSProperties,
  sectionTitle: {
    margin: 0,
    fontFamily: fontStacks.display,
    fontSize: 18,
    lineHeight: 1.1,
    fontWeight: 800,
    color: palette.ink,
    letterSpacing: 0,
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
    borderRadius: radii.md,
    padding: '10px',
    boxShadow: 'none',
  } satisfies CSSProperties,
  mutedSection: {
    background: palette.panel,
    border: `1px solid ${palette.border}`,
    borderRadius: radii.lg,
    padding: spacing.md,
  } satisfies CSSProperties,
  listRow: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: radii.sm,
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
    gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))',
    gap: spacing.xs,
  } satisfies CSSProperties,
  stripItem: {
    background: palette.stone,
    borderRadius: radii.sm,
    border: `1px solid ${palette.border}`,
    padding: '7px 9px',
  } satisfies CSSProperties,
  drawerPre: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    background: palette.inspect,
    color: palette.inspectText,
    overflow: 'auto',
    maxWidth: '100%',
    fontSize: 12,
    lineHeight: 1.5,
    fontFamily: fontStacks.mono,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
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
    padding: '8px 10px',
    borderRadius: radii.sm,
    background: 'rgba(199, 146, 47, 0.14)',
    color: palette.warning,
    border: '1px solid rgba(199, 146, 47, 0.22)',
    lineHeight: 1.35,
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
