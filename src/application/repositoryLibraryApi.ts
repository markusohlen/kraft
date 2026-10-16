import type { EntryRef, LibraryDestination, RepositoryLibrary } from '../domain/repositoryLibrary'

export interface FoundRepository {
  path: string
  name: string
  alreadySaved: boolean
}

/** The repositories found below a folder. */
export interface RepositoryScan {
  root: string
  repositories: FoundRepository[]
  /** Folders with a `.git` that git could not open, e.g. broken or owned by another user. */
  unreadable: string[]
  foldersSearched: number
  /** False when the scan stopped early because the folder holds too many subfolders. */
  complete: boolean
}

/** Operations on the saved repositories shown as tabs. Each change returns the updated library. */
export interface RepositoryLibraryApi {
  repositoryLibrary(): Promise<RepositoryLibrary>
  renameRepository(path: string, name: string): Promise<RepositoryLibrary>
  removeRepository(path: string): Promise<RepositoryLibrary>
  /** Creates a folder, optionally moving a repository into it right away. */
  createRepositoryFolder(name: string, repositoryPath?: string): Promise<RepositoryLibrary>
  renameRepositoryFolder(id: string, name: string): Promise<RepositoryLibrary>
  removeRepositoryFolder(id: string): Promise<RepositoryLibrary>
  moveLibraryEntry(ref: EntryRef, destination: LibraryDestination): Promise<RepositoryLibrary>
  scanForRepositories(root: string): Promise<RepositoryScan>
  /** Saves several repositories at once; with a folder name they are put in a new folder. */
  addRepositories(paths: string[], folderName: string | null): Promise<RepositoryLibrary>
}

export type RepositoryLibraryMethod = keyof RepositoryLibraryApi

export const repositoryLibraryMethods: readonly RepositoryLibraryMethod[] = [
  'repositoryLibrary',
  'renameRepository',
  'removeRepository',
  'createRepositoryFolder',
  'renameRepositoryFolder',
  'removeRepositoryFolder',
  'moveLibraryEntry',
  'scanForRepositories',
  'addRepositories'
]
