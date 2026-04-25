import React from 'react'

import type { LongclawOperatorAction } from '../../../../src/services/longclawControlPlane/models.js'
import {
  chromeStyles,
  palette,
  secondaryButtonStyle,
  statusBadgeStyle,
  surfaceStyles,
  utilityStyles,
} from '../designSystem.js'
import { type LongclawLocale, humanizeTokenLocale, t } from '../i18n.js'

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  marginBottom: 10,
}

const sectionHeadingBlockStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
}

const queueRowButtonStyle: React.CSSProperties = {
  ...surfaceStyles.listRow,
  ...surfaceStyles.listRowInteractive,
  cursor: 'pointer',
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

const queueRowTailStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 8,
  flexShrink: 0,
}

const queueRowNextActionStyle: React.CSSProperties = {
  color: palette.textMuted,
  fontSize: 12,
  lineHeight: 1.4,
  textAlign: 'right',
}

const statusStripValueStyle: React.CSSProperties = {
  fontFamily: chromeStyles.sectionTitle.fontFamily,
  fontSize: 22,
  lineHeight: 1,
  color: palette.ink,
  fontVariantNumeric: 'tabular-nums',
}

const statusStripLabelRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  color: palette.textMuted,
  fontSize: 12,
}

export function normalizePackRows<T>(rows: T[] | null | undefined): T[] {
  return Array.isArray(rows) ? rows : []
}

export function QueueRow({
  locale,
  title,
  meta,
  status,
  description,
  nextAction,
  active = false,
  onSelect,
}: {
  locale: LongclawLocale
  title: string
  meta?: string
  status?: string
  description?: string
  nextAction?: string
  active?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      style={
        active
          ? {
              ...queueRowButtonStyle,
              borderColor: 'rgba(184, 100, 59, 0.42)',
              background: 'rgba(184, 100, 59, 0.08)',
            }
          : queueRowButtonStyle
      }
      onClick={onSelect}
    >
      <div style={queueRowLeadStyle}>
        <div style={queueRowTitleStyle}>{title}</div>
        {meta && <div style={chromeStyles.quietMeta}>{meta}</div>}
        {description && <div style={queueRowDescriptionStyle}>{description}</div>}
      </div>
      <div style={queueRowTailStyle}>
        {nextAction && <div style={queueRowNextActionStyle}>{nextAction}</div>}
        {status && (
          <span style={statusBadgeStyle(status)}>{humanizeTokenLocale(locale, status)}</span>
        )}
      </div>
    </button>
  )
}

export function StatusStrip({
  items,
}: {
  locale: LongclawLocale
  items: Array<{ label: string; value: number; tone?: string }>
}) {
  return (
    <div style={surfaceStyles.strip}>
      {items.map(item => {
        return (
          <div key={item.label} style={surfaceStyles.stripItem}>
            <div style={statusStripValueStyle}>{item.value}</div>
            <div style={statusStripLabelRowStyle}>
              <span>{item.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Section({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section style={surfaceStyles.section}>
      <div style={sectionHeaderStyle}>
        <div style={sectionHeadingBlockStyle}>
          <h2 style={chromeStyles.sectionTitle}>{title}</h2>
          {subtitle && (
            <div
              style={{
                ...chromeStyles.subtleText,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 760,
              }}
              title={subtitle}
            >
              {subtitle}
            </div>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

export function ActionButtons({
  actions,
  onRun,
}: {
  actions: LongclawOperatorAction[]
  onRun: (action: LongclawOperatorAction) => Promise<void>
}) {
  if (actions.length === 0) return null
  return (
    <div style={utilityStyles.buttonCluster}>
      {actions.map(action => (
        <button
          key={action.action_id}
          type="button"
          style={secondaryButtonStyle}
          onClick={() => {
            void onRun(action)
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

export function PackListSection({
  locale,
  title,
  subtitle,
  rows,
  onOpen,
}: {
  locale: LongclawLocale
  title: string
  subtitle?: string
  rows?: Array<Record<string, unknown>> | null
  onOpen: (item: Record<string, unknown>) => void
}) {
  const normalizedRows = normalizePackRows(rows)

  return (
    <Section title={title} subtitle={subtitle}>
      <div style={utilityStyles.stackedList}>
        {normalizedRows.length === 0 ? (
          <div style={utilityStyles.emptyState}>{t(locale, 'empty.nothing_waiting')}</div>
        ) : (
          normalizedRows.map((row, index) => {
            const key = String(
              row.run_id ??
                row.review_id ??
                row.case_id ??
                row.site_slug ??
                row.connector_id ??
                index,
            )
            const titleValue = String(
              row.summary ??
                row.title ??
                row.run_id ??
                row.review_id ??
                row.case_id ??
                row.site_slug ??
                row.connector_id ??
                key,
            )
            const meta = String(
              row.lane ??
                row.capability ??
                row.failure_fingerprint ??
                row.summary ??
                row.channel ??
                '',
            ).trim()
            const status = String(row.status ?? row.recommended_action ?? '')
            return (
              <QueueRow
                key={key}
                locale={locale}
                title={titleValue}
                meta={meta || undefined}
                status={status || undefined}
                onSelect={() => onOpen(row)}
              />
            )
          })
        )}
      </div>
    </Section>
  )
}
