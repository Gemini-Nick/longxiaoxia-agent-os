import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const sourceApp = path.resolve(repoRoot, process.argv[2] || 'release/mac-arm64/隆小侠 Agent OS.app')
const installRoot = process.env.ELECTRON_INSTALL_ROOT || '/Applications'
const userInstallRoot = path.join(os.homedir(), 'Applications')
const productName = '隆小侠 Agent OS'
const bundleId = 'com.zhangqilong.longclaw.agentos'
const targetApp = path.join(installRoot, `${productName}.app`)
const legacyNamePatterns = [
  /隆小侠 Agent OS\.app$/i,
  /Longclaw Agent OS\.app$/i,
  /chan\.AI Agent OS\.app$/i,
  /Agent OS\.app$/i,
  /CodeAny\.app$/i,
]

function plistValue(appPath, key) {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist')
  if (!fs.existsSync(plistPath)) return ''
  try {
    return execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plistPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function isTargetFamily(appPath) {
  const name = path.basename(appPath)
  if (plistValue(appPath, 'CFBundleIdentifier') === bundleId) return true
  return legacyNamePatterns.some(pattern => pattern.test(name))
}

function directApps(root) {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.endsWith('.app'))
    .map(entry => path.join(root, entry.name))
}

function removePath(target) {
  if (!fs.existsSync(target)) return false
  fs.rmSync(target, { recursive: true, force: true })
  return true
}

function copyApp(source, target) {
  execFileSync('/usr/bin/ditto', [source, target], { stdio: 'inherit' })
}

if (!fs.existsSync(sourceApp)) {
  throw new Error(`Source app not found: ${sourceApp}`)
}

const candidates = [
  ...directApps(installRoot),
  ...directApps(userInstallRoot),
].filter(isTargetFamily)

const removed = []
for (const appPath of candidates) {
  if (removePath(appPath)) {
    removed.push(appPath)
  }
}

fs.mkdirSync(installRoot, { recursive: true })
copyApp(sourceApp, targetApp)

console.log(`Installed latest Electron app: ${targetApp}`)
console.log(`Removed old app bundle(s): ${removed.length}`)
for (const appPath of removed) {
  console.log(`- ${appPath}`)
}
