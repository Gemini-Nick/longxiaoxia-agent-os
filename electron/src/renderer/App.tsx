import React, { useState, useRef, useEffect, useCallback } from 'react'

declare global {
  interface Window {
    agentAPI: {
      query: (message: string) => Promise<{ ok: boolean }>
      clear: () => Promise<{ ok: boolean }>
      getMode: () => Promise<{ mode: string; alive: boolean }>
      getCwd: () => Promise<string>
      selectCwd: () => Promise<{ cwd: string; skills: SkillInfo[] } | null>
      setCwd: (path: string) => Promise<{ cwd: string; skills: SkillInfo[] } | null>
      getSkills: () => Promise<SkillInfo[]>
      onText: (cb: (text: string) => void) => () => void
      onTool: (cb: (tool: { name: string; input: any }) => void) => () => void
      onResult: (cb: (result: any) => void) => () => void
      onError: (cb: (error: string) => void) => () => void
    }
  }
}

type SkillInfo = { name: string; path: string; description: string; project?: string }

type Message = {
  role: 'user' | 'assistant' | 'tool' | 'error'
  content: string
  toolName?: string
  collapsed?: boolean
}

// ---- Markdown rendering (uses marked + highlight.js from OAS deps) ----

let markedInstance: any = null
let hljsInstance: any = null

function initMarked() {
  if (markedInstance) return
  try {
    // @ts-ignore — bundled from node_modules
    const { marked } = require('marked')
    const hljs = require('highlight.js/lib/core')
    // Register common languages
    ;['javascript', 'typescript', 'python', 'bash', 'json', 'go', 'sql', 'html', 'css'].forEach(lang => {
      try { hljs.registerLanguage(lang, require(`highlight.js/lib/languages/${lang}`)) } catch {}
    })
    marked.setOptions({
      highlight: (code: string, lang: string) => {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value
        }
        return hljs.highlightAuto(code).value
      },
      breaks: true,
    })
    markedInstance = marked
    hljsInstance = hljs
  } catch {
    // Fallback: no markdown rendering
  }
}

function renderMarkdown(text: string): string {
  initMarked()
  if (!markedInstance) return escapeHtml(text)
  try {
    return markedInstance.parse(text)
  } catch {
    return escapeHtml(text)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ---- Copy button for code blocks ----

function addCopyButtons(container: HTMLElement | null) {
  if (!container) return
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return
    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.textContent = 'Copy'
    btn.style.cssText = `
      position: absolute; top: 6px; right: 6px;
      background: #443e36; border: none; color: #b1ada1;
      padding: 2px 8px; border-radius: 4px; font-size: 11px;
      cursor: pointer; opacity: 0; transition: opacity 0.2s;
    `
    pre.style.position = 'relative'
    pre.addEventListener('mouseenter', () => { btn.style.opacity = '1' })
    pre.addEventListener('mouseleave', () => { btn.style.opacity = '0' })
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')?.textContent || pre.textContent || ''
      navigator.clipboard.writeText(code)
      btn.textContent = 'Copied!'
      setTimeout(() => { btn.textContent = 'Copy' }, 1500)
    })
    pre.appendChild(btn)
  })
}

// ---- ToolCard ----

function ToolCard({ name, input, collapsed, onToggle }: {
  name: string; input: string; collapsed: boolean; onToggle: () => void
}) {
  return (
    <div style={toolCardStyle}>
      <div style={toolHeaderStyle} onClick={onToggle}>
        <span style={{ color: '#6adb6a', fontFamily: 'monospace', fontSize: 12 }}>
          {collapsed ? '▶' : '▼'} {name}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>tool call</span>
      </div>
      {!collapsed && (
        <pre style={toolBodyStyle}><code>{input}</code></pre>
      )}
    </div>
  )
}

const toolCardStyle: React.CSSProperties = {
  background: 'var(--bg-tool)',
  border: '1px solid #2a3a2e',
  borderRadius: 8,
  margin: '8px 0',
  overflow: 'hidden',
}
const toolHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  cursor: 'pointer',
}
const toolBodyStyle: React.CSSProperties = {
  margin: 0,
  padding: '8px 12px',
  borderTop: '1px solid #2a3a2e',
  fontSize: 12,
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  color: 'var(--text-dim)',
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
}

