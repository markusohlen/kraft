import { isUpdateUnderway, type UpdateStatus, type UpdateView } from '../domain/appUpdate'
import type { UpdateApi } from './updateApi'

/** Downloads and installs releases; implemented with electron-updater. */
export interface AppUpdater {
  /**
   * Looks for a newer release and starts downloading it. Resolves with that release's version, or
   * null when this is already the newest.
   */
  checkAndDownload(): Promise<string | null>
  onDownloadProgress(listener: (percent: number) => void): void
  onDownloaded(listener: (version: string) => void): void
  onError(listener: (error: Error) => void): void
  /** Quits Kraft, installs the downloaded release and starts it again. */
  installAndRestart(): void
}

export type UpdaterAvailability = { updater: AppUpdater } | { unsupportedReason: string }

export class UpdateService implements UpdateApi {
  private status: UpdateStatus
  private readonly updater: AppUpdater | null

  constructor(
    private readonly currentVersion: string,
    availability: UpdaterAvailability,
    private readonly onChange: (view: UpdateView) => void
  ) {
    if ('unsupportedReason' in availability) {
      this.updater = null
      this.status = { kind: 'unsupported', reason: availability.unsupportedReason }
      return
    }
    this.updater = availability.updater
    this.status = { kind: 'idle' }
    this.updater.onDownloadProgress((percent) => {
      if (this.status.kind === 'downloading') this.setStatus({ ...this.status, percent: Math.round(percent) })
    })
    this.updater.onDownloaded((version) => this.setStatus({ kind: 'ready', version }))
    this.updater.onError((error) => this.setStatus({ kind: 'failed', message: error.message }))
  }

  async appUpdate(): Promise<UpdateView> {
    return this.view()
  }

  async checkForUpdates(): Promise<UpdateView> {
    if (!this.updater || isUpdateUnderway(this.status)) return this.view()
    this.setStatus({ kind: 'checking' })
    try {
      const version = await this.updater.checkAndDownload()
      // The download can finish, or fail, before the check itself resolves.
      if (this.status.kind === 'checking') this.setStatus(version ? { kind: 'downloading', version, percent: 0 } : { kind: 'up-to-date' })
    } catch (error) {
      this.setStatus({ kind: 'failed', message: error instanceof Error ? error.message : String(error) })
    }
    return this.view()
  }

  async installUpdate(): Promise<void> {
    if (!this.updater || this.status.kind !== 'ready') throw new Error('No update has been downloaded yet')
    this.updater.installAndRestart()
  }

  private setStatus(status: UpdateStatus): void {
    this.status = status
    this.onChange(this.view())
  }

  private view(): UpdateView {
    return { currentVersion: this.currentVersion, status: this.status }
  }
}
