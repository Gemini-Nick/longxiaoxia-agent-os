import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  type RuntimeStatusSummary,
  formatLaunchFailureMessage,
  launchDisabledState,
  workModeAvailabilityNotice,
} from './App.js'
import {
  buttonStyleForState,
  palette,
  primaryButtonStyle,
} from './designSystem.js'
import { PackWorkspace } from './workspaces/PackWorkspace.js'
import TaskWorkspace, { onComposerKeyDown } from './workspaces/TaskWorkspace.js'
import WeChatWorkspace from './workspaces/WeChatWorkspace.js'

function makeRuntimeStatus(
  overrides: Partial<RuntimeStatusSummary> = {},
): RuntimeStatusSummary {
  return {
    longclawCoreConnected: true,
    longclawCoreBaseUrl: 'http://127.0.0.1:8642',
    dueDiligenceConnected: false,
    dueDiligenceBaseUrl: undefined,
    signalsAvailable: false,
    signalsStateRoot: undefined,
    signalsWebBaseUrl: undefined,
    signalsWeb2BaseUrl: undefined,
    localRuntimeSeat: 'acp_bridge',
    localRuntimeAvailable: true,
    localRuntimeApiUrl: undefined,
    localRuntimeApiAvailable: false,
    localAcpAvailable: true,
    localAcpScript: '/tmp/mock-acp.sh',
    localAcpSource: 'config',
    localRuntimeSeatPreference: 'auto',
    localRuntimeSeatOverrideActive: false,
    devMachineAcpTakeover: false,
    runtimeProfile: 'dev_local_acp_bridge',
    stackEnvLoaded: true,
    stackEnvPath: '/Users/zhangqilong/.longclaw/runtime-v2/stack.env',
    ...overrides,
  }
}

describe('task launch gating', () => {
  it('keeps launchDisabled aligned with selectedModeNotice', () => {
    expect(launchDisabledState(false, '  调查这家公司  ', '云端执行需要先连接 Longclaw Core。')).toEqual({
      disabled: true,
      disabledReason: '云端执行需要先连接 Longclaw Core。',
    })
    expect(launchDisabledState(false, '  调查这家公司  ', undefined)).toEqual({
      disabled: false,
      disabledReason: undefined,
    })
  })

  it('blocks cloud and weclaw modes when Longclaw Core is disconnected', () => {
    const runtimeStatus = makeRuntimeStatus({ longclawCoreConnected: false })
    expect(workModeAvailabilityNotice('zh-CN', 'cloud_sandbox', runtimeStatus, 'auto')).toBe(
      '云端执行需要先连接 Longclaw Core。',
    )
    expect(workModeAvailabilityNotice('zh-CN', 'weclaw_dispatch', runtimeStatus, 'auto')).toBe(
      '微信接力需要 Longclaw Core，并且要有本地 ACP bridge 或 Local Runtime API。',
    )
  })

  it('formats transport failures with control-plane guidance', () => {
    const message = formatLaunchFailureMessage(
      'zh-CN',
      new Error("Error invoking remote method 'launch:submit': TypeError: fetch failed"),
      makeRuntimeStatus(),
      'cloud_sandbox',
    )

    expect(message).toContain('http://127.0.0.1:8642')
    expect(message).toContain('/Users/zhangqilong/.longclaw/runtime-v2/stack.env')
    expect(message).toContain('Hermes Agent OS')
  })
})

