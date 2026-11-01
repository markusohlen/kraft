import type { KraftApi } from '../../../application/kraftApi'

export type BackgroundFetchApi = Pick<KraftApi, 'fetchInBackground'>

export interface FetchableRepository {
  path: string
  hasRemotes: boolean
}

export interface BackgroundFetchView {
  shownRepository(): FetchableRepository | null
  /** Whether a user operation is running; it refreshes when it ends, and must not meet a fetch of ours. */
  isBusy(): boolean
  isVisible(): boolean
  fetchesAutomatically(): boolean
  /** Replaces the shown repository with its current state, without telling the user; rejects when that fails. */
  reload(): Promise<void>
  /** Says why the last automatic fetch of a repository failed; null when it worked. */
  showFetchFailure(path: string, message: string | null): void
}

export const fetchIntervalMs = 2 * 60 * 1000
/** A fetch that keeps failing (offline, no credentials) is retried less and less often, down to this. */
export const maximumFetchRetryIntervalMs = 30 * 60 * 1000
/** How often to see whether a fetch is due; a repository that was just opened waits at most this long. */
export const dueCheckIntervalMs = 10_000

interface FetchSchedule {
  failures: number
  nextFetchAt: number
}

/**
 * Brings in what other people push: it fetches the shown repository now and then, and shows the result.
 * Nothing here may interrupt the user over something they did not ask for, so there is no busy indicator
 * and no notice, and a fetch that fails is only reported through `showFetchFailure`.
 */
export class BackgroundFetchPresenter {
  private timer: ReturnType<typeof setInterval> | null = null
  private fetching = false
  private readonly schedules = new Map<string, FetchSchedule>()

  constructor(
    private readonly api: BackgroundFetchApi,
    private readonly view: BackgroundFetchView
  ) {}

  start(): void {
    this.stop()
    this.timer = setInterval(() => this.fetchIfDue(), dueCheckIntervalMs)
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  fetchIfDue(): void {
    const repository = this.view.shownRepository()
    if (this.timer === null || !repository?.hasRemotes || this.fetching || !this.canRunNow()) return
    const schedule = this.schedules.get(repository.path)
    if (schedule && Date.now() < schedule.nextFetchAt) return
    this.fetching = true
    void this.api.fetchInBackground().then(
      () => this.fetchWorked(repository.path),
      (error: unknown) => this.fetchFailed(repository.path, error)
    )
  }

  /** The user fetched by hand and it worked, so the repository is up to date and no longer failing. */
  fetchSucceeded(path: string): void {
    this.schedules.set(path, { failures: 0, nextFetchAt: Date.now() + fetchIntervalMs })
    this.view.showFetchFailure(path, null)
  }

  private canRunNow(): boolean {
    return this.view.fetchesAutomatically() && this.view.isVisible() && !this.view.isBusy()
  }

  private fetchWorked(path: string): void {
    this.fetching = false
    this.fetchSucceeded(path)
    // The window may have moved on during the fetch: to an operation it refreshes after, or to another repository.
    if (this.view.isBusy() || this.view.shownRepository()?.path !== path) return
    // What was fetched is on disk either way, and the next fetch or the user's next action shows it.
    this.view.reload().catch(() => undefined)
  }

  private fetchFailed(path: string, error: unknown): void {
    this.fetching = false
    const failures = (this.schedules.get(path)?.failures ?? 0) + 1
    const retryIn = Math.min(fetchIntervalMs * 2 ** failures, maximumFetchRetryIntervalMs)
    this.schedules.set(path, { failures, nextFetchAt: Date.now() + retryIn })
    this.view.showFetchFailure(path, error instanceof Error ? error.message : String(error))
  }
}
