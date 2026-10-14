import type { FileChange, FileChangeStatus } from '../../../domain/entities'

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
  actions?: FileAction[]
}

export function FileList({ changes, isSelected, onOpen, actions = [] }: FileListProps) {
  return (
    <ul className="file-list">
      {changes.map((change) => {
        const separator = change.path.lastIndexOf('/')
        const directory = separator === -1 ? '' : change.path.slice(0, separator + 1)
        const fileName = change.path.slice(separator + 1)
        return (
          <li
            key={`${change.status}:${change.path}`}
            className={`file-item ${isSelected(change) ? 'selected' : ''}`}
            title={change.path}
            onClick={() => onOpen(change)}
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
