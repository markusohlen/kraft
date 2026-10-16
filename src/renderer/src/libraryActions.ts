import type { MouseEvent } from 'react'
import { findRepository, type LocatedRepository, type RepositoryFolder } from '../../domain/repositoryLibrary'
import { kraft } from './kraftClient'
import type { MenuItem, RepositoryController } from './useRepositoryController'

export async function openOtherRepository(controller: RepositoryController): Promise<void> {
  const folder = await kraft.chooseRepositoryFolder()
  if (folder) await controller.openRepository(folder)
}

/** Asks for a folder and opens the dialog that finds and adds the repositories inside it. */
export async function scanFolderForRepositories(controller: RepositoryController): Promise<void> {
  const folder = await kraft.chooseRepositoryFolder('Choose a folder to scan for repositories')
  if (folder) controller.openScan(folder)
}

/** The tab row's "+" button: open one repository, or add every repository in a folder. */
export function showAddRepositoryMenu(controller: RepositoryController, event: MouseEvent<HTMLElement>): void {
  const button = event.currentTarget.getBoundingClientRect()
  controller.showMenu({
    x: button.left,
    y: button.bottom,
    items: [
      { label: 'Open repository…', onSelect: () => void openOtherRepository(controller) },
      { label: 'Scan a folder for repositories…', onSelect: () => void scanFolderForRepositories(controller) }
    ]
  })
}

/** The name on the open repository's tab, which the user may have changed. */
export function repositoryDisplayName(controller: RepositoryController): string {
  const view = controller.view
  if (!view) return ''
  return findRepository(controller.library, view.path)?.name ?? view.name
}

export function askRenameRepository(controller: RepositoryController, repository: LocatedRepository): void {
  controller.ask({
    title: 'Rename repository',
    description: `Only the name on the tab changes; ${repository.path} stays as it is.`,
    fields: [{ name: 'name', label: 'Name', type: 'text', initial: repository.name }],
    confirmLabel: 'Rename',
    onSubmit: ({ name }) => void controller.changeLibrary(() => kraft.renameRepository(repository.path, String(name)))
  })
}

export function askCreateFolder(controller: RepositoryController, repositoryPath?: string): void {
  controller.ask({
    title: 'New folder',
    description: repositoryPath ? 'The repository is moved into the new folder.' : 'Drag repository tabs onto the folder to add them.',
    fields: [{ name: 'name', label: 'Folder name', type: 'text', initial: '', placeholder: 'Work' }],
    confirmLabel: 'Create folder',
    onSubmit: ({ name }) => void controller.changeLibrary(() => kraft.createRepositoryFolder(String(name), repositoryPath))
  })
}

export function askRenameFolder(controller: RepositoryController, folder: RepositoryFolder): void {
  controller.ask({
    title: 'Rename folder',
    fields: [{ name: 'name', label: 'Folder name', type: 'text', initial: folder.name }],
    confirmLabel: 'Rename',
    onSubmit: ({ name }) => void controller.changeLibrary(() => kraft.renameRepositoryFolder(folder.id, String(name)))
  })
}

export function askRemoveFolder(controller: RepositoryController, folder: RepositoryFolder): void {
  controller.ask({
    title: `Remove folder "${folder.name}"?`,
    description: 'Its repositories move back to the top row.',
    fields: [],
    confirmLabel: 'Remove folder',
    danger: true,
    onSubmit: () => void controller.changeLibrary(() => kraft.removeRepositoryFolder(folder.id))
  })
}

export function removeSavedRepository(controller: RepositoryController, repository: LocatedRepository): void {
  void controller.changeLibrary(() => kraft.removeRepository(repository.path))
}

export function moveRepositoryToFolder(controller: RepositoryController, path: string, folderId: string | null): void {
  void controller.changeLibrary(() => kraft.moveLibraryEntry({ kind: 'repository', path }, { folderId, before: null }))
}

export function showRepositoryTabMenu(controller: RepositoryController, event: MouseEvent, repository: LocatedRepository): void {
  event.preventDefault()
  const folders = controller.library.entries.filter((entry) => entry.kind === 'folder')
  const currentFolder = folders.find((folder) => folder.id === repository.folderId)
  const isOpen = controller.view?.path === repository.path
  const items: MenuItem[] = [
    ...(isOpen ? [] : [{ label: 'Open', onSelect: () => void controller.openRepository(repository.path) }]),
    { label: 'Rename…', onSelect: () => askRenameRepository(controller, repository) },
    ...folders
      .filter((folder) => folder.id !== repository.folderId)
      .map((folder) => ({ label: `Move to "${folder.name}"`, onSelect: () => moveRepositoryToFolder(controller, repository.path, folder.id) })),
    { label: 'Move to new folder…', onSelect: () => askCreateFolder(controller, repository.path) },
    ...(currentFolder
      ? [{ label: `Take out of "${currentFolder.name}"`, onSelect: () => moveRepositoryToFolder(controller, repository.path, null) }]
      : []),
    { label: 'Remove tab (files are kept)', danger: true, onSelect: () => removeSavedRepository(controller, repository) }
  ]
  controller.showMenu({ x: event.clientX, y: event.clientY, items })
}

export function showFolderTabMenu(controller: RepositoryController, event: MouseEvent, folder: RepositoryFolder): void {
  event.preventDefault()
  controller.showMenu({
    x: event.clientX,
    y: event.clientY,
    items: [
      { label: 'Rename folder…', onSelect: () => askRenameFolder(controller, folder) },
      { label: 'Remove folder (keeps repositories)', danger: true, onSelect: () => askRemoveFolder(controller, folder) }
    ]
  })
}
