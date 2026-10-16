import { beforeEach, describe, expect, it } from 'vitest'
import type { GitRepository, GitRepositoryFactory } from '../../src/application/ports'
import {
  RepositoryLibraryService,
  type FoundRepositoryFolders,
  type RepositoryFinder,
  type RepositoryLibraryStore
} from '../../src/application/repositoryLibraryService'
import { emptyLibrary, type RepositoryLibrary } from '../../src/domain/repositoryLibrary'

class MemoryLibraryStore implements RepositoryLibraryStore {
  library: RepositoryLibrary = emptyLibrary
  saves = 0
  async load() {
    return this.library
  }
  async save(library: RepositoryLibrary) {
    // Yields first, like a real file write, so overlapping changes would interleave.
    await new Promise((resolve) => setTimeout(resolve, 1))
    this.library = library
    this.saves++
  }
}

class FakeFinder implements RepositoryFinder {
  found: FoundRepositoryFolders = { folders: [], foldersSearched: 0, complete: true }
  async findRepositoryFolders() {
    return this.found
  }
}

/** Opens folders like git does: Windows paths come back with forward slashes; `broken` folders fail. */
class FakeRepositories implements GitRepositoryFactory {
  async open(path: string) {
    if (path.includes('broken')) throw new Error(`"${path}" is not inside a Git repository`)
    return { path: path.replace(/\\/g, '/') } as GitRepository
  }
}

describe('RepositoryLibraryService', () => {
  let store: MemoryLibraryStore
  let finder: FakeFinder
  let service: RepositoryLibraryService
  let nextId: number

  beforeEach(() => {
    store = new MemoryLibraryStore()
    finder = new FakeFinder()
    nextId = 1
    service = new RepositoryLibraryService(store, finder, new FakeRepositories(), () => `folder-${nextId++}`)
  })

  it('saves opened repositories', async () => {
    await service.remember('C:/Dev/kraft')
    expect(await service.repositoryLibrary()).toEqual({ entries: [{ kind: 'repository', path: 'C:/Dev/kraft', name: 'kraft' }] })
  })

  it('creates a folder with a repository already in it', async () => {
    await service.remember('/a')

    const library = await service.createRepositoryFolder('Work', '/a')

    expect(library.entries).toEqual([{ kind: 'folder', id: 'folder-1', name: 'Work', repositories: [{ path: '/a', name: 'a' }] }])
    expect(store.library).toEqual(library)
  })

  it('applies quick successive changes one after another without losing any', async () => {
    await Promise.all([service.remember('/a'), service.remember('/b'), service.remember('/c')])
    expect((await service.repositoryLibrary()).entries.map((entry) => entry.name)).toEqual(['a', 'b', 'c'])
  })

  it('reports a failed change and keeps working afterwards', async () => {
    await service.remember('/a')

    await expect(service.renameRepository('/a', '')).rejects.toThrow('cannot be empty')
    const library = await service.renameRepository('/a', 'Alpha')

    expect(library.entries[0].name).toBe('Alpha')
  })

  it('moves, renames and removes folders and repositories', async () => {
    await service.remember('/a')
    await service.remember('/b')
    await service.createRepositoryFolder('Work')
    await service.moveLibraryEntry({ kind: 'repository', path: '/b' }, { folderId: 'folder-1', before: null })
    await service.renameRepositoryFolder('folder-1', 'Job')
    let library = await service.removeRepository('/a')
    expect(library.entries).toEqual([{ kind: 'folder', id: 'folder-1', name: 'Job', repositories: [{ path: '/b', name: 'b' }] }])

    library = await service.removeRepositoryFolder('folder-1')
    expect(library.entries).toEqual([{ kind: 'repository', path: '/b', name: 'b' }])
  })

  it('lists the repositories found by a scan, as git spells their paths, and marks the saved ones', async () => {
    await service.remember('C:/Dev/api')
    finder.found = { folders: ['C:\\Dev\\api', 'C:\\Dev\\web', 'C:\\Dev\\broken'], foldersSearched: 12, complete: true }

    const scan = await service.scanForRepositories('C:\\Dev')

    expect(scan.repositories).toEqual([
      { path: 'C:/Dev/api', name: 'api', alreadySaved: true },
      { path: 'C:/Dev/web', name: 'web', alreadySaved: false }
    ])
    expect(scan.unreadable).toEqual(['C:\\Dev\\broken'])
    expect(scan.foldersSearched).toBe(12)
  })

  it('adds several repositories at once, skipping ones that are already saved', async () => {
    await service.remember('/a')

    const library = await service.addRepositories(['/a', '/b', '/c', '/b'], null)

    expect(library.entries.map((entry) => entry.name)).toEqual(['a', 'b', 'c'])
  })

  it('puts the added repositories in a new folder when asked', async () => {
    await service.remember('/a')

    const library = await service.addRepositories(['/a', '/b', '/c'], 'Work')

    expect(library.entries).toEqual([
      { kind: 'repository', path: '/a', name: 'a' },
      {
        kind: 'folder',
        id: 'folder-1',
        name: 'Work',
        repositories: [
          { path: '/b', name: 'b' },
          { path: '/c', name: 'c' }
        ]
      }
    ])
  })

  it('creates no empty folder when every repository was already saved', async () => {
    await service.remember('/a')
    const library = await service.addRepositories(['/a'], 'Work')
    expect(library.entries).toEqual([{ kind: 'repository', path: '/a', name: 'a' }])
  })
})
