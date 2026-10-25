import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  findRepository,
  type EntryRef,
  type LibraryDestination,
  type LocatedRepository,
  type RepositoryFolder
} from '../../../domain/repositoryLibrary'
import { kraft } from '../kraftClient'
import { showAddRepositoryMenu, showFolderTabMenu, showRepositoryTabMenu } from '../libraryActions'
import type { RepositoryController } from '../useRepositoryController'
import { FolderIcon, RepositoryIcon } from './Icons'

/** Marks drags that carry a tab, so other drags (e.g. files) are ignored. */
const tabDragType = 'application/x-kraft-tab'

/**
 * The saved repositories as tabs. Folders open a second row with their repositories;
 * tabs can be dragged onto folders or between other tabs.
 */
export function RepositoryTabs({ controller }: { controller: RepositoryController }) {
  const { library } = controller
  const activePath = controller.view?.path ?? null
  const activeFolderId = activePath ? (findRepository(library, activePath)?.folderId ?? null) : null
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const drag = useTabDrag(controller, setOpenFolderId)

  useEffect(() => {
    if (activeFolderId) setOpenFolderId(activeFolderId)
  }, [activeFolderId])

  const openFolder = library.entries.find((entry) => entry.kind === 'folder' && entry.id === openFolderId) as
    | RepositoryFolder
    | undefined

  return (
    <div className="repo-tabs-area">
      <div className="repo-tabs" {...drag.rowTarget(null)}>
        {library.entries.map((entry) =>
          entry.kind === 'repository' ? (
            <RepositoryTab
              key={entry.path}
              controller={controller}
              repository={{ path: entry.path, name: entry.name, folderId: null }}
              active={entry.path === activePath}
              drag={drag}
            />
          ) : (
            <button
              key={entry.id}
              className={`repo-tab folder ${entry.id === openFolderId ? 'open' : ''} ${entry.id === activeFolderId ? 'has-active' : ''} ${drag.isTarget(entry) ? 'drop-target' : ''}`}
              title={`Folder: ${entry.name}\n${entry.repositories.map((repository) => `  ${repository.name}`).join('\n') || '  (empty)'}`}
              draggable
              onClick={() => setOpenFolderId(entry.id === openFolderId ? null : entry.id)}
              onContextMenu={(event) => showFolderTabMenu(controller, event, entry)}
              {...drag.source({ kind: 'folder', id: entry.id })}
              {...drag.folderTarget(entry.id)}
            >
              <FolderIcon open={entry.id === openFolderId} />
              <span className="repo-tab-name">{entry.name}</span>
              <span className="folder-count">{entry.repositories.length}</span>
              <span className="folder-chevron">{entry.id === openFolderId ? '▴' : '▾'}</span>
            </button>
          )
        )}
        <button className="repo-tab add-tab" title="Open, clone or scan for repositories" onClick={(event) => showAddRepositoryMenu(controller, event)}>
          +
        </button>
        <span className="repo-tabs-spacer" />
        <button className="icon-button settings-button" title="Settings" onClick={controller.openSettings}>
          ⚙
        </button>
      </div>
      {openFolder && (
        <div className="repo-tabs sub-tabs" {...drag.rowTarget(openFolder.id)}>
          <span className="sub-tabs-label">
            <FolderIcon open />
            {openFolder.name}
          </span>
          {openFolder.repositories.map((repository) => (
            <RepositoryTab
              key={repository.path}
              controller={controller}
              repository={{ ...repository, folderId: openFolder.id }}
              active={repository.path === activePath}
              drag={drag}
            />
          ))}
          {openFolder.repositories.length === 0 && (
            <span className="muted small">Drag tabs here, or right-click a tab and choose Move to "{openFolder.name}".</span>
          )}
        </div>
      )}
    </div>
  )
}

interface RepositoryTabProps {
  controller: RepositoryController
  repository: LocatedRepository
  active: boolean
  drag: TabDrag
}

function RepositoryTab({ controller, repository, active, drag }: RepositoryTabProps) {
  const ref: EntryRef = { kind: 'repository', path: repository.path }
  return (
    <button
      className={`repo-tab ${active ? 'active' : ''} ${drag.isTarget(ref) ? 'drop-target' : ''}`}
      title={`Repository: ${repository.name}\n${repository.path}`}
      draggable
      onClick={() => !active && void controller.openRepository(repository.path)}
      onContextMenu={(event) => showRepositoryTabMenu(controller, event, repository)}
      {...drag.source(ref)}
      {...drag.repositoryTarget(repository)}
    >
      <RepositoryIcon />
      <span className="repo-tab-name">{repository.name}</span>
    </button>
  )
}

type TabDrag = ReturnType<typeof useTabDrag>

function useTabDrag(controller: RepositoryController, openFolder: (id: string) => void) {
  const dragged = useRef<EntryRef | null>(null)
  const [targetKey, setTargetKey] = useState<string | null>(null)

  const keyOf = (ref: EntryRef) => (ref.kind === 'repository' ? `repository:${ref.path}` : `folder:${ref.id}`)

  /** Handlers for dropping where `destination` says, if that destination is allowed for the dragged tab. */
  const target = (key: string, destinationFor: (ref: EntryRef) => LibraryDestination | null) => {
    const accept = (event: DragEvent) => {
      const ref = dragged.current
      if (!ref || !event.dataTransfer.types.includes(tabDragType) || !destinationFor(ref)) return null
      event.preventDefault()
      event.stopPropagation()
      return ref
    }
    return {
      onDragOver: (event: DragEvent) => {
        if (!accept(event)) return
        event.dataTransfer.dropEffect = 'move'
        setTargetKey(key)
      },
      onDragLeave: () => setTargetKey((current) => (current === key ? null : current)),
      onDrop: (event: DragEvent) => {
        const ref = accept(event)
        const destination = ref && destinationFor(ref)
        setTargetKey(null)
        dragged.current = null
        if (!ref || !destination) return
        if (destination.folderId) openFolder(destination.folderId)
        void controller.changeLibrary(() => kraft.moveLibraryEntry(ref, destination))
      }
    }
  }

  return {
    isTarget: (entry: EntryRef) => targetKey === keyOf(entry),
    source: (ref: EntryRef) => ({
      onDragStart: (event: DragEvent) => {
        dragged.current = ref
        event.dataTransfer.setData(tabDragType, keyOf(ref))
        event.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: () => {
        dragged.current = null
        setTargetKey(null)
      }
    }),
    /** Dropping on a repository tab puts the dragged tab just before it. */
    repositoryTarget: (repository: LocatedRepository) =>
      target(keyOf({ kind: 'repository', path: repository.path }), (ref) =>
        ref.kind === 'folder' && repository.folderId !== null
          ? null
          : { folderId: repository.folderId, before: { kind: 'repository', path: repository.path } }
      ),
    /** Dropping a repository on a folder moves it into the folder; dropping a folder reorders the top row. */
    folderTarget: (folderId: string) =>
      target(keyOf({ kind: 'folder', id: folderId }), (ref) =>
        ref.kind === 'repository' ? { folderId, before: null } : { folderId: null, before: { kind: 'folder', id: folderId } }
      ),
    /** Dropping on the empty part of a row puts the tab last in that row. */
    rowTarget: (folderId: string | null) =>
      target(`row:${folderId ?? ''}`, (ref) => (ref.kind === 'folder' && folderId !== null ? null : { folderId, before: null }))
  }
}
