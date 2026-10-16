import { describe, expect, it } from 'vitest'
import {
  addFolder,
  addRepository,
  allRepositories,
  emptyLibrary,
  moveEntry,
  removeFolder,
  removeRepository,
  renameFolder,
  renameRepository,
  type RepositoryLibrary
} from '../../src/domain/repositoryLibrary'

const repo = (path: string) => ({ kind: 'repository' as const, path })
const folder = (id: string) => ({ kind: 'folder' as const, id })

/** Tab order as short labels, e.g. `['a', 'Work[b, c]']`. */
function tabs(library: RepositoryLibrary): string[] {
  return library.entries.map((entry) =>
    entry.kind === 'repository' ? entry.name : `${entry.name}[${entry.repositories.map((repository) => repository.name).join(', ')}]`
  )
}

function libraryWith(...paths: string[]): RepositoryLibrary {
  return paths.reduce(addRepository, emptyLibrary)
}

describe('repository library', () => {
  it('saves opened repositories once, named after their folder', () => {
    const library = addRepository(libraryWith('C:/Dev/kraft', 'C:/Dev/api'), 'C:/Dev/kraft')

    expect(library.entries).toEqual([
      { kind: 'repository', path: 'C:/Dev/kraft', name: 'kraft' },
      { kind: 'repository', path: 'C:/Dev/api', name: 'api' }
    ])
  })

  it('renames repositories, also inside folders, and rejects empty names', () => {
    let library = addFolder(libraryWith('/a', '/b'), 'work', 'Work')
    library = moveEntry(library, repo('/b'), { folderId: 'work', before: null })

    library = renameRepository(renameRepository(library, '/a', '  Alpha '), '/b', 'Beta')

    expect(tabs(library)).toEqual(['Alpha', 'Work[Beta]'])
    expect(() => renameRepository(library, '/a', ' ')).toThrow('cannot be empty')
    expect(() => renameRepository(library, '/missing', 'x')).toThrow('not saved')
  })

  it('moves repositories into folders and back out, before a given tab or last', () => {
    let library = addFolder(libraryWith('/a', '/b', '/c'), 'work', 'Work')

    library = moveEntry(library, repo('/a'), { folderId: 'work', before: null })
    library = moveEntry(library, repo('/c'), { folderId: 'work', before: repo('/a') })
    expect(tabs(library)).toEqual(['b', 'Work[c, a]'])

    library = moveEntry(library, repo('/a'), { folderId: null, before: repo('/b') })
    expect(tabs(library)).toEqual(['a', 'b', 'Work[c]'])
    expect(allRepositories(library).map((repository) => repository.folderId)).toEqual([null, null, 'work'])
  })

  it('reorders folders in the top row but never nests them', () => {
    let library = addFolder(libraryWith('/a'), 'work', 'Work')

    library = moveEntry(library, folder('work'), { folderId: null, before: repo('/a') })
    expect(tabs(library)).toEqual(['Work[]', 'a'])

    library = addFolder(library, 'home', 'Home')
    expect(() => moveEntry(library, folder('home'), { folderId: 'work', before: null })).toThrow('cannot be put inside')
  })

  it('leaves the library unchanged when an entry is dropped on itself, and fails for unknown targets', () => {
    const library = libraryWith('/a', '/b')
    expect(moveEntry(library, repo('/a'), { folderId: null, before: repo('/a') })).toBe(library)
    expect(() => moveEntry(library, repo('/a'), { folderId: 'gone', before: null })).toThrow('no longer exists')
    expect(() => moveEntry(library, repo('/x'), { folderId: null, before: null })).toThrow('not saved')
  })

  it('renames folders and, when removing one, keeps its repositories in its place', () => {
    let library = addFolder(libraryWith('/a', '/b', '/c'), 'work', 'Work')
    library = moveEntry(library, folder('work'), { folderId: null, before: repo('/c') })
    library = moveEntry(library, repo('/a'), { folderId: 'work', before: null })
    library = moveEntry(library, repo('/b'), { folderId: 'work', before: null })
    library = renameFolder(library, 'work', 'Job')
    expect(tabs(library)).toEqual(['Job[a, b]', 'c'])

    expect(tabs(removeFolder(library, 'work'))).toEqual(['a', 'b', 'c'])
    expect(() => addFolder(library, 'x', '')).toThrow('cannot be empty')
  })

  it('removes repositories from the top row or from folders', () => {
    let library = addFolder(libraryWith('/a', '/b'), 'work', 'Work')
    library = moveEntry(library, repo('/b'), { folderId: 'work', before: null })

    expect(tabs(removeRepository(removeRepository(library, '/a'), '/b'))).toEqual(['Work[]'])
  })
})
