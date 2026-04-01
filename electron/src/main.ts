import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { createBackend, AgentBackend, AgentMode } from './agent-backend.js'

function log(...args: any[]) {
  const msg = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
  process.stderr.write(`[longxiaoxia] ${msg}\n`)
}

let mainWindow: BrowserWindow | null = null
let backend: AgentBackend | null = null
let currentCwd = process.env.AGENT_CWD || app.getPath('home')

function getAgentMode(): AgentMode {
  return (process.env.AGENT_MODE as AgentMode) || 'acp'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    y: 30,
    title: '隆小虾 Agent OS',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.ELECTRON_DEV) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  }
}

async function ensureBackend(): Promise<AgentBackend> {
  if (backend && backend.alive()) return backend

  const mode = getAgentMode()
  log(`initializing backend: mode=${mode} cwd=${currentCwd}`)

  if (mode === 'acp') {
    backend = createBackend('acp', { cwd: currentCwd })
  } else {
    backend = createBackend('sdk', {
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      cwd: currentCwd,
      systemPrompt: '你是隆小虾，一个金融业务 AI 助手。你可以读写文件、执行命令、搜索代码。回复使用中文。',
    })
  }

  await backend.connect()
  return backend
}

// --- Skills discovery ---

interface SkillInfo {
  name: string
  path: string
  description: string
  project?: string
}

// Known project directories to scan for skills
const SKILL_SCAN_DIRS = [
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'Signals'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'aippt'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'aippt', 'ppt-master'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'Chanless'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'gstack'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'superpowers'),
  path.join(os.homedir(), 'Desktop', 'github代码仓库', 'compound-engineering-plugin'),
]

function scanDirForSkills(dir: string, projectName: string): SkillInfo[] {
  const skills: SkillInfo[] = []
  if (!fs.existsSync(dir)) return skills

  // CLAUDE.md
  const claudeMd = path.join(dir, 'CLAUDE.md')
  if (fs.existsSync(claudeMd)) {
    const content = fs.readFileSync(claudeMd, 'utf-8')
    const title = content.split('\n').find(l => l.startsWith('# '))?.replace('# ', '') || projectName
    skills.push({ name: `${projectName}/CLAUDE.md`, path: claudeMd, description: title.slice(0, 80), project: projectName })
  }

  // .claude/skills/
  const skillsDir = path.join(dir, '.claude', 'skills')
  if (fs.existsSync(skillsDir)) {
    try {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const skillMd = path.join(skillsDir, entry.name, 'SKILL.md')
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf-8')
          const desc = content.split('\n').find(l => l.trim() && !l.startsWith('#') && !l.startsWith('---')) || ''
          skills.push({ name: entry.name, path: skillMd, description: desc.trim().slice(0, 80), project: projectName })
        }
      }
    } catch {}
  }

  return skills
}

function discoverAllSkills(): SkillInfo[] {
  const all: SkillInfo[] = []
  for (const dir of SKILL_SCAN_DIRS) {
    const projectName = path.basename(dir)
    all.push(...scanDirForSkills(dir, projectName))
  }
  if (!SKILL_SCAN_DIRS.includes(currentCwd)) {
    all.push(...scanDirForSkills(currentCwd, path.basename(currentCwd)))
  }
  return all
}

function discoverSkills(cwd: string): SkillInfo[] {
  return discoverAllSkills()
}

// --- IPC Handlers ---

async function handleQuery(_event: Electron.IpcMainInvokeEvent, message: string) {
  const sender = _event.sender
  const b = await ensureBackend()

  await b.query(message, (event) => {
    log(`event: type=${event.type} text="${(event.text || '').slice(0, 30)}"`)
    switch (event.type) {
      case 'text':
        sender.send('agent:text', event.text)
        break
      case 'tool':
        sender.send('agent:tool', { name: event.toolName, input: event.toolInput })
        break
      case 'result':
        sender.send('agent:result', event.result)
        break
      case 'error':
        sender.send('agent:error', event.error)
        break
    }
  })

  return { ok: true }
}

app.whenReady().then(() => {
  // Agent
  ipcMain.handle('agent:query', handleQuery)
  ipcMain.handle('agent:clear', async () => {
    backend?.clear()
    return { ok: true }
  })
  ipcMain.handle('agent:mode', () => {
    return { mode: getAgentMode(), alive: backend?.alive() ?? false }
  })

  // CWD management
  ipcMain.handle('cwd:get', () => currentCwd)

  ipcMain.handle('cwd:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
      title: '选择项目目录',
      defaultPath: currentCwd,
    })
    if (!result.canceled && result.filePaths[0]) {
      const newCwd = result.filePaths[0]
      currentCwd = newCwd
      if (backend) {
        backend.close()
        backend = null
      }
      log(`cwd changed to: ${newCwd}`)
      return { cwd: newCwd, skills: discoverSkills(newCwd) }
    }
    return null
  })

  ipcMain.handle('cwd:set', (_event, newCwd: string) => {
    if (fs.existsSync(newCwd)) {
      currentCwd = newCwd
      if (backend) {
        backend.close()
        backend = null
      }
      log(`cwd set to: ${newCwd}`)
      return { cwd: newCwd, skills: discoverSkills(newCwd) }
    }
    return null
  })

  // Skills
  ipcMain.handle('skills:list', () => discoverAllSkills())

  createWindow()
})

app.on('window-all-closed', () => {
  backend?.close()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
