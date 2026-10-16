import { useEffect, useState, type KeyboardEvent } from 'react'
import { refOf, type EntryRef, type LocatedRepository, type RepositoryFolder } from '../../../domain/repositoryLibrary'
import type { AvatarStyle } from '../avatars'
import { askDisconnectJira, askJiraSettings } from '../jiraActions'
import { kraft } from '../kraftClient'
import { askCreateFolder, askRemoveFolder, moveRepositoryToFolder, removeSavedRepository, scanFolderForRepositories } from '../libraryActions'
import type { RepositoryController } from '../useRepositoryController'
import { FolderIcon, RepositoryIcon } from './Icons'
import { JiraColumnsDialog } from './JiraColumnsDialog'

type SettingsPage = 'repositories' | 'appearance' | 'jira'

const pages: { id: SettingsPage; label: string }[] = [
  { id: 'repositories', label: 'Repositories' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'jira', label: 'Jira' }
]

const avatarChoices: { style: AvatarStyle; label: string; description: string }[] = [
  { style: 'initials', label: 'Initials', description: "Made from the author's name. Nothing leaves your computer." },
  {
    style: 'gravatar',
    label: 'Profile pictures (Gravatar / GitHub)',
    description:
      "Pictures from gravatar.com, looked up by a hash of each author's email. Commits made on github.com (with a GitHub " +
      'no-reply address) show that GitHub account’s picture. Authors without a picture keep their initials.'
  }
]

export function SettingsDialog({ controller, onClose }: { controller: RepositoryController; onClose: () => void }) {
  const [page, setPage] = useState<SettingsPage>('repositories')
  const [choosingColumns, setChoosingColumns] = useState(false)

  return (
    <>
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div
          className="modal settings"
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.key === 'Escape' && onClose()}
        >
          <div className="settings-header">
            <h2>Settings</h2>
            <button className="icon-button" title="Close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="settings-body">
            <nav className="settings-nav">
              {pages.map((candidate) => (
                <button
                  key={candidate.id}
                  className={`settings-nav-item ${candidate.id === page ? 'active' : ''}`}
                  onClick={() => setPage(candidate.id)}
                >
                  {candidate.label}
                </button>
              ))}
            </nav>
            <div className="settings-page">
              {page === 'repositories' ? (
                <RepositoriesPage controller={controller} />
              ) : page === 'appearance' ? (
                <AppearancePage controller={controller} />
              ) : (
                <JiraPage controller={controller} onChooseColumns={() => setChoosingColumns(true)} />
              )}
            </div>
          </div>
        </div>
      </div>
      {/* Outside the settings backdrop, so clicks in this dialog don't close the settings too. */}
      {choosingColumns && <JiraColumnsDialog controller={controller} onClose={() => setChoosingColumns(false)} />}
    </>
  )
}

function RepositoriesPage({ controller }: { controller: RepositoryController }) {
  const { entries } = controller.library
  const folders = entries.filter((entry): entry is { kind: 'folder' } & RepositoryFolder => entry.kind === 'folder')
  const topLevel = entries.map(refOf)

  return (
    <>
      <div className="settings-intro">
        <p className="muted">
          Repositories are saved when you open them. Rename them, group them in folders and set the order of the tabs here, or drag
          the tabs themselves.
        </p>
        <div className="settings-intro-buttons">
          <button className="secondary small" onClick={() => void scanFolderForRepositories(controller)}>
            Scan folder…
          </button>
          <button className="secondary small" onClick={() => askCreateFolder(controller)}>
            + New folder
          </button>
        </div>
      </div>
      {entries.length === 0 && <div className="empty-state">No saved repositories yet.</div>}
      <ul className="library-list">
        {entries.map((entry, index) =>
          entry.kind === 'repository' ? (
            <RepositoryRow
              key={entry.path}
              controller={controller}
              repository={{ path: entry.path, name: entry.name, folderId: null }}
              folders={folders}
              siblings={topLevel}
              index={index}
            />
          ) : (
            <li key={entry.id} className="library-folder">
              <div className="library-row folder-row">
                <MoveButtons controller={controller} entry={refOf(entry)} siblings={topLevel} index={index} folderId={null} />
                <span className="library-icon folder-icon">
                  <FolderIcon open />
                </span>
                <EditableName
                  value={entry.name}
                  label="Folder name"
                  onSave={(name) => void controller.changeLibrary(() => kraft.renameRepositoryFolder(entry.id, name))}
                />
                <span className="section-count">{entry.repositories.length}</span>
                <button className="icon-button danger-icon" title="Remove folder (keeps repositories)" onClick={() => askRemoveFolder(controller, entry)}>
                  ✕
                </button>
              </div>
              <ul className="library-list nested">
                {entry.repositories.length === 0 && <li className="muted small library-empty">Empty folder</li>}
                {entry.repositories.map((repository, repositoryIndex) => (
                  <RepositoryRow
                    key={repository.path}
                    controller={controller}
                    repository={{ ...repository, folderId: entry.id }}
                    folders={folders}
                    siblings={entry.repositories.map((sibling) => ({ kind: 'repository', path: sibling.path }))}
                    index={repositoryIndex}
                  />
                ))}
              </ul>
            </li>
          )
        )}
      </ul>
    </>
  )
}