describe('TaskWorkspace launch affordances', () => {
  it('renders the disabled launch reason and aria description', () => {
    const markup = renderToStaticMarkup(
      React.createElement(TaskWorkspace, {
        locale: 'zh-CN',
        loading: false,
        onRefresh: () => undefined,
        contextItems: [],
        statusItems: [],
        workModeOptions: [{ value: 'local', label: '本机处理' }],
        selectedWorkMode: 'local',
        onSelectWorkMode: () => undefined,
        selectedModeSpec: {
          label: '本机处理',
          summary: '本机优先',
          detail: '本地开发机执行',
          workspaceLabel: 'workspace',
          surfaceLabel: 'electron_home',
          launchButtonLabel: '发起本机任务',
          placeholder: '输入任务',
        },
        selectedModeNotice: '本机处理需要本地 ACP bridge 或 LONGCLAW_LOCAL_RUNTIME_API_URL。',
        launchInput: '调查这家公司',
        onLaunchInputChange: () => undefined,
        onSubmitLaunch: () => undefined,
        launchBusy: false,
        launchDisabled: true,
        onDisabledLaunchAttempt: () => undefined,
        onClearDraft: () => undefined,
        onResetRuntime: () => undefined,
        resetRuntimeDisabled: false,
        capabilitySuggestions: [],
        onUseCapability: () => undefined,
        localSeatPreference: 'auto',
        localSeatPreferenceOptions: [],
        onSelectLocalSeatPreference: () => undefined,
        localSeatBannerMessage: null,
        taskFlowFilter: 'all',
        onSelectTaskFlowFilter: () => undefined,
        taskFlowItems: [],
        onOpenTaskFlowItem: () => undefined,
        continueThreads: [],
        onSelectContinueThread: () => undefined,
        pendingItems: [],
        onSelectPendingItem: () => undefined,
      }),
    )

    expect(markup).toContain('task-launch-disabled-reason')
    expect(markup).toContain('aria-describedby="task-launch-disabled-reason"')
    expect(markup).toContain('disabled=""')
    expect(markup).toContain('本机处理需要本地 ACP bridge 或 LONGCLAW_LOCAL_RUNTIME_API_URL。')
  })

  it('reuses the disabled reason for Cmd/Ctrl+Enter', async () => {
    const preventDefault = vi.fn()
    const onSubmitLaunch = vi.fn()
    const onDisabledLaunchAttempt = vi.fn()

    onComposerKeyDown(
      {
        metaKey: true,
        ctrlKey: false,
        key: 'Enter',
        preventDefault,
      } as React.KeyboardEvent<HTMLTextAreaElement>,
      {
        onSubmitLaunch,
        launchDisabled: true,
        disabledReason: '云端执行需要先连接 Longclaw Core。',
        onDisabledLaunchAttempt,
      },
    )

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(onSubmitLaunch).not.toHaveBeenCalled()
    expect(onDisabledLaunchAttempt).toHaveBeenCalledWith('云端执行需要先连接 Longclaw Core。')
  })

  it('uses a dedicated disabled primary button style', () => {
    const style = buttonStyleForState(primaryButtonStyle, true, 'primary')

    expect(style.background).toBe(palette.stone)
    expect(style.color).toBe(palette.textMuted)
    expect(style.cursor).toBe('not-allowed')
    expect(style.opacity).toBe(1)
  })
})

