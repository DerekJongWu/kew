/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no annotations */
// Placeholder app icon: a white "K" on a Cobalt (#2148C0) rounded square.
// Renders the SVG with Electron, then builds build/icon.icns and resources/icon.png with
// sips + iconutil. Run via `npm run icon` (macOS only).
import { app, BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3A62D6"/><stop offset="1" stop-color="#2148C0"/>
    </linearGradient>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#g)"/>
  <text x="512" y="512" text-anchor="middle" dominant-baseline="central"
        font-family="-apple-system, 'SF Pro Display', Helvetica, Arial, sans-serif"
        font-weight="700" font-size="560" fill="#fff">K</text>
</svg>`

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1024, height: 1024, useContentSize: true, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await win.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`))
  await new Promise((r) => setTimeout(r, 500))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const work = join(tmpdir(), 'kew-icon')
  const set = join(work, 'icon.iconset')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(set, { recursive: true })
  const master = join(work, 'icon-1024.png')
  writeFileSync(master, image.toPNG())
  for (const s of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const name = `icon_${s}x${s}${scale === 2 ? '@2x' : ''}.png`
      execFileSync('sips', ['-z', String(s * scale), String(s * scale), master, '--out', join(set, name)], { stdio: 'ignore' })
    }
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(root, 'build/icon.icns')])
  writeFileSync(join(root, 'build/icon.png'), image.toPNG())
  console.log('wrote build/icon.icns and build/icon.png')
  app.exit(0)
})
