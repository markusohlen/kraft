import { autoUpdater } from 'electron-updater'
import type { AppUpdater } from '../application/updateService'

/**
 * Updates from the GitHub releases named by `build.publish` in package.json. Downloads start as soon
 * as a newer release is found, and a downloaded update is also installed when Kraft quits.
 */
export class ElectronAppUpdater implements AppUpdater {
  constructor() {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
  }

  async checkAndDownload(): Promise<string | null> {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result?.isUpdateAvailable ? result.updateInfo.version : null
    } catch (error) {
      throw error instanceof Error ? concise(error) : error
    }
  }

  onDownloadProgress(listener: (percent: number) => void): void {
    autoUpdater.on('download-progress', (progress) => listener(progress.percent))
  }

  onDownloaded(listener: (version: string) => void): void {
    autoUpdater.on('update-downloaded', (info) => listener(info.version))
  }

  onError(listener: (error: Error) => void): void {
    autoUpdater.on('error', (error) => listener(concise(error)))
  }

  installAndRestart(): void {
    autoUpdater.quitAndInstall()
  }
}

/** electron-updater's messages go on with the response headers and a stack trace; the first line says what went wrong. */
function concise(error: Error): Error {
  return new Error(error.message.split('\n')[0].trim())
}