// ---- Main App ----

// Smooth buffer: ACP chunks arrive in bursts, this drains them at steady pace
function useSmoothBuffer() {
  const bufferRef = useRef('')
  const displayRef = useRef('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onUpdateRef = useRef<((text: string) => void) | null>(null)

  const drain = useCallback(() => {
    if (bufferRef.current.length === 0) {
      timerRef.current = null
      return
    }
    // Drain speed adapts to backlog: big backlog = faster, small = slower (more natural)
    const backlog = bufferRef.current.length
    const chars = backlog > 40 ? 3 : backlog > 15 ? 2 : 1
    const delay = backlog > 40 ? 12 : backlog > 15 ? 18 : 25

    const next = bufferRef.current.slice(0, chars)
    bufferRef.current = bufferRef.current.slice(chars)
    displayRef.current += next
    onUpdateRef.current?.(displayRef.current)
    timerRef.current = setTimeout(drain, delay)
  }, [])

  const append = useCallback((text: string) => {
    bufferRef.current += text
    if (!timerRef.current) timerRef.current = setTimeout(drain, 10)
  }, [drain])

  const reset = useCallback(() => {
    bufferRef.current = ''
    displayRef.current = ''
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }, [])

  const flushAll = useCallback(() => {
    displayRef.current += bufferRef.current
    bufferRef.current = ''
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
    onUpdateRef.current?.(displayRef.current)
  }, [])

  const getFullText = useCallback(() => displayRef.current + bufferRef.current, [])

  return { append, reset, flushAll, getFullText, onUpdateRef }
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [cwd, setCwd] = useState('')
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [skillsPanelOpen, setSkillsPanelOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const mdRef = useRef<HTMLDivElement>(null)
  const currentTextRef = useRef('')
  const smooth = useSmoothBuffer()

  // Load initial cwd and skills
  useEffect(() => {
    window.agentAPI.getCwd().then(setCwd)
    window.agentAPI.getSkills().then(setSkills)
  }, [])

  const handleSelectCwd = async () => {
    const result = await window.agentAPI.selectCwd()
    if (result) {
      setCwd(result.cwd)
      setSkills(result.skills)
      // Clear conversation since cwd changed
      setMessages([])
      currentTextRef.current = ''
      smooth.reset()
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  // Add copy buttons after markdown renders
  useEffect(() => {
    addCopyButtons(mdRef.current)
  }, [messages])

  // Wire smooth buffer to update messages
  useEffect(() => {
    smooth.onUpdateRef.current = (text: string) => {
      setMessages(prev => {
        const last = prev[prev.length - 1]
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: text }]
        }
        return [...prev, { role: 'assistant', content: text }]
      })
    }
  }, [smooth])

  useEffect(() => {
    const offText = window.agentAPI.onText((text) => {
      setStreaming(true)
      currentTextRef.current += text
      smooth.append(text)
    })

    const offTool = window.agentAPI.onTool((tool) => {
      smooth.flushAll()
      setMessages(prev => [...prev, {
        role: 'tool',
        content: JSON.stringify(tool.input, null, 2),
        toolName: tool.name,
        collapsed: true,
      }])
    })

    const offResult = window.agentAPI.onResult(() => {
      smooth.flushAll()
      setBusy(false)
      setStreaming(false)
    })

    const offError = window.agentAPI.onError((error) => {
      smooth.flushAll()
      setMessages(prev => [...prev, { role: 'error', content: error }])
      setBusy(false)
      setStreaming(false)
    })

    return () => { offText(); offTool(); offResult(); offError() }
  }, [])

  const handleSubmit = useCallback(() => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setBusy(true)
    setStreaming(false)
    currentTextRef.current = ''
    smooth.reset()
    setMessages(prev => [...prev, { role: 'user', content: text }])
    window.agentAPI.query(text).catch(() => { setBusy(false) })
  }, [input, busy])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleClear = async () => {
    smooth.reset()
    await window.agentAPI.clear()
    setMessages([])
    currentTextRef.current = ''
  }

  const toggleToolCollapse = (idx: number) => {
    setMessages(prev => prev.map((m, i) =>
      i === idx ? { ...m, collapsed: !m.collapsed } : m
    ))
  }

  const showThinking = busy && !streaming

  return (
    <div style={layoutStyle}>
      {/* Sidebar */}
      {sidebarOpen && (
        <div style={sidebarStyle}>
          <div style={sidebarHeaderStyle}>
            <span style={{ fontSize: 18 }}>🦞</span>
            <span style={{ fontWeight: 600, fontSize: 14 }}>隆小虾</span>
          </div>
          <button onClick={handleClear} style={newChatBtnStyle}>
            + 新对话
          </button>
          <div style={sidebarSessionsStyle}>
            <div style={{ color: 'var(--text-dim)', fontSize: 11, padding: '8px 12px', textTransform: 'uppercase', letterSpacing: 1 }}>
              Today
            </div>
            {messages.length > 0 && (
              <div style={sessionItemStyle}>
                {messages.find(m => m.role === 'user')?.content.slice(0, 30) || '当前对话'}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div style={mainAreaStyle}>
        {/* Top bar: sidebar toggle + cwd + skills */}
        <div style={topBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={toggleBtnStyle}>
              {sidebarOpen ? '◀' : '▶'}
            </button>
            <button onClick={handleSelectCwd} style={cwdBtnStyle} title={cwd}>
              📁 {cwd ? cwd.split('/').slice(-2).join('/') : '选择目录'}
            </button>
            {skills.length > 0 && (
              <button
                onClick={() => setSkillsPanelOpen(!skillsPanelOpen)}
                style={{ ...toggleBtnStyle, color: 'var(--accent)' }}
              >
                ⚡ {skills.length} Skills
              </button>
            )}
          </div>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>ACP Mode</span>
        </div>

        {/* Skills panel — grouped by project */}
        {skillsPanelOpen && skills.length > 0 && (
          <div style={skillsPanelStyle}>
            {Object.entries(
              skills.reduce((groups, skill) => {
                const key = skill.project || 'other'
                ;(groups[key] = groups[key] || []).push(skill)
                return groups
              }, {} as Record<string, SkillInfo[]>)
            ).map(([project, items]) => (
              <div key={project} style={{ marginBottom: 8 }}>
                <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {project}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {items.map((skill, i) => (
                    <div key={i} style={skillItemStyle} title={skill.description}>
                      <span style={{ color: skill.name.includes('CLAUDE.md') ? 'var(--accent)' : '#6adb6a', fontSize: 11, fontFamily: 'monospace' }}>
                        {skill.name.includes('CLAUDE.md') ? '📄' : '⚡'} {skill.name.replace(`${project}/`, '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div style={messagesContainerStyle} ref={mdRef}>
          <div style={messagesInnerStyle}>
            {messages.length === 0 && (
              <div style={emptyStyle}>
                <div style={{ fontSize: 56, marginBottom: 16 }}>🦞</div>
                <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>隆小虾 Agent OS</div>
                <div style={{ color: 'var(--text-dim)', fontSize: 14 }}>有什么可以帮你的？</div>
              </div>
            )}

            {messages.map((msg, i) => {
              if (msg.role === 'user') {
                return (
                  <div key={i} style={userMsgStyle}>
                    <div style={labelStyle}>You</div>
                    <div style={{ lineHeight: 1.6 }}>{msg.content}</div>
                  </div>
                )
              }
              if (msg.role === 'assistant') {
                const isLast = i === messages.length - 1
                const isStreaming = isLast && streaming
                return (
                  <div key={i} style={assistantMsgStyle}>
                    <div style={labelStyle}>🦞 隆小虾</div>
                    {isStreaming ? (
                      // Streaming: render plain text for smooth append, no Markdown parse flicker
                      <pre style={streamingTextStyle}>{msg.content}<span style={cursorStyle}>▌</span></pre>
                    ) : (
                      // Finished: render full Markdown
                      <div
                        className="md-content"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                      />
                    )}
                  </div>
                )
              }
              if (msg.role === 'tool') {
                return (
                  <ToolCard
                    key={i}
                    name={msg.toolName || 'tool'}
                    input={msg.content}
                    collapsed={msg.collapsed !== false}
                    onToggle={() => toggleToolCollapse(i)}
                  />
                )
              }
              if (msg.role === 'error') {
                return (
                  <div key={i} style={errorMsgStyle}>
                    <div style={{ ...labelStyle, color: '#ff6b6b' }}>Error</div>
                    <div>{msg.content}</div>
                  </div>
                )
              }
              return null
            })}

            {showThinking && (
              <div style={assistantMsgStyle}>
                <div style={labelStyle}>🦞 隆小虾</div>
                <div style={{ color: 'var(--text-dim)', animation: 'pulse 1.5s ease-in-out infinite' }}>
                  思考中...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input area */}
        <div style={inputWrapperStyle}>
          <div style={inputContainerStyle}>
            <textarea
              style={textareaStyle}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="发送消息..."
              rows={1}
              disabled={busy}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement
                t.style.height = 'auto'
                t.style.height = Math.min(t.scrollHeight, 200) + 'px'
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={busy || !input.trim()}
              style={{
                ...sendBtnStyle,
                opacity: busy || !input.trim() ? 0.3 : 1,
                background: busy || !input.trim() ? 'var(--border)' : 'var(--accent)',
              }}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Styles ----

const layoutStyle: React.CSSProperties = {
  display: 'flex',
  height: '100vh',
  background: 'var(--bg)',
}

const sidebarStyle: React.CSSProperties = {
  width: 240,
  minWidth: 240,
  background: 'var(--bg-sidebar)',
  borderRight: '1px solid var(--border)',
  display: 'flex',
  flexDirection: 'column',
}

const sidebarHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '16px 16px 12px',
}

const newChatBtnStyle: React.CSSProperties = {
  margin: '0 12px',
  padding: '8px 12px',
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--text)',
  cursor: 'pointer',
  fontSize: 13,
  textAlign: 'left',
}

const sidebarSessionsStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  marginTop: 12,
}

const sessionItemStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  color: 'var(--text-label)',
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  borderRadius: 6,
  margin: '0 8px',
}

const mainAreaStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
}

const topBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
  borderBottom: '1px solid var(--border)',
  height: 40,
}

const toggleBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-dim)',
  cursor: 'pointer',
  fontSize: 14,
  padding: '4px 8px',
}

const cwdBtnStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text-label)',
  cursor: 'pointer',
  fontSize: 12,
  padding: '4px 10px',
  maxWidth: 200,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const skillsPanelStyle: React.CSSProperties = {
  background: 'var(--bg-sidebar)',
  borderBottom: '1px solid var(--border)',
  padding: '8px 16px',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
}

const skillItemStyle: React.CSSProperties = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '4px 10px',
  display: 'flex',
  alignItems: 'center',
  cursor: 'default',
}

const messagesContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  justifyContent: 'center',
}

const messagesInnerStyle: React.CSSProperties = {
  maxWidth: 768,
  width: '100%',
  padding: '24px 24px 16px',
}

const emptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '60vh',
}

const userMsgStyle: React.CSSProperties = {
  background: 'var(--bg-user)',
  borderRadius: 12,
  padding: '12px 16px',
  marginBottom: 16,
}

const assistantMsgStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: '4px 0',
}

const errorMsgStyle: React.CSSProperties = {
  background: '#2a1515',
  border: '1px solid #4a2020',
  borderRadius: 12,
  padding: '12px 16px',
  marginBottom: 16,
}

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-label)',
  marginBottom: 6,
}

const streamingTextStyle: React.CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'inherit',
  fontSize: 14,
  lineHeight: 1.6,
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'var(--text)',
}

const cursorStyle: React.CSSProperties = {
  color: 'var(--accent)',
  animation: 'blink 0.8s step-end infinite',
  fontSize: 16,
}

const inputWrapperStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  padding: '12px 24px 20px',
}

const inputContainerStyle: React.CSSProperties = {
  maxWidth: 768,
  width: '100%',
  display: 'flex',
  alignItems: 'flex-end',
  gap: 8,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '10px 12px 10px 16px',
}

const textareaStyle: React.CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  color: 'var(--text)',
  fontSize: 14,
  lineHeight: 1.5,
  resize: 'none',
  outline: 'none',
  fontFamily: 'inherit',
  maxHeight: 200,
  overflow: 'auto',
}

const sendBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: '50%',
  border: 'none',
  color: '#fff',
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}
