import { describe, expect, it } from 'vitest'
import type { FileChange } from '../../src/domain/entities'
import { filterFileChanges, matchesFileFilter, shownCount, startsFileFilter } from '../../src/renderer/src/fileFilter'

const change = (path: string): FileChange => ({ path, oldPath: null, status: 'modified' })
const changes = ['src/styles.css', 'src/Sidebar.tsx', 'README.md', 'scripts/build.mjs', 'test/setup.ts'].map(change)

describe('matchesFileFilter', () => {
  it('matches files whose name starts with the query, ignoring case and the folder', () => {
    expect(filterFileChanges(changes, 's').map((file) => file.path)).toEqual(['src/styles.css', 'src/Sidebar.tsx', 'scripts/build.mjs', 'test/setup.ts'])
    expect(filterFileChanges(changes, 'SE').map((file) => file.path)).toEqual(['test/setup.ts'])
  })

  it('also matches the path from the repository root, so a folder can be typed', () => {
    expect(matchesFileFilter('scripts/build.mjs', 'scripts/b')).toBe(true)
    expect(matchesFileFilter('src/styles.css', 'scripts/')).toBe(false)
  })

  it('does not match text in the middle of a name', () => {
    expect(matchesFileFilter('src/Sidebar.tsx', 'bar')).toBe(false)
  })

  it('keeps every file for an empty or blank query', () => {
    expect(filterFileChanges(changes, '  ')).toBe(changes)
  })
})

describe('shownCount', () => {
  it('shows how many files a filter left out of the list', () => {
    expect(shownCount(changes, changes)).toBe('5')
    expect(shownCount(changes.slice(0, 2), changes)).toBe('2 of 5')
  })
})

describe('startsFileFilter', () => {
  const key = (value: string, modifiers: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
    key: value,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...modifiers
  })

  it('starts on a printable character', () => {
    expect(startsFileFilter(key('s'))).toBe(true)
    expect(startsFileFilter(key('S'))).toBe(true)
    expect(startsFileFilter(key('.'))).toBe(true)
  })

  it('leaves shortcuts, named keys and space alone', () => {
    expect(startsFileFilter(key('s', { ctrlKey: true }))).toBe(false)
    expect(startsFileFilter(key('c', { metaKey: true }))).toBe(false)
    expect(startsFileFilter(key('Escape'))).toBe(false)
    expect(startsFileFilter(key('ArrowDown'))).toBe(false)
    expect(startsFileFilter(key(' '))).toBe(false)
  })
})
