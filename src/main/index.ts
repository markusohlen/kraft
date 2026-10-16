import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { jiraMethods } from '../application/jiraApi'
import { JiraService } from '../application/jiraService'
import { kraftMethods } from '../application/kraftApi'
import { repositoryLibraryMethods } from '../application/repositoryLibraryApi'
import { RepositoryLibraryService } from '../application/repositoryLibraryService'
import { KraftService, type FolderPicker } from '../application/kraftService'
import { EncryptedJiraSettingsStore, type SecretCipher } from '../infrastructure/encryptedJiraSettingsStore'
import { GitCliRepositoryFactory } from '../infrastructure/gitCliRepository'
import { JiraRestClient } from '../infrastructure/jiraRestClient'
import { FileSystemRepositoryFinder } from '../infrastructure/fileSystemRepositoryFinder'
import { JsonRepositoryLibraryStore } from '../infrastructure/jsonRepositoryLibraryStore'
import { channelFor, type IpcResult } from '../ipc/ipcContract'

let mainWindow: BrowserWindow | null = null

class DialogFolderPicker implements FolderPicker {
  async chooseFolder(title: string): Promise<string | null> {
    const options: Electron.OpenDialogOptions = { title, properties: ['openDirectory'] }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
}

const safeStorageCipher: SecretCipher = {
  encrypt(plainText) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available, so the Jira token cannot be saved')
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

function registerIpcHandlers<Service extends object>(service: Service, methods: readonly (keyof Service & string)[]): void {
  for (const method of methods) {
    const handler = service[method] as (...args: unknown[]) => Promise<unknown>
    ipcMain.handle(channelFor(method as Parameters<typeof channelFor>[0]), async (_event, ...args: unknown[]): Promise<IpcResult<unknown>> => {
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
    // Only web links (e.g. Jira issues) go to the browser; other schemes could launch local programs.
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
