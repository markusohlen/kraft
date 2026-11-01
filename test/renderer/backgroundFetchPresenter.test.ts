import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BackgroundFetchPresenter,
  dueCheckIntervalMs,
  fetchIntervalMs,
  maximumFetchRetryIntervalMs,
  type BackgroundFetchApi,
  type BackgroundFetchView,
  type FetchableRepository
} from '../../src/renderer/src/presenters/backgroundFetchPresenter'

class FakeApi implements BackgroundFetchApi {
  fetchedAt: number[] = []
  failure: Error | null = null
  /** When set, a fetch stays running until this resolves. */
  gate: Promise<void> | null = null

  async fetchInBackground(): Promise<void> {
    this.fetchedAt.push(Date.now())
    await this.gate
    if (this.failure) throw this.failure
  }
}

class FakeWindow implements BackgroundFetchView {
  repository: FetchableRepository | null = { path: '/repos/widgets', hasRemotes: true }
  busy = false
  visible = true
  autoFetch = true
  reloads = 0
  reloadFailure: Error | null = null
  failures: { path: string; message: string | null }[] = []

  shownRepository = () => this.repository
  isBusy = () => this.busy
  isVisible = () => this.visible
  fetchesAutomatically = () => this.autoFetch

  async reload(): Promise<void> {
    this.reloads++
    if (this.reloadFailure) throw this.reloadFailure
  }

  showFetchFailure(path: string, message: string | null): void {
    this.failures.push({ path, message })
  }
}

