import {
  addFolder,
  addRepository,
  defaultRepositoryName,
  findRepository,
  moveEntry,
  removeFolder,
  removeRepository,
  renameFolder,
  renameRepository,
  type EntryRef,
  type LibraryDestination,
  type RepositoryLibrary
} from '../domain/repositoryLibrary'
import { mapWithConcurrency } from './concurrency'
import type { SavedRepositories } from './kraftService'
import type { GitRepositoryFactory } from './ports'
import type { RepositoryLibraryApi, RepositoryScan } from './repositoryLibraryApi'

export interface RepositoryLibraryStore {
  load(): Promise<RepositoryLibrary>
  save(library: RepositoryLibrary): Promise<void>
}

export interface FoundRepositoryFolders {
  /** Folders that contain a `.git`. */
  folders: string[]
  foldersSearched: number
  complete: boolean
}

export interface RepositoryFinder {
  findRepositoryFolders(root: string): Promise<FoundRepositoryFolders>
}

/** How many git processes a scan starts at once. */
const gitConcurrency = 8

export class RepositoryLibraryService implements RepositoryLibraryApi, SavedRepositories {
  /** Changes run one at a time so that two quick edits never overwrite each other's file write. */
  private lastChange: Promise<unknown> = Promise.resolve()

  constructor(
    private readonly store: RepositoryLibraryStore,
    private readonly finder: RepositoryFinder,
    private readonly repositories: GitRepositoryFactory,
    private readonly newId: () => string = () => crypto.randomUUID()
  ) {}

  repositoryLibrary(): Promise<RepositoryLibrary> {
    return this.store.load()
  }

  async remember(path: string): Promise<void> {
    await this.change((library) => addRepository(library, path))
  }

  renameRepository(path: string, name: string): Promise<RepositoryLibrary> {
    return this.change((library) => renameRepository(library, path, name))
  }

  removeRepository(path: string): Promise<RepositoryLibrary> {
    return this.change((library) => removeRepository(library, path))
  }

  createRepositoryFolder(name: string, repositoryPath?: string): Promise<RepositoryLibrary> {
    const id = this.newId()
    return this.change((library) => {
      const withFolder = addFolder(library, id, name)
      return repositoryPath
        ? moveEntry(withFolder, { kind: 'repository', path: repositoryPath }, { folderId: id, before: null })
        : withFolder
    })
  }

  renameRepositoryFolder(id: string, name: string): Promise<RepositoryLibrary> {
    return this.change((library) => renameFolder(library, id, name))
  }

  removeRepositoryFolder(id: string): Promise<RepositoryLibrary> {
    return this.change((library) => removeFolder(library, id))
  }

  moveLibraryEntry(ref: EntryRef, destination: LibraryDestination): Promise<RepositoryLibrary> {
    return this.change((library) => moveEntry(library, ref, destination))
  }

  async scanForRepositories(root: string): Promise<RepositoryScan> {
    const found = await this.finder.findRepositoryFolders(root)
    // Git's own spelling of each path, so a scanned repository matches the one saved when it was opened.
    const gitPaths = await mapWithConcurrency(found.folders, gitConcurrency, (folder) =>
      this.repositories.open(folder).then(
        (repository) => repository.path,
        () => null
      )
    )
    const library = await this.store.load()
    const paths = [...new Set(gitPaths.filter((path): path is string => path !== null))]
    return {
      root,
      repositories: paths.map((path) => ({ path, name: defaultRepositoryName(path), alreadySaved: findRepository(library, path) !== undefined })),
      unreadable: found.folders.filter((_, index) => gitPaths[index] === null),
      foldersSearched: found.foldersSearched,
      complete: found.complete
    }
  }

  addRepositories(paths: string[], folderName: string | null): Promise<RepositoryLibrary> {
    const folderId = this.newId()
    return this.change((library) => {
      const newPaths = [...new Set(paths)].filter((path) => !findRepository(library, path))
      const withRepositories = newPaths.reduce(addRepository, library)
      if (folderName === null || newPaths.length === 0) return withRepositories
      return newPaths.reduce(
        (updated, path) => moveEntry(updated, { kind: 'repository', path }, { folderId, before: null }),
        addFolder(withRepositories, folderId, folderName)
      )
    })
  }

  private change(update: (library: RepositoryLibrary) => RepositoryLibrary): Promise<RepositoryLibrary> {
    const result = this.lastChange.then(async () => {
      const updated = update(await this.store.load())
      await this.store.save(updated)
      return updated
    })
    // A failed change must not block the ones after it; its caller still gets the error.
    this.lastChange = result.catch(() => undefined)
    return result
  }
}
