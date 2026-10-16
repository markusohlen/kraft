/** A repository the user has opened, with the name shown on its tab. */
export interface SavedRepository {
  path: string
  name: string
}

export interface RepositoryFolder {
  id: string
  name: string
  repositories: SavedRepository[]
}

/** One tab in the top row: a repository on its own, or a folder of repositories. */
export type LibraryEntry = ({ kind: 'repository' } & SavedRepository) | ({ kind: 'folder' } & RepositoryFolder)

/** The saved repositories, in the order of the tabs. */
export interface RepositoryLibrary {
  entries: LibraryEntry[]
}

export type EntryRef = { kind: 'repository'; path: string } | { kind: 'folder'; id: string }

/** Where a moved entry goes: into a folder (or the top row when null), before another entry or last. */
export interface LibraryDestination {
  folderId: string | null
  before: EntryRef | null
}

export const emptyLibrary: RepositoryLibrary = { entries: [] }

export function defaultRepositoryName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

/** A saved repository and the folder it is in; null for the top row. */
export type LocatedRepository = SavedRepository & { folderId: string | null }

/** Every repository with the folder it is in, in tab order. */
export function allRepositories(library: RepositoryLibrary): LocatedRepository[] {
  return library.entries.flatMap((entry): LocatedRepository[] =>
    entry.kind === 'repository'
      ? [{ path: entry.path, name: entry.name, folderId: null }]
      : entry.repositories.map((repository) => ({ ...repository, folderId: entry.id }))
  )
}

export function findRepository(library: RepositoryLibrary, path: string): LocatedRepository | undefined {
  return allRepositories(library).find((repository) => repository.path === path)
}

/** Saves a newly opened repository as the last tab; already saved repositories keep their place and name. */
export function addRepository(library: RepositoryLibrary, path: string): RepositoryLibrary {
  if (findRepository(library, path)) return library
  return { entries: [...library.entries, { kind: 'repository', path, name: defaultRepositoryName(path) }] }
}

export function renameRepository(library: RepositoryLibrary, path: string, name: string): RepositoryLibrary {
  const newName = requireName(name, 'A repository name')
  requireRepository(library, path)
  return mapRepositories(library, (repository) => (repository.path === path ? { ...repository, name: newName } : repository))
}

export function removeRepository(library: RepositoryLibrary, path: string): RepositoryLibrary {
  return takeEntry(library, { kind: 'repository', path }).library
}

export function addFolder(library: RepositoryLibrary, id: string, name: string): RepositoryLibrary {
  return { entries: [...library.entries, { kind: 'folder', id, name: requireName(name, 'A folder name'), repositories: [] }] }
}

export function renameFolder(library: RepositoryLibrary, id: string, name: string): RepositoryLibrary {
  const newName = requireName(name, 'A folder name')
  requireFolder(library, id)
  return { entries: library.entries.map((entry) => (entry.kind === 'folder' && entry.id === id ? { ...entry, name: newName } : entry)) }
}

/** Removes a folder but keeps its repositories, which take the folder's place in the top row. */
export function removeFolder(library: RepositoryLibrary, id: string): RepositoryLibrary {
  return {
    entries: library.entries.flatMap((entry) =>
      entry.kind === 'folder' && entry.id === id
        ? entry.repositories.map((repository): LibraryEntry => ({ kind: 'repository', ...repository }))
        : [entry]
    )
  }
}

/** Moves a repository or folder, e.g. a repository into a folder or a tab to another position. */
export function moveEntry(library: RepositoryLibrary, ref: EntryRef, destination: LibraryDestination): RepositoryLibrary {
  if (ref.kind === 'folder' && destination.folderId !== null) throw new Error('A folder cannot be put inside another folder')
  if (destination.before && sameRef(ref, destination.before)) return library
  if (destination.folderId !== null) requireFolder(library, destination.folderId)

  const { library: without, entry } = takeEntry(library, ref)
  if (!entry) throw new Error(ref.kind === 'folder' ? 'That folder no longer exists' : 'That repository is not saved')

  if (destination.folderId === null) {
    return { entries: insertBefore(without.entries, entry, (candidate) => matches(candidate, destination.before)) }
  }
  const repository: SavedRepository = { path: (entry as SavedRepository).path, name: entry.name }
  return {
    entries: without.entries.map((candidate) =>
      candidate.kind === 'folder' && candidate.id === destination.folderId
        ? {
            ...candidate,
            repositories: insertBefore(candidate.repositories, repository, (existing) =>
              matches({ kind: 'repository', ...existing }, destination.before)
            )
          }
        : candidate
    )
  }
}

export function sameRef(a: EntryRef, b: EntryRef): boolean {
  return a.kind === 'repository' ? b.kind === 'repository' && a.path === b.path : b.kind === 'folder' && a.id === b.id
}

export function refOf(entry: LibraryEntry): EntryRef {
  return entry.kind === 'repository' ? { kind: 'repository', path: entry.path } : { kind: 'folder', id: entry.id }
}

/** Removes the entry wherever it is and returns it, so it can be inserted elsewhere. */
function takeEntry(library: RepositoryLibrary, ref: EntryRef): { library: RepositoryLibrary; entry: LibraryEntry | null } {
  let taken: LibraryEntry | null = null
  const entries = library.entries.flatMap((entry): LibraryEntry[] => {
    if (matches(entry, ref)) {
      taken = entry
      return []
    }
    if (entry.kind !== 'folder' || ref.kind !== 'repository') return [entry]
    const inFolder = entry.repositories.find((repository) => repository.path === ref.path)
    if (!inFolder) return [entry]
    taken = { kind: 'repository', ...inFolder }
    return [{ ...entry, repositories: entry.repositories.filter((repository) => repository !== inFolder) }]
  })
  return { library: { entries }, entry: taken }
}

function matches(entry: LibraryEntry, ref: EntryRef | null): boolean {
  return ref !== null && sameRef(refOf(entry), ref)
}

function insertBefore<T>(items: readonly T[], item: T, isTarget: (candidate: T) => boolean): T[] {
  const index = items.findIndex(isTarget)
  return index === -1 ? [...items, item] : [...items.slice(0, index), item, ...items.slice(index)]
}

function mapRepositories(library: RepositoryLibrary, change: (repository: SavedRepository) => SavedRepository): RepositoryLibrary {
  return {
    entries: library.entries.map((entry) => {
      if (entry.kind === 'folder') return { ...entry, repositories: entry.repositories.map(change) }
      const { path, name } = change(entry)
      return { kind: 'repository', path, name }
    })
  }
}

function requireName(name: string, what: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`${what} cannot be empty`)
  return trimmed
}

function requireRepository(library: RepositoryLibrary, path: string): void {
  if (!findRepository(library, path)) throw new Error('That repository is not saved')
}

function requireFolder(library: RepositoryLibrary, id: string): void {
  if (!library.entries.some((entry) => entry.kind === 'folder' && entry.id === id)) throw new Error('That folder no longer exists')
}
