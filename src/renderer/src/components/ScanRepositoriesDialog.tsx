import { useEffect, useState } from 'react'
import type { RepositoryScan } from '../../../application/repositoryLibraryApi'
import { defaultRepositoryName } from '../../../domain/repositoryLibrary'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'
import { RepositoryIcon } from './Icons'

type ScanState = { kind: 'scanning' } | { kind: 'done'; scan: RepositoryScan } | { kind: 'failed'; message: string }

/** Scans a folder for git repositories and lets the user pick which ones to save as tabs. */
export function ScanRepositoriesDialog({ controller, root, onClose }: { controller: RepositoryController; root: string; onClose: () => void }) {
  const [state, setState] = useState<ScanState>({ kind: 'scanning' })
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [inFolder, setInFolder] = useState(false)
  const [folderName, setFolderName] = useState(defaultRepositoryName(root))

  useEffect(() => {
    let current = true
    kraft.scanForRepositories(root).then(
      (scan) => {
        if (!current) return
        setState({ kind: 'done', scan })
        setChosen(new Set(scan.repositories.filter((repository) => !repository.alreadySaved).map((repository) => repository.path)))
      },
      (error: Error) => current && setState({ kind: 'failed', message: error.message })
    )
    return () => {
      current = false
    }
  }, [root])

  const newRepositories = state.kind === 'done' ? state.scan.repositories.filter((repository) => !repository.alreadySaved) : []
  const allChosen = newRepositories.length > 0 && newRepositories.every((repository) => chosen.has(repository.path))

  const toggle = (path: string) => {
    const next = new Set(chosen)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    setChosen(next)
  }
  const toggleAll = () => setChosen(new Set(allChosen ? [] : newRepositories.map((repository) => repository.path)))
  const add = () => {
    const paths = newRepositories.map((repository) => repository.path).filter((path) => chosen.has(path))
    const folder = inFolder && folderName.trim() ? folderName.trim() : null
    onClose()
    void controller.changeLibrary(async () => {
      const library = await kraft.addRepositories(paths, folder)
      controller.notify('info', `Added ${paths.length} ${paths.length === 1 ? 'repository' : 'repositories'}${folder ? ` to "${folder}"` : ''}`)
      return library
    })
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal scan-dialog" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.key === 'Escape' && onClose()}>
        <h2>Add repositories from a folder</h2>
        <p className="muted small scan-root" title={root}>
          {root}
        </p>

        {state.kind === 'scanning' && <div className="empty-state">Looking for git repositories…</div>}
        {state.kind === 'failed' && <div className="empty-state error-text">{state.message}</div>}
        {state.kind === 'done' && (
          <>
            <div className="scan-summary">
              <span className="muted small">
                Found {state.scan.repositories.length} {state.scan.repositories.length === 1 ? 'repository' : 'repositories'} in{' '}
                {state.scan.foldersSearched.toLocaleString()} folders
                {newRepositories.length < state.scan.repositories.length &&
                  ` · ${state.scan.repositories.length - newRepositories.length} already saved`}
              </span>
              {newRepositories.length > 1 && (
                <button className="link-button" onClick={toggleAll}>
                  {allChosen ? 'Select none' : 'Select all'}
                </button>
              )}
            </div>
            {!state.scan.complete && (
              <div className="conflict-banner">The folder has too many subfolders, so the scan stopped early. Scan a smaller folder to find the rest.</div>
            )}
            {state.scan.repositories.length === 0 ? (
              <div className="empty-state">No git repositories in this folder.</div>
            ) : (
              <ul className="scan-list">
                {state.scan.repositories.map((repository) => (
                  <li key={repository.path}>
                    <label className={`scan-item ${repository.alreadySaved ? 'saved' : ''}`}>
                      <input
                        type="checkbox"
                        checked={repository.alreadySaved || chosen.has(repository.path)}
                        disabled={repository.alreadySaved}
                        onChange={() => toggle(repository.path)}
                      />
                      <span className="library-icon">
                        <RepositoryIcon />
                      </span>
                      <span className="scan-name">{repository.name}</span>
                      <span className="muted small scan-path" title={repository.path}>
                        {repository.alreadySaved ? 'already saved' : repository.path}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {state.scan.unreadable.length > 0 && (
              <p className="muted small" title={state.scan.unreadable.join('\n')}>
                {state.scan.unreadable.length} {state.scan.unreadable.length === 1 ? 'folder looks' : 'folders look'} like a repository but git
                could not open {state.scan.unreadable.length === 1 ? 'it' : 'them'}.
              </p>
            )}
            {newRepositories.length > 0 && (
              <div className="scan-folder-option">
                <label className="checkbox-field">
                  <input type="checkbox" checked={inFolder} onChange={(event) => setInFolder(event.target.checked)} />
                  Put them in a new folder
                </label>
                {inFolder && <input aria-label="Folder name" value={folderName} onChange={(event) => setFolderName(event.target.value)} />}
              </div>
            )}
          </>
        )}

        <div className="modal-buttons">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={chosen.size === 0 || (inFolder && !folderName.trim())} onClick={add}>
            {chosen.size === 0 ? 'Add repositories' : `Add ${chosen.size} ${chosen.size === 1 ? 'repository' : 'repositories'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
