import { useEffect, useState } from 'react'
import type { JiraBoard } from '../../../domain/jira'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'

type Loadable<T> = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded'; value: T } | { kind: 'failed'; message: string }

function load<T>(request: () => Promise<T>, set: (state: Loadable<T>) => void): () => void {
  let current = true
  set({ kind: 'loading' })
  request().then(
    (value) => current && set({ kind: 'loaded', value }),
    (error: Error) => current && set({ kind: 'failed', message: error.message })
  )
  return () => {
    current = false
  }
}

/** Chooses which columns of a Jira board the "assigned to me" list shows. */
export function JiraColumnsDialog({ controller, onClose }: { controller: RepositoryController; onClose: () => void }) {
  const saved = controller.jira?.columnFilter ?? null
  const [boards, setBoards] = useState<Loadable<JiraBoard[]>>({ kind: 'idle' })
  const [boardId, setBoardId] = useState<number | null>(saved?.boardId ?? null)
  const [columns, setColumns] = useState<Loadable<string[]>>({ kind: 'idle' })
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(saved?.columns ?? []))

  useEffect(() => load(() => kraft.jiraBoards(), setBoards), [])
  useEffect(() => (boardId === null ? undefined : load(() => kraft.jiraBoardColumns(boardId), setColumns)), [boardId])

  const board = boards.kind === 'loaded' ? boards.value.find((candidate) => candidate.id === boardId) : undefined
  const columnNames = columns.kind === 'loaded' ? columns.value : []
  const chosenInBoardOrder = columnNames.filter((name) => chosen.has(name))

  const chooseBoard = (id: number) => {
    setBoardId(id)
    setChosen(new Set(id === saved?.boardId ? saved.columns : []))
  }
  const toggle = (name: string) => {
    const next = new Set(chosen)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setChosen(next)
  }
  const save = (clear: boolean) => {
    onClose()
    const filter = clear || !board ? null : { boardId: board.id, boardName: board.name, columns: chosenInBoardOrder }
    void controller.run(
      'Saving Jira columns',
      async () => controller.setJira(await kraft.saveJiraColumnFilter(filter)),
      filter ? `Showing ${filter.columns.join(', ')} from ${filter.boardName}` : 'Showing all your open issues'
    )
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
        <h2>Jira columns</h2>
        <p className="muted">Your assigned list only shows issues in the columns you tick. Search still finds issues in any column.</p>

        <label className="text-field">
          <span>Board</span>
          {boards.kind === 'loaded' ? (
            <select autoFocus value={boardId ?? ''} onChange={(event) => chooseBoard(Number(event.target.value))}>
              <option value="" disabled>
                Choose a board…
              </option>
              {boards.value.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                  {candidate.projectKey ? ` (${candidate.projectKey})` : ''}
                </option>
              ))}
            </select>
          ) : (
            <LoadStatus state={boards} what="boards" />
          )}
        </label>

        {boardId !== null && (
          <div className="text-field">
            <span>Columns</span>
            {columns.kind === 'loaded' ? (
              columnNames.length === 0 ? (
                <span className="muted">This board has no columns.</span>
              ) : (
                <div className="column-choices">
                  {columnNames.map((name) => (
                    <label key={name} className="checkbox-field">
                      <input type="checkbox" checked={chosen.has(name)} onChange={() => toggle(name)} />
                      {name}
                    </label>
                  ))}
                </div>
              )
            ) : (
              <LoadStatus state={columns} what="columns" />
            )}
          </div>
        )}

        <div className="modal-buttons">
          {saved && (
            <button type="button" className="secondary" onClick={() => save(true)}>
              Show all open issues
            </button>
          )}
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!board || chosenInBoardOrder.length === 0} onClick={() => save(false)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function LoadStatus<T>({ state, what }: { state: Loadable<T>; what: string }) {
  if (state.kind === 'failed') return <span className="error-text">Could not load {what}: {state.message}</span>
  return <span className="muted">Loading {what}…</span>
}
