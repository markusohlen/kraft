import { useEffect, useRef } from 'react'
import type { GraphRow } from '../../../domain/commitGraph'
import type { HistorySearchState } from '../presenters/historySearchPresenter'
import type { RepositoryController } from '../useRepositoryController'

/** Searches the whole history from above the graph. Ctrl/Cmd+F jumps here, Enter steps through the matches, Escape clears. */
export function HistorySearchBar({ controller }: { controller: RepositoryController }) {
  const { historySearch: search } = controller
  const presenter = controller.presenters.historySearch
  const input = useRef<HTMLInputElement>(null)
  const hasMatches = search.matches.length > 0

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f' || document.querySelector('.modal')) return
      event.preventDefault()
      input.current?.focus()
      input.current?.select()
    }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])

  return (
    <div className="history-search">
      <input
        ref={input}
        className="history-search-input"
        placeholder="Search history: message, author or sha (Ctrl+F)"
        value={search.query}
        onChange={(event) => presenter.type(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void presenter.step(event.shiftKey ? -1 : 1)
          if (event.key !== 'Escape') return
          presenter.clear()
          event.currentTarget.blur()
        }}
      />
      {search.query.trim() && <span className={`history-search-status ${search.error ? 'error-text' : 'muted'}`}>{statusText(search, controller.view!.graph.rows)}</span>}
      <button className="icon-button" title="Previous match (Shift+Enter)" disabled={!hasMatches} onClick={() => void presenter.step(-1)}>
        ↑
      </button>
      <button className="icon-button" title="Next match (Enter)" disabled={!hasMatches} onClick={() => void presenter.step(1)}>
        ↓
      </button>
    </div>
  )
}

function statusText({ matches, truncated, current, searching, error }: HistorySearchState, rows: readonly GraphRow[]): string {
  if (error) return error
  if (searching) return 'Searching…'
  if (matches.length === 0) return 'No matches'
  const total = `${matches.length}${truncated ? '+' : ''}`
  if (current === -1) return `${total} match${matches.length === 1 ? '' : 'es'}`
  const sha = matches[current].sha
  const inGraph = rows.some((row) => row.kind === 'commit' && row.commit.sha === sha)
  return `${current + 1} of ${total}${inGraph ? '' : ', too old for the graph'}`
}
