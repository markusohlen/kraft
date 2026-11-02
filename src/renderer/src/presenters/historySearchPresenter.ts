import type { KraftApi } from '../../../application/kraftApi'
import type { GraphRow } from '../../../domain/commitGraph'
import type { Commit } from '../../../domain/entities'
import { LatestRequest } from '../latestRequest'

export type HistorySearchApi = Pick<KraftApi, 'searchHistory'>

export interface HistorySearchState {
  query: string
  /** In the order the graph shows them; commits too old for the graph come last. */
  matches: Commit[]
  truncated: boolean
  /** The match last stepped to; -1 before the first step. */
  current: number
  searching: boolean
  error: string | null
  /** Goes up with every step, so the graph scrolls back to a match the user scrolled away from. */
  revealRequest: number
}

export const noHistorySearch: HistorySearchState = {
  query: '',
  matches: [],
  truncated: false,
  current: -1,
  searching: false,
  error: null,
  revealRequest: 0
}

export interface HistorySearchView {
  showSearch(state: HistorySearchState): void
  graphRows(): readonly GraphRow[]
  selectCommit(sha: string): void
}

/** Long enough that typing a word runs one search, not one per letter. */
export const searchDelayMs = 250

/** Puts commits in the order of the graph's rows, so stepping through them walks down it. */
export function inGraphOrder(commits: readonly Commit[], rows: readonly GraphRow[]): Commit[] {
  const positions = new Map(rows.flatMap((row, index) => (row.kind === 'commit' ? [[row.commit.sha, index] as const] : [])))
  const position = (commit: Commit) => positions.get(commit.sha) ?? rows.length
  return [...commits].sort((a, b) => position(a) - position(b))
}

/** Presents searching the history. Results only mark the graph; nothing moves until the user steps to a match. */
export class HistorySearchPresenter {
  private state = noHistorySearch
  private timer: ReturnType<typeof setTimeout> | null = null
  private loading: Promise<void> | null = null
  private readonly requests = new LatestRequest()

  constructor(
    private readonly api: HistorySearchApi,
    private readonly view: HistorySearchView
  ) {}

  type(query: string): void {
    if (!query.trim()) return this.clear()
    this.cancelPending()
    this.update({ query, searching: true })
    this.timer = setTimeout(() => void this.loadNow(), searchDelayMs)
  }

  clear(): void {
    this.cancelPending()
    this.loading = null
    this.state = noHistorySearch
    this.view.showSearch(this.state)
  }

  /** The repository changed, so commits may have appeared or gone. */
  repeat(): void {
    if (this.state.query.trim() && this.timer === null) void this.loadNow()
  }

  /** Waits for a search still running, so Enter right after typing goes to a match of what was typed. */
  async step(offset: 1 | -1): Promise<void> {
    if (this.timer !== null) void this.loadNow()
    await this.loading
    const { matches, current, revealRequest } = this.state
    if (matches.length === 0) return
    const next = current === -1 ? (offset === 1 ? 0 : matches.length - 1) : (current + offset + matches.length) % matches.length
    this.update({ current: next, revealRequest: revealRequest + 1 })
    this.view.selectCommit(matches[next].sha)
  }

  private cancelPending(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.requests.invalidate()
  }

  private loadNow(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.loading = this.load()
    return this.loading
  }

  private async load(): Promise<void> {
    const isLatest = this.requests.begin()
    const { query, matches, current } = this.state
    try {
      const result = await this.api.searchHistory(query)
      if (!isLatest()) return
      const shownMatch = matches[current]?.sha
      const ordered = inGraphOrder(result.matches, this.view.graphRows())
      this.update({
        matches: ordered,
        truncated: result.truncated,
        current: ordered.findIndex((commit) => commit.sha === shownMatch),
        searching: false,
        error: null
      })
    } catch (error) {
      if (isLatest()) this.update({ matches: [], truncated: false, current: -1, searching: false, error: error instanceof Error ? error.message : String(error) })
    }
  }

  private update(changes: Partial<HistorySearchState>): void {
    this.state = { ...this.state, ...changes }
    this.view.showSearch(this.state)
  }
}
