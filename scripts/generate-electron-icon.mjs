import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const resourcesDir = path.join(repoRoot, 'electron', 'build-resources')
const iconsetDir = path.join(resourcesDir, 'icon.iconset')
const svgPath = path.join(resourcesDir, 'icon.svg')
const pngPath = path.join(resourcesDir, 'icon.png')
const icnsPath = path.join(resourcesDir, 'icon.icns')

const sizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="128" y1="72" x2="896" y2="944" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#172436"/>
      <stop offset="0.56" stop-color="#0A1017"/>
      <stop offset="1" stop-color="#030508"/>
    </linearGradient>
    <linearGradient id="rim" x1="92" y1="96" x2="918" y2="928" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#4FA3FF"/>
      <stop offset="0.52" stop-color="#24D7C0"/>
      <stop offset="1" stop-color="#EFB35E"/>
    </linearGradient>
    <linearGradient id="mark" x1="222" y1="754" x2="802" y2="244" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#24D7C0"/>
      <stop offset="0.48" stop-color="#4FA3FF"/>
      <stop offset="1" stop-color="#EAF3FF"/>
    </linearGradient>
    <linearGradient id="gold" x1="534" y1="680" x2="818" y2="296" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F2A84A"/>
      <stop offset="0.76" stop-color="#FFE3A6"/>
      <stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="38" flood-color="#000000" flood-opacity="0.46"/>
    </filter>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="10" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect x="58" y="58" width="908" height="908" rx="214" fill="url(#bg)" filter="url(#shadow)"/>
  <rect x="90" y="90" width="844" height="844" rx="190" fill="none" stroke="url(#rim)" stroke-width="20" opacity="0.9"/>
  <rect x="168" y="180" width="688" height="620" rx="72" fill="#0D1620" opacity="0.7" stroke="#1C2C3D" stroke-width="12"/>

  <g opacity="0.16" stroke="#CFE8FF" stroke-width="8" stroke-linecap="round">
    <line x1="230" y1="336" x2="790" y2="336"/>
    <line x1="230" y1="470" x2="790" y2="470"/>
    <line x1="230" y1="604" x2="790" y2="604"/>
    <line x1="230" y1="738" x2="790" y2="738"/>
  </g>

  <g opacity="0.86" stroke-linecap="round">
    <line x1="310" y1="504" x2="310" y2="668" stroke="#24D7C0" stroke-width="18"/>
    <rect x="286" y="558" width="48" height="74" rx="13" fill="#24D7C0"/>
    <line x1="424" y1="414" x2="424" y2="672" stroke="#FF4F64" stroke-width="18"/>
    <rect x="400" y="484" width="48" height="108" rx="13" fill="#FF4F64"/>
    <line x1="538" y1="360" x2="538" y2="628" stroke="#24D7C0" stroke-width="18"/>
    <rect x="514" y="434" width="48" height="118" rx="13" fill="#24D7C0"/>
  </g>

  <path d="M252 708 C360 612 430 624 512 516 C596 406 654 384 784 258" fill="none" stroke="#03070D" stroke-width="96" stroke-linecap="round" stroke-linejoin="round" opacity="0.72"/>
  <path d="M254 708 C362 612 432 624 514 516 C598 406 656 384 786 258" fill="none" stroke="url(#mark)" stroke-width="56" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <path d="M518 690 C600 606 640 554 698 462 C736 404 772 354 820 298" fill="none" stroke="#03070D" stroke-width="74" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>
  <path d="M520 690 C602 606 642 554 700 462 C738 404 774 354 822 298" fill="none" stroke="url(#gold)" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>

  <path d="M256 748 H784" stroke="#314962" stroke-width="18" stroke-linecap="round"/>
  <path d="M262 748 H560" stroke="#24D7C0" stroke-width="18" stroke-linecap="round" opacity="0.9"/>
  <circle cx="786" cy="258" r="32" fill="#EAF3FF"/>
  <circle cx="786" cy="258" r="15" fill="#4FA3FF"/>
</svg>`

async function renderPng(targetPath, size) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(targetPath)
}

async function main() {
  fs.mkdirSync(resourcesDir, { recursive: true })
  fs.rmSync(iconsetDir, { recursive: true, force: true })
  fs.mkdirSync(iconsetDir, { recursive: true })
  fs.writeFileSync(svgPath, svg, 'utf8')

  await renderPng(pngPath, 1024)
  await Promise.all(
    sizes.map(([filename, size]) => renderPng(path.join(iconsetDir, filename), size)),
  )

  if (process.platform === 'darwin') {
    try {
      execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], { stdio: 'inherit' })
    } catch (error) {
      if (!fs.existsSync(icnsPath)) {
        throw error
      }
      console.warn(`iconutil failed; keeping existing Electron icon: ${icnsPath}`)
    }
  } else {
    console.warn('Skipping .icns generation because iconutil is only available on macOS.')
  }

  console.log(`Electron icon generated: ${icnsPath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
