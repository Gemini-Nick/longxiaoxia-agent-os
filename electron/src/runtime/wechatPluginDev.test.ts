import fs from 'fs'
import os from 'os'
import path from 'path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  classifyWeChatRoute,
  completeWeChatBindingSession,
  createWeChatBindingSession,
  mergePluginDevIssue,
  persistWeChatBindingStatus,
  readWeChatBindingStatus,
  readPluginDevState,
  registerPluginDevArtifact,
  routeWeChatMessage,
  runPluginDevCi,
  startPluginDevImplementation,
  updateWeChatBindingScanStatus,
} from './wechatPluginDev.js'

const tempDirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('wechatPluginDev', () => {
  it('creates a scannable pending binding and completes it', () => {
    const root = makeTempDir('longclaw-wechat-binding-')
    const bindingPath = path.join(root, 'wechat-binding.json')

    const pending = createWeChatBindingSession(bindingPath, {
      qrUrlBase: 'http://192.168.0.2:18744',
    })
    expect(pending.state).toBe('qr_pending')
    expect(pending.binding_session_id).toMatch(/^bind-/)
    expect(pending.qr_url).toContain('http://192.168.0.2:18744/wechat/bind?session=')

    const bound = completeWeChatBindingSession(bindingPath, {
      bindingSessionId: pending.binding_session_id,
      wechatUserId: 'wechat-user-1',
      displayName: '微信用户',
    })
    expect(bound.state).toBe('bound')
    expect(bound.wechat_user_id).toBe('wechat-user-1')
    expect(bound.display_name).toBe('微信用户')
    expect(bound.qr_url).toBeUndefined()
    expect(readWeChatBindingStatus(bindingPath).state).toBe('bound')
  })

  it('records iLink identity without persisting bot secrets in renderer state', () => {
    const root = makeTempDir('longclaw-wechat-ilink-')
    const bindingPath = path.join(root, 'wechat-binding.json')

    const pending = createWeChatBindingSession(bindingPath, {
      provider: 'ilink_service_account',
      qrUrl: 'https://ilinkai.weixin.qq.com/login/example',
      ilinkQrcode: 'qr-ticket-1',
      ilinkBaseurl: 'https://ilinkai.weixin.qq.com',
    })
    expect(pending.provider).toBe('ilink_service_account')
    expect(pending.identity_status).toBe('ilink_pending')
    expect(pending.scan_status).toBe('wait')

    const bound = completeWeChatBindingSession(bindingPath, {
      bindingSessionId: pending.binding_session_id,
      provider: 'ilink_service_account',
      wechatUserId: 'ouser@im.wechat',
      ilinkBotId: 'bot@im.bot',
      ilinkUserId: 'ouser@im.wechat',
      ilinkBaseurl: 'https://ilinkai.weixin.qq.com',
      botTokenPresent: true,
      accountPath: path.join(root, 'accounts', 'bot-im-bot.json'),
      identityStatus: 'ilink_verified',
    })

    expect(bound.state).toBe('bound')
    expect(bound.identity_status).toBe('ilink_verified')
    expect(bound.ilink_user_id).toBe('ouser@im.wechat')
    expect(bound.ilink_bot_id).toBe('bot@im.bot')
    expect(bound.bot_token_present).toBe(true)
    const rendererState = readWeChatBindingStatus(bindingPath) as unknown as Record<string, unknown>
    expect(rendererState.bot_token).toBeUndefined()
    expect(JSON.stringify(rendererState)).not.toContain('secret-token')
  })

  it('expires stale binding sessions before completion', () => {
    const root = makeTempDir('longclaw-wechat-expired-')
    const bindingPath = path.join(root, 'wechat-binding.json')
    const pending = createWeChatBindingSession(bindingPath)

    persistWeChatBindingStatus(bindingPath, {
      ...pending,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    expect(readWeChatBindingStatus(bindingPath).state).toBe('expired')
    expect(() => completeWeChatBindingSession(bindingPath)).toThrow(/expired/i)
  })

  it('persists expired scan status after the local expiry clock has elapsed', () => {
    const root = makeTempDir('longclaw-wechat-expired-scan-')
    const bindingPath = path.join(root, 'wechat-binding.json')
    const pending = createWeChatBindingSession(bindingPath, {
      provider: 'ilink_service_account',
      qrUrl: 'https://ilinkai.weixin.qq.com/login/example',
      ilinkQrcode: 'qr-ticket-1',
      expiresInMs: 1,
    })

    persistWeChatBindingStatus(bindingPath, {
      ...pending,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    })

    const expired = updateWeChatBindingScanStatus(bindingPath, {
      bindingSessionId: pending.binding_session_id,
      scanStatus: 'expired',
      identityStatus: 'ilink_failed',
      identityNote: 'QR expired before confirmation.',
    })

    expect(expired.state).toBe('expired')
    expect(expired.scan_status).toBe('expired')
    expect(expired.identity_status).toBe('ilink_failed')
    expect(readWeChatBindingStatus(bindingPath).scan_status).toBe('expired')
  })

  it('routes explicit plugin messages into reusable capability issues', () => {
    const root = makeTempDir('longclaw-wechat-plugin-')
    const bindingPath = path.join(root, 'wechat-binding.json')
    const pluginDevPath = path.join(root, 'plugin-dev.json')

    createWeChatBindingSession(bindingPath)
    const receipt = routeWeChatMessage({
      bindingPath,
      pluginDevPath,
      text: '/plugin 做一个可以整理微信复盘的 skill',
      targetRepo: '/repo/longclaw-agent-os',
    })
    const state = readPluginDevState(pluginDevPath)

    expect(receipt.route).toBe('dev_plugin')
    expect(receipt.requires_confirmation).toBe(true)
    expect(receipt.plugin_issue?.kind).toBe('plugin')
    expect(state.issues).toHaveLength(1)
    expect(state.issues[0]?.status).toBe('issue_created')
    expect(state.issues[0]?.branch_name).toContain('wechat/plugin-')
  })

  it('keeps the GitLab-like issue lifecycle provider-neutral', () => {
    const root = makeTempDir('longclaw-plugin-lifecycle-')
    const bindingPath = path.join(root, 'wechat-binding.json')
    const pluginDevPath = path.join(root, 'plugin-dev.json')

    const receipt = routeWeChatMessage({
      bindingPath,
      pluginDevPath,
      text: '/skill 做一个股票复盘 skill',
      targetRepo: '/repo/longclaw-agent-os',
    })
    const issueId = receipt.plugin_issue!.issue_id

    expect(startPluginDevImplementation(pluginDevPath, issueId).status).toBe('branch_created')
    const ciIssue = runPluginDevCi(pluginDevPath, issueId)
    expect(ciIssue.status).toBe('mr_ready')
    expect(ciIssue.ci_status).toBe('passed')
    expect(ciIssue.merge_request?.provider).toBe('local_git')
    expect(mergePluginDevIssue(pluginDevPath, issueId).merge_status).toBe('merged')
    expect(registerPluginDevArtifact(pluginDevPath, issueId).status).toBe('registered')
  })

  it('uses explicit commands before semantic fallback', () => {
    expect(classifyWeChatRoute('/backtest 000001').route).toBe('backtest')
    expect(classifyWeChatRoute('这个能力以后要复用成插件').route).toBe('dev_plugin')
    expect(classifyWeChatRoute('写一段复盘笔记进知识库').route).toBe('knowledge_note')
  })
})
