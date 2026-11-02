import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistorySearchResult } from '../../src/application/historySearch'
import type { GraphRow } from '../../src/domain/commitGraph'
import type { Commit } from '../../src/domain/entities'
import {
  HistorySearchPresenter,
  inGraphOrder,
  noHistorySearch,
  searchDelayMs,
  type HistorySearchState,
  type HistorySearchView
} from '../../src/renderer/src/presenters/historySearchPresenter'
import { commit } from './presenterFakes'

function rowsOf(...commits: Commit[]): GraphRow[] {
  return commits.map((row) => ({ kind: 'commit', commit: row }) as GraphRow)
}

describe('inGraphOrder', () => {
  it('follows the rows, with commits the graph does not hold last', () => {
    const [a, b, old] = [commit('a'), commit('b'), commit('old')]
    expect(inGraphOrder([old, b, a], rowsOf(a, b))).toEqual([a, b, old])
  })
})

describe('HistorySearchPresenter', () => {
  const [a, b, c] = [commit('a'), commit('b'), commit('c')]
  let answers: Map<string, HistorySearchResult>
  let searches: string[]
  let state: HistorySearchState
  let selected: string[]
  let presenter: HistorySearchPresenter

  const found = (...matches: Commit[]): HistorySearchResult => ({ matches, truncated: false })
  const settle = () => vi.advanceTimersByTimeAsync(searchDelayMs)

  beforeEach(() => {
    vi.useFakeTimers()
    answers = new Map([['fix', found(a, b, c)]])
    searches = []
    state = noHistorySearch
    selected = []
    const view: HistorySearchView = {
      showSearch: (shown) => (state = shown),
      graphRows: () => rowsOf(a, b, c),
      selectCommit: (sha) => selected.push(sha)
    }
    presenter = new HistorySearchPresenter(
      {
        searchHistory: async (query) => {
          searches.push(query)
          const answer = answers.get(query)
          if (!answer) throw new Error('search failed')
          return answer
        }
      },
      view
    )
  })

  afterEach(() => vi.useRealTimers())

  it('runs one search for a word typed quickly', async () => {
    answers.set('f', found())
    answers.set('fi', found())
    presenter.type('f')
    presenter.type('fi')
    presenter.type('fix')
    expect(state).toMatchObject({ query: 'fix', searching: true })

    await settle()

    expect(searches).toEqual(['fix'])
    expect(state).toMatchObject({ searching: false, matches: [a, b, c], current: -1 })
  })

  it('selects nothing until the user steps to a match', async () => {
    presenter.type('fix')
    await settle()
    expect(selected).toEqual([])
  })

  it('steps through the matches, wrapping around both ways', async () => {
    presenter.type('fix')
    await settle()

    await presenter.step(1)
    await presenter.step(1)
    await presenter.step(-1)
    await presenter.step(-1)

    expect(selected).toEqual(['a', 'b', 'a', 'c'])
    expect(state.current).toBe(2)
  })

  it('searches at once when stepping straight after typing', async () => {
    presenter.type('fix')

    await presenter.step(1)

    expect(selected).toEqual(['a'])
    await settle()
    expect(searches).toEqual(['fix'])
  })

  it('asks the graph to reveal the match on every step, even the same match', async () => {
    answers.set('one', found(a))
    presenter.type('one')
    await settle()

    await presenter.step(1)
    const first = state.revealRequest
    await presenter.step(1)

    expect(state.revealRequest).toBe(first + 1)
  })

  it('ignores an answer to a search that was cleared', async () => {
    presenter.type('fix')
    const running = presenter.step(1)
    presenter.clear()
    await running

    expect(state).toEqual(noHistorySearch)
    expect(selected).toEqual([])
  })

  it('stays on the same match when a repeated search still finds it', async () => {
    presenter.type('fix')
    await settle()
    await presenter.step(1)
    await presenter.step(1)

    answers.set('fix', found(c, b))
    presenter.repeat()
    await vi.advanceTimersByTimeAsync(0)

    expect(state.matches).toEqual([b, c])
    expect(state.current).toBe(0)
  })

  it('does not search again with nothing to search for', async () => {
    presenter.repeat()
    await settle()
    expect(searches).toEqual([])
  })

  it('shows why a search failed', async () => {
    presenter.type('unknown')
    await settle()
    expect(state).toMatchObject({ error: 'search failed', matches: [], searching: false })
  })

  it('clears when the query becomes blank', async () => {
    presenter.type('fix')
    await settle()
    presenter.type('  ')
    expect(state).toEqual(noHistorySearch)
  })
})
