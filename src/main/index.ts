import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import { kraftMethods, type KraftApi } from '../application/kraftApi'
import { KraftService, type FolderPicker } from '../application/kraftService'
import { GitCliRepositoryFactory } from '../infrastructure/gitCliRepository'
import { JsonRecentRepositoriesStore } from '../infrastructure/jsonRecentRepositoriesStore'
import { channelFor, type IpcResult } from '../ipc/ipcContract'

let mainWindow: BrowserWindow | null = null

class DialogFolderPicker implements FolderPicker {
  async chooseFolder(): Promise<string | null> {
    const options: Electron.OpenDialogOptions = { title: 'Open repository', properties: ['openDirectory'] }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
}

function createService(): KraftApi {
  return new KraftService(
    new GitCliRepositoryFactory(),
    new JsonRecentRepositoriesStore(join(app.getPath('userData'), 'recent-repositories.json')),
    new DialogFolderPicker()
  )
}

function registerIpcHandlers(service: KraftApi): void {
  for (const method of kraftMethods) {
    const handler = service[method] as (...args: unknown[]) => Promise<unknown>
    ipcMain.handle(channelFor(method), async (_event, ...args: unknown[]): Promise<IpcResult<unknown>> => {
      try {
        return { ok: true, value: await handler.apply(service, args) }
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
    })
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'Kraft',
    backgroundColor: '#1b1e25',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.on('closed', () => (mainWindow = null))
}

app.whenReady().then(() => {
  registerIpcHandlers(createService())
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