interface RepositoryRowProps {
  controller: RepositoryController
  repository: LocatedRepository
  folders: RepositoryFolder[]
  /** The entries in the same row, for moving up and down. */
  siblings: EntryRef[]
  index: number
}

function RepositoryRow({ controller, repository, folders, siblings, index }: RepositoryRowProps) {
  return (
    <li className="library-row">
      <MoveButtons
        controller={controller}
        entry={{ kind: 'repository', path: repository.path }}
        siblings={siblings}
        index={index}
        folderId={repository.folderId}
      />
      <span className="library-icon">
        <RepositoryIcon />
      </span>
      <div className="library-repository">
        <EditableName
          value={repository.name}
          label="Repository name"
          onSave={(name) => void controller.changeLibrary(() => kraft.renameRepository(repository.path, name))}
        />
        <span className="muted small library-path" title={repository.path}>
          {repository.path}
        </span>
      </div>
      <select
        className="library-folder-select"
        title="Folder"
        value={repository.folderId ?? ''}
        onChange={(event) => moveRepositoryToFolder(controller, repository.path, event.target.value || null)}
      >
        <option value="">No folder</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
      <button className="icon-button danger-icon" title="Remove tab (files are kept)" onClick={() => removeSavedRepository(controller, repository)}>
        ✕
      </button>
    </li>
  )
}

interface MoveButtonsProps {
  controller: RepositoryController
  entry: EntryRef
  siblings: EntryRef[]
  index: number
  folderId: string | null
}

function MoveButtons({ controller, entry, siblings, index, folderId }: MoveButtonsProps) {
  // Moving down means going before the entry after the next one (or last).
  const move = (before: EntryRef | null) => void controller.changeLibrary(() => kraft.moveLibraryEntry(entry, { folderId, before }))
  return (
    <span className="move-buttons">
      <button className="icon-button" title="Move left" disabled={index === 0} onClick={() => move(siblings[index - 1])}>
        ▲
      </button>
      <button className="icon-button" title="Move right" disabled={index === siblings.length - 1} onClick={() => move(siblings[index + 2] ?? null)}>
        ▼
      </button>
    </span>
  )
}

/** A name that is saved when the field loses focus or Enter is pressed; Escape undoes the edit. */
function EditableName({ value, label, onSave }: { value: string; label: string; onSave: (name: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const commit = () => {
    const name = draft.trim()
    if (!name) setDraft(value)
    else if (name !== value) onSave(name)
  }
  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      // Undo the edit instead of closing the settings.
      event.stopPropagation()
      setDraft(value)
    }
  }

  return <input className="editable-name" aria-label={label} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={handleKey} />
}

function AppearancePage({ controller }: { controller: RepositoryController }) {
  return (
    <fieldset className="settings-choice">
      <legend>Commit avatars</legend>
      {avatarChoices.map((choice) => (
        <label key={choice.style} className={`choice ${controller.avatarStyle === choice.style ? 'chosen' : ''}`}>
          <input
            type="radio"
            name="avatar-style"
            checked={controller.avatarStyle === choice.style}
            onChange={() => controller.setAvatarStyle(choice.style)}
          />
          <span>
            <span className="choice-label">{choice.label}</span>
            <span className="muted small choice-description">{choice.description}</span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

function JiraPage({ controller, onChooseColumns }: { controller: RepositoryController; onChooseColumns: () => void }) {
  const jira = controller.jira
  if (!jira) {
    return (
      <>
        <p className="muted">Jira is not connected. Connect it to see your issues in the sidebar and start branches from them.</p>
        <div>
          <button className="primary" onClick={() => askJiraSettings(controller)}>
            Connect Jira
          </button>
        </div>
      </>
    )
  }
  return (
    <>
      <dl className="settings-facts">
        <dt>Site</dt>
        <dd>{jira.baseUrl}</dd>
        <dt>Type</dt>
        <dd>{jira.deployment === 'cloud' ? 'Jira Cloud' : 'Jira Server / Data Center'}</dd>
        <dt>Signed in as</dt>
        <dd>
          {jira.userName}
          {jira.email ? ` (${jira.email})` : ''}
        </dd>
        <dt>Project keys</dt>
        <dd>{jira.projectKeys.length > 0 ? jira.projectKeys.join(', ') : 'All projects'}</dd>
        <dt>My issues show</dt>
        <dd>{jira.columnFilter ? `${jira.columnFilter.columns.join(', ')} on ${jira.columnFilter.boardName}` : 'All open issues'}</dd>
      </dl>
      <div className="settings-actions">
        <button className="secondary" onClick={() => askJiraSettings(controller)}>
          Edit connection…
        </button>
        <button className="secondary" onClick={onChooseColumns}>
          Choose board columns…
        </button>
        <button className="danger-button" onClick={() => askDisconnectJira(controller)}>
          Disconnect
        </button>
      </div>
    </>
  )
}
