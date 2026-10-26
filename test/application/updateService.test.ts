import { describe, expect, it } from 'vitest'
import type { UpdateView } from '../../src/domain/appUpdate'
import { UpdateService, type AppUpdater } from '../../src/application/updateService'

class FakeUpdater implements AppUpdater {
  newerVersion: string | null = null
  checkFailure: Error | null = null
  checks = 0
  installed = false
  progress: (percent: number) => void = () => undefined
  downloaded: (version: string) => void = () => undefined
  error: (error: Error) => void = () => undefined

  async checkAndDownload(): Promise<string | null> {
    this.checks++
    if (this.checkFailure) throw this.checkFailure
    return this.newerVersion
  }
  onDownloadProgress(listener: (percent: number) => void): void {
    this.progress = listener
  }
  onDownloaded(listener: (version: string) => void): void {
    this.downloaded = listener
  }
  onError(listener: (error: Error) => void): void {
    this.error = listener
  }
  installAndRestart(): void {
    this.installed = true
  }
}

function setUp() {
  const updater = new FakeUpdater()
  const changes: UpdateView[] = []
  const service = new UpdateService('0.1.1', { updater }, (view) => changes.push(view))
  return { updater, changes, service, kinds: () => changes.map((view) => view.status.kind) }
}

describe('UpdateService', () => {
  it('downloads a newer release and installs it on request', async () => {
    const { updater, service, changes, kinds } = setUp()
    updater.newerVersion = '0.2.0'

    expect(await service.checkForUpdates()).toEqual({ currentVersion: '0.1.1', status: { kind: 'downloading', version: '0.2.0', percent: 0 } })
    updater.progress(41.6)
    updater.downloaded('0.2.0')
    await service.installUpdate()

    expect(kinds()).toEqual(['checking', 'downloading', 'downloading', 'ready'])
    expect(changes[2].status).toEqual({ kind: 'downloading', version: '0.2.0', percent: 42 })
    expect(updater.installed).toBe(true)
  })

  it('says when Kraft is up to date', async () => {
    const { service } = setUp()

    expect((await service.checkForUpdates()).status).toEqual({ kind: 'up-to-date' })
  })

  it('reports a failed check or download', async () => {
    const { updater, service } = setUp()
    updater.checkFailure = new Error('net::ERR_INTERNET_DISCONNECTED')

    expect((await service.checkForUpdates()).status).toEqual({ kind: 'failed', message: 'net::ERR_INTERNET_DISCONNECTED' })

    updater.checkFailure = null
    updater.newerVersion = '0.2.0'
    await service.checkForUpdates()
    updater.error(new Error('Checksum mismatch'))
    expect((await service.appUpdate()).status).toEqual({ kind: 'failed', message: 'Checksum mismatch' })
  })

  it('does not check again while an update is downloading or waiting to be installed', async () => {
    const { updater, service } = setUp()
    updater.newerVersion = '0.2.0'

    await service.checkForUpdates()
    await service.checkForUpdates()
    updater.downloaded('0.2.0')
    await service.checkForUpdates()

    expect(updater.checks).toBe(1)
    expect((await service.appUpdate()).status).toEqual({ kind: 'ready', version: '0.2.0' })
  })

  it('refuses to install before an update has been downloaded', async () => {
    const { updater, service } = setUp()

    await expect(service.installUpdate()).rejects.toThrow('No update has been downloaded yet')
    expect(updater.installed).toBe(false)
  })

  it('never checks when this copy of Kraft cannot update itself', async () => {
    const changes: UpdateView[] = []
    const service = new UpdateService('0.1.1', { unsupportedReason: 'Only installed copies of Kraft update themselves.' }, (view) =>
      changes.push(view)
    )

    const unsupported = { kind: 'unsupported', reason: 'Only installed copies of Kraft update themselves.' }
    expect((await service.checkForUpdates()).status).toEqual(unsupported)
    await expect(service.installUpdate()).rejects.toThrow()
    expect(changes).toEqual([])
  })
})
