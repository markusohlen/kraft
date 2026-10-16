import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RepositoryLibrary } from '../../src/domain/repositoryLibrary'
import { JsonRepositoryLibraryStore } from '../../src/infrastructure/jsonRepositoryLibraryStore'

describe('JsonRepositoryLibraryStore', () => {
  let directory: string
  let libraryFile: string
  let legacyFile: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'kraft-library-'))
    libraryFile = join(directory, 'nested', 'repository-library.json')
    legacyFile = join(directory, 'recent-repositories.json')
  })

  afterEach(() => rm(directory, { recursive: true, force: true }))

  it('starts empty when nothing has been saved', async () => {
    expect(await new JsonRepositoryLibraryStore(libraryFile, legacyFile).load()).toEqual({ entries: [] })
  })

  it('carries over the recent repositories of earlier versions', async () => {
    await writeFile(legacyFile, JSON.stringify(['C:/Dev/Server', 'C:/Dev/Gitly', 42]))

    const library = await new JsonRepositoryLibraryStore(libraryFile, legacyFile).load()

    expect(library.entries).toEqual([
      { kind: 'repository', path: 'C:/Dev/Server', name: 'Server' },
      { kind: 'repository', path: 'C:/Dev/Gitly', name: 'Gitly' }
    ])
  })

  it('round-trips folders and repositories, and prefers the saved library over the old list', async () => {
    await writeFile(legacyFile, JSON.stringify(['C:/Dev/old']))
    const store = new JsonRepositoryLibraryStore(libraryFile, legacyFile)
    const library: RepositoryLibrary = {
      entries: [
        { kind: 'folder', id: 'f1', name: 'Work', repositories: [{ path: '/a', name: 'Alpha' }] },
        { kind: 'repository', path: '/b', name: 'b' }
      ]
    }

    await store.save(library)

    expect(await store.load()).toEqual(library)
  })

  it('skips damaged entries instead of failing', async () => {
    const store = new JsonRepositoryLibraryStore(libraryFile)
    await store.save({ entries: [] })
    await writeFile(
      libraryFile,
      JSON.stringify({ entries: [{ kind: 'repository', path: '/a' }, { kind: 'folder', id: 'f', name: 'F', repositories: [{ path: '/b', name: 'b' }, 7] }] })
    )

    expect(await store.load()).toEqual({ entries: [{ kind: 'folder', id: 'f', name: 'F', repositories: [{ path: '/b', name: 'b' }] }] })
  })
})