describe('BackgroundFetchPresenter', () => {
  let api: FakeApi
  let window: FakeWindow
  let presenter: BackgroundFetchPresenter

  const nextDueCheck = () => vi.advanceTimersByTimeAsync(dueCheckIntervalMs)

  beforeEach(() => {
    vi.useFakeTimers()
    api = new FakeApi()
    window = new FakeWindow()
    presenter = new BackgroundFetchPresenter(api, window)
    presenter.start()
  })

  afterEach(() => {
    presenter.stop()
    vi.useRealTimers()
  })

  it('fetches a repository soon after it is shown, then at the fetch interval', async () => {
    await nextDueCheck()
    expect(api.fetchedAt).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(fetchIntervalMs - dueCheckIntervalMs)
    expect(api.fetchedAt).toHaveLength(1)
    await nextDueCheck()
    expect(api.fetchedAt).toHaveLength(2)
  })

  it('shows what a fetch brought in', async () => {
    await nextDueCheck()

    expect(window.reloads).toBe(1)
  })

  it('catches up as soon as the user comes back, if a fetch is due', async () => {
    window.visible = false
    await vi.advanceTimersByTimeAsync(10 * fetchIntervalMs)
    expect(api.fetchedAt).toHaveLength(0)

    window.visible = true
    presenter.fetchIfDue()
    await vi.advanceTimersByTimeAsync(0)

    expect(api.fetchedAt).toHaveLength(1)
    expect(window.reloads).toBe(1)
  })

  it('does not fetch again when the user comes back before one is due', async () => {
    await nextDueCheck()

    presenter.fetchIfDue()

    expect(api.fetchedAt).toHaveLength(1)
  })

  it('keeps fetching while the window is visible but another one has the focus', async () => {
    // Focus plays no part: only being hidden pauses it.
    await vi.advanceTimersByTimeAsync(2 * fetchIntervalMs + dueCheckIntervalMs)

    expect(api.fetchedAt.length).toBeGreaterThanOrEqual(2)
  })

  it('does not fetch without a repository, without remotes, while busy, or when turned off', async () => {
    window.repository = null
    await nextDueCheck()
    window.repository = { path: '/repos/widgets', hasRemotes: false }
    await nextDueCheck()
    window.repository = { path: '/repos/widgets', hasRemotes: true }

    window.busy = true
    await nextDueCheck()
    window.busy = false

    window.autoFetch = false
    await nextDueCheck()

    expect(api.fetchedAt).toHaveLength(0)
  })

  it('does not reload when an operation started during the fetch, which refreshes when it ends', async () => {
    let finish = () => {}
    api.gate = new Promise((resolve) => (finish = resolve))
    await nextDueCheck()

    window.busy = true
    finish()
    await vi.advanceTimersByTimeAsync(0)

    expect(window.reloads).toBe(0)
  })

  it('does not reload another repository the user switched to during the fetch', async () => {
    let finish = () => {}
    api.gate = new Promise((resolve) => (finish = resolve))
    await nextDueCheck()

    window.repository = { path: '/repos/gadgets', hasRemotes: true }
    finish()
    await vi.advanceTimersByTimeAsync(0)

    expect(window.reloads).toBe(0)
  })

  it('keeps a schedule for each repository', async () => {
    await nextDueCheck()
    window.repository = { path: '/repos/gadgets', hasRemotes: true }
    await nextDueCheck()
    expect(api.fetchedAt).toHaveLength(2)

    window.repository = { path: '/repos/widgets', hasRemotes: true }
    await nextDueCheck()
    expect(api.fetchedAt).toHaveLength(2)
  })

  it('runs one fetch at a time', async () => {
    api.gate = new Promise(() => {})

    await vi.advanceTimersByTimeAsync(2 * fetchIntervalMs)

    expect(api.fetchedAt).toHaveLength(1)
  })

  it('reports a failed fetch only as the fetch failure, and does not reload', async () => {
    api.failure = new Error('Authentication failed')

    await nextDueCheck()

    expect(window.failures).toEqual([{ path: '/repos/widgets', message: 'Authentication failed' }])
    expect(window.reloads).toBe(0)
  })

  it('stays quiet when reloading after a fetch fails', async () => {
    window.reloadFailure = new Error('gone')

    await nextDueCheck()

    expect(window.failures).toEqual([{ path: '/repos/widgets', message: null }])
  })

  it('retries a failing fetch less and less often', async () => {
    api.failure = new Error('offline')

    await vi.advanceTimersByTimeAsync(7 * fetchIntervalMs)

    const waits = api.fetchedAt.slice(1).map((time, index) => time - api.fetchedAt[index])
    expect(waits).toHaveLength(2)
    expect(waits[0]).toBeGreaterThanOrEqual(2 * fetchIntervalMs)
    expect(waits[1]).toBeGreaterThanOrEqual(4 * fetchIntervalMs)
  })

  it('never waits longer than the longest retry interval', async () => {
    api.failure = new Error('offline')
    await vi.advanceTimersByTimeAsync(8 * maximumFetchRetryIntervalMs)
    const fetches = api.fetchedAt.length

    await vi.advanceTimersByTimeAsync(maximumFetchRetryIntervalMs + dueCheckIntervalMs)

    expect(api.fetchedAt).toHaveLength(fetches + 1)
  })

  it('clears the failure when a fetch works again', async () => {
    api.failure = new Error('offline')
    await nextDueCheck()
    api.failure = null

    await vi.advanceTimersByTimeAsync(2 * fetchIntervalMs + dueCheckIntervalMs)

    expect(window.failures.at(-1)).toEqual({ path: '/repos/widgets', message: null })
  })

  it('counts a fetch by hand as one that worked', async () => {
    api.failure = new Error('offline')
    await nextDueCheck()

    presenter.fetchSucceeded('/repos/widgets')

    expect(window.failures.at(-1)).toEqual({ path: '/repos/widgets', message: null })
    await vi.advanceTimersByTimeAsync(fetchIntervalMs - dueCheckIntervalMs)
    expect(api.fetchedAt).toHaveLength(1)
  })

  it('stops when stopped', async () => {
    presenter.stop()

    await nextDueCheck()
    presenter.fetchIfDue()

    expect(api.fetchedAt).toHaveLength(0)
  })

  it('keeps one timer after being started again', async () => {
    presenter.start()
    presenter.start()
    api.gate = null

    await nextDueCheck()

    expect(api.fetchedAt).toHaveLength(1)
  })
})