describe('Chinese IA surface scoping', () => {
  it('keeps strategy and backtest surfaces distinct', () => {
    const signalsDashboard = {
      pack_id: 'signals',
      status: 'ready',
      overview: {
        market_regime: { label: 'Risk-on', lianban_max: 3 },
        cluster_summary: {},
        review_summary: {},
        data_warning: '',
      },
      buy_candidates: [{ symbol: '000001.SZ' }],
      sell_warnings: [{ symbol: '000002.SZ' }],
      chart_context: {
        symbol: '000001.SZ',
        freq: '1D',
        latest_signal: 'buy',
        ohlcv_preview: [{ time: '2026-04-22', close: 11.2 }],
        key_levels: [{ name: 'support' }],
        signal_markers: [{ type: 'entry' }],
        conclusion: '突破后回踩确认',
      },
      review_runs: [{ run_id: 'review-1', summary: 'Review run', created_at: '2026-04-22T10:00:00Z' }],
      backtest_summary: { total: 12, evaluated: 8, pending: 4 },
      backtest_jobs: [{ job_id: 'bt-1' }],
      pending_backlog_preview: [
        {
          symbol: '000001.SZ',
          signal_date: '2026-04-22',
          signal_type: 'buy',
          freq: '1D',
        },
      ],
      connector_health: [{ connector_id: 'signals-web2', status: 'degraded', summary: 'lagging' }],
      diagnostics: [{ diagnostic_id: 'diag-1', label: 'web2', detail: 'lagging', status: 'degraded' }],
      deep_links: [{ link_id: 'link-1', label: 'Open web2', url: 'https://example.com' }],
      operator_actions: [],
      recent_runs: [],
    }

    const strategyMarkup = renderToStaticMarkup(
      React.createElement(PackWorkspace, {
        locale: 'zh-CN',
        surface: 'strategy',
        dashboard: signalsDashboard,
        localizedNotice: null,
        onRunAction: async () => undefined,
        onOpenRun: async () => undefined,
        onOpenRecord: () => undefined,
      }),
    )

    const backtestMarkup = renderToStaticMarkup(
      React.createElement(PackWorkspace, {
        locale: 'zh-CN',
        surface: 'backtest',
        dashboard: signalsDashboard,
        localizedNotice: null,
        onRunAction: async () => undefined,
        onOpenRun: async () => undefined,
        onOpenRecord: () => undefined,
      }),
    )

    expect(strategyMarkup).toContain('没有配置 LONGCLAW_SIGNALS_WEB_BASE_URL')
    expect(strategyMarkup).toContain('买入候选')
    expect(strategyMarkup).not.toContain('回测作业')
    expect(backtestMarkup).toContain('回测作业')
    expect(backtestMarkup).toContain('回测输入候选')
    expect(backtestMarkup).not.toContain('没有配置 LONGCLAW_SIGNALS_WEB_BASE_URL')
  })

  it('shows linked work items inside the WeChat session detail', () => {
    const sessionSummary = {
      sessionId: 'session-1',
      canonicalSessionId: 'canonical-1',
      duplicateSessionIds: [],
      hidden: false,
      archived: false,
      filePath: '/tmp/session-1.json',
      userId: 'wx-user',
      updatedAt: '2026-04-22T10:00:00Z',
      title: '微信策略线索',
      preview: '请看这个标的',
      messageCount: 2,
      agentReplyCount: 1,
      mediaCount: 0,
      sourceLabel: 'WeChat',
      canonicalMetadata: {
        canonical_session_id: 'canonical-1',
        canonical_user_id: 'user-1',
        context_token: 'ctx-1',
      },
    }

    const markup = renderToStaticMarkup(
      React.createElement(WeChatWorkspace, {
        locale: 'zh-CN',
        viewportTier: 'wide',
        sessions: [sessionSummary],
        sourceStatus: {
          workspaceRoot: '/tmp/weclaw',
          workspaceSource: 'config',
          sessionsDir: '/tmp/weclaw/sessions',
          sessionsDirExists: true,
          sessionCount: 1,
        },
        search: '',
        sourceFilter: 'all',
        visibilityFilter: 'active',
        selectedSessionId: 'session-1',
        selectedSession: {
          ...sessionSummary,
          messages: [],
          media: [],
        },
        linkedTasks: [],
        linkedRuns: [],
        linkedWorkItems: [
          {
            work_item_id: 'wi-1',
            title: '补抓工商资料',
            summary: '需要重新执行 RPA 抓取',
            severity: 'warning',
            status: 'open',
            pack_id: 'due_diligence',
            kind: 'repair_required',
            created_at: '2026-04-22T10:00:00Z',
            updated_at: '2026-04-22T11:00:00Z',
            operator_actions: [],
            metadata: {},
          },
        ],
        canonicalJumpContext: {
          canonicalSessionId: 'canonical-1',
          canonicalUserId: 'user-1',
          contextToken: 'ctx-1',
        },
        preview: null,
        onSearchChange: () => undefined,
        onSourceFilterChange: () => undefined,
        onVisibilityFilterChange: () => undefined,
        onSelectSession: () => undefined,
        onClearSelection: () => undefined,
        onToggleHidden: () => undefined,
        onToggleArchived: () => undefined,
        onOpenLinkedTask: () => undefined,
        onOpenLinkedRun: () => undefined,
        onOpenLinkedWorkItem: () => undefined,
        onOpenAttachment: () => undefined,
      }),
    )

    expect(markup).toContain('补抓工商资料')
    expect(markup).toContain('查看待办')
    expect(markup).toContain('Canonical 会话')
  })
})
