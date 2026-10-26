import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import appIcon from '../../build/icon.png?asset'
import { cloneMethods } from '../application/cloneApi'
import { CloneService } from '../application/cloneService'
import { jiraMethods } from '../application/jiraApi'
import { JiraService } from '../application/jiraService'
import { kraftMethods } from '../application/kraftApi'
import { repositoryLibraryMethods } from '../application/repositoryLibraryApi'
import { RepositoryLibraryService } from '../application/repositoryLibraryService'
import { updateMethods, updateStatusChannel } from '../application/updateApi'
import { UpdateService, type UpdaterAvailability } from '../application/updateService'
import { KraftService, type FolderPicker } from '../application/kraftService'
import { EncryptedHostingAccountStore } from '../infrastructure/encryptedHostingAccountStore'
import { ElectronAppUpdater } from '../infrastructure/electronAppUpdater'
import { EncryptedJiraSettingsStore } from '../infrastructure/encryptedJiraSettingsStore'
import { GitCliCloner } from '../infrastructure/gitCliCloner'
import { GitCliRepositoryFactory } from '../infrastructure/gitCliRepository'
import { HostingApiClient } from '../infrastructure/hostingApiClient'
import { JiraRestClient } from '../infrastructure/jiraRestClient'
import { FileSystemRepositoryFinder } from '../infrastructure/fileSystemRepositoryFinder'
import { JsonRepositoryLibraryStore } from '../infrastructure/jsonRepositoryLibraryStore'
import type { SecretCipher } from '../infrastructure/secretCipher'
import { assertValidArguments } from '../ipc/ipcArgumentRules'
import { channelFor, type IpcMethod, type IpcResult } from '../ipc/ipcContract'
import { createAppUrlMatcher } from './appUrl'

let mainWindow: BrowserWindow | null = null

/** Gives the release a moment so startup isn't slowed by the check. */
const firstUpdateCheckDelayMs = 10_000
const updateCheckIntervalMs = 4 * 60 * 60 * 1000

const isAppUrl = createAppUrlMatcher(process.env.ELECTRON_RENDERER_URL, join(__dirname, '../renderer/index.html'))

/** Only Kraft's own top-level page may call into the main process. */
function isFromAppPage(event: Electron.IpcMainInvokeEvent): boolean {
  const frame = event.senderFrame
  return frame !== null && frame.parent === null && isAppUrl(frame.url)
}

class DialogFolderPicker implements FolderPicker {
  async chooseFolder(title: string): Promise<string | null> {
    const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory'] }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
}

const safeStorageCipher: SecretCipher = {
  encrypt(plainText) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available, so the token cannot be saved')
    return safeStorage.encryptString(plainText).toString('base64')
  },
  decrypt(cipherText) {
    return safeStorage.decryptString(Buffer.from(cipherText, 'base64'))
  }
}

function createRepositoryLibraryService(repositories: GitCliRepositoryFactory): RepositoryLibraryService {
  const userData = app.getPath('userData')
  return new RepositoryLibraryService(
    new JsonRepositoryLibraryStore(join(userData, 'repository-library.json'), join(userData, 'recent-repositories.json')),
    new FileSystemRepositoryFinder(),
    repositories
  )
}

function createJiraService(): JiraService {
  return new JiraService(
    new EncryptedJiraSettingsStore(join(app.getPath('userData'), 'jira.json'), safeStorageCipher),
    new JiraRestClient()
  )
}

function createCloneService(): CloneService {
  return new CloneService(
    new EncryptedHostingAccountStore(join(app.getPath('userData'), 'hosting-accounts.json'), safeStorageCipher),
    new HostingApiClient(),
    new GitCliCloner()
  )
}

/** Why this copy of Kraft cannot update itself, if it can't. */
function updaterAvailability(): UpdaterAvailability {
  if (!app.isPackaged) return { unsupportedReason: 'Only an installed copy of Kraft updates itself; this one runs from source.' }
  if (process.platform === 'darwin') {
    return { unsupportedReason: "The macOS build isn't code-signed, so it can't update itself. Download new versions from the Releases page." }
  }
  // electron-updater can only replace an AppImage; other Linux installs are updated by their package manager.
  if (process.platform === 'linux' && !process.env.APPIMAGE) return { unsupportedReason: 'Only the AppImage of Kraft updates itself.' }
  return { updater: new ElectronAppUpdater() }
}

function createUpdateService(): UpdateService {
  return new UpdateService(app.getVersion(), updaterAvailability(), (view) => mainWindow?.webContents.send(updateStatusChannel, view))
}

function checkForUpdatesRegularly(updates: UpdateService): void {
  const check = () => void updates.checkForUpdates()
  setTimeout(check, firstUpdateCheckDelayMs)
  setInterval(check, updateCheckIntervalMs)
}

function registerIpcHandlers<Service extends object>(service: Service, methods: readonly (keyof Service & IpcMethod)[]): void {
  for (const method of methods) {
    const handler = service[method] as (...args: unknown[]) => Promise<unknown>
    ipcMain.handle(channelFor(method), async (event, ...args: unknown[]): Promise<IpcResult<unknown>> => {
      if (!isFromAppPage(event)) return { ok: false, error: `Refused ${method}: the request did not come from Kraft's own page` }
      try {
        assertValidArguments(method, args)
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
    // macOS takes the icon from the app bundle; elsewhere the window would show Electron's own while developing.
    ...(process.platform === 'darwin' ? {} : { icon: appIcon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Only web links (e.g. Jira issues) go to the browser; other schemes could launch local programs.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // The page holds the IPC bridge, so it must never be replaced by another page (e.g. a dropped link).
  mainWindow.webContents.on('will-navigate', (event) => {
    if (!isAppUrl(event.url)) event.preventDefault()
  })
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault())
  if (process.env.ELECTRON_RENDERER_URL) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainWindow.on('closed', () => (mainWindow = null))
}

app.whenReady().then(() => {
  const repositories = new GitCliRepositoryFactory()
  const library = createRepositoryLibraryService(repositories)
  registerIpcHandlers(new KraftService(repositories, library, new DialogFolderPicker()), kraftMethods)
  registerIpcHandlers(library, repositoryLibraryMethods)
  registerIpcHandlers(createJiraService(), jiraMethods)
  registerIpcHandlers(createCloneService(), cloneMethods)
  const updates = createUpdateService()
  registerIpcHandlers(updates, updateMethods)
  createWindow()
  checkForUpdatesRegularly(updates)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
