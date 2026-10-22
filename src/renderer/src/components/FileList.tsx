import type { MouseEvent } from 'react'
import type { FileChange, FileChangeStatus } from '../../../domain/entities'
import type { SelectionMode } from '../fileSelection'

const statusLetters: Record<FileChangeStatus, string> = {
  added: '+',
  modified: '✎',
  deleted: '−',
  renamed: '→',
  untracked: '+',
  conflicted: '!'
}

export interface FileAction {
  label: string
  title: string
  danger?: boolean
  onClick: (change: FileChange) => void
}

interface FileListProps {
  changes: FileChange[]
  isSelected: (change: FileChange) => boolean
  onOpen: (change: FileChange) => void
  /** Called when the file whose diff is open is clicked again. */
  onClose: () => void
  /** Ctrl/Cmd- or shift-click; without it those clicks open the file like a plain click. */
  onSelectMore?: (change: FileChange, mode: SelectionMode) => void
  actions?: FileAction[]
}

function selectionMode(event: MouseEvent): SelectionMode | null {
  if (event.shiftKey) return 'range'
  return event.ctrlKey || event.metaKey ? 'toggle' : null
}

export function FileList({ changes, isSelected, onOpen, onClose, onSelectMore, actions = [] }: FileListProps) {
  const click = (event: MouseEvent, change: FileChange, selected: boolean) => {
    const mode = selectionMode(event)
    if (mode && onSelectMore) onSelectMore(change, mode)
    else if (selected) onClose()
    else onOpen(change)
  }

  return (
    <ul className="file-list">
      {changes.map((change) => {
        const separator = change.path.lastIndexOf('/')
        const directory = separator === -1 ? '' : change.path.slice(0, separator + 1)
        const fileName = change.path.slice(separator + 1)
        const selected = isSelected(change)
        return (
          <li
            key={`${change.status}:${change.path}`}
            className={`file-item ${selected ? 'selected' : ''}`}
            title={change.path}
            onMouseDown={(event) => onSelectMore && selectionMode(event) && event.preventDefault()}
            onClick={(event) => click(event, change, selected)}
          >
            <span className={`file-status ${change.status}`}>{statusLetters[change.status]}</span>
            <span className="file-path">
              <span className="file-directory">{directory}</span>
              {fileName}
            </span>
            <span className="file-actions">
              {actions.map((action) => (
                <button
                  key={action.label}
                  className={`file-action ${action.danger ? 'danger' : ''}`}
                  title={action.title}
                  onClick={(event) => {
                    event.stopPropagation()
                    action.onClick(change)
                  }}
                >
                  {action.label}
                </button>
              ))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
