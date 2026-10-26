// Renders build/icon.svg to build/icon.png with Electron's own Chromium, so no image library is needed.
// electron-builder makes the Windows .ico and macOS .icns from that PNG. Run with `npm run icon`.
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const buildFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
/** electron-builder needs at least 512 pixels for macOS; 1024 also covers high-density screens. */
const size = 1024

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  const svg = readFileSync(join(buildFolder, 'icon.svg'), 'utf8')
  const page = `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
  await window.loadURL(`data:text/html;base64,${Buffer.from(page).toString('base64')}`)
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  writeFileSync(join(buildFolder, 'icon.png'), image.resize({ width: size, height: size }).toPNG())
  console.log(`Wrote ${join(buildFolder, 'icon.png')}`)
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
