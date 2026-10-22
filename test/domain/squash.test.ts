import { describe, expect, it } from 'vitest'
import type { Commit } from '../../src/domain/entities'
import { findSquashRange } from '../../src/domain/squash'

function commit(sha: string, parents: string[]): Commit {
  return { sha, parents, authorName: 'A', authorEmail: 'a@x', date: '2026-01-01T00:00:00Z', subject: `subject ${sha}`, refs: [] }
}

/** HEAD's first-parent line, newest first: e ← d ← c ← b ← a (root). */
const line = [commit('e', ['d']), commit('d', ['c']), commit('c', ['b']), commit('b', ['a']), commit('a', [])]

describe('findSquashRange', () => {
  it('orders consecutive commits oldest first and finds the parent of the oldest', () => {
    const range = findSquashRange(line, ['b', 'd', 'c'])

    expect(range.commits.map((c) => c.sha)).toEqual(['b', 'c', 'd'])
    expect(range.oldest.sha).toBe('b')
    expect(range.newest.sha).toBe('d')
    expect(range.base).toBe('a')
  })

  it('has no base when the root commit is squashed', () => {
    expect(findSquashRange(line, ['a', 'b']).base).toBeNull()
  })

  it('needs at least two distinct commits', () => {
    expect(() => findSquashRange(line, ['c'])).toThrow('Select at least two commits to squash')
    expect(() => findSquashRange(line, ['c', 'c'])).toThrow('Select at least two commits to squash')
  })

  it('refuses commits that are not on the checked-out branch', () => {
    expect(() => findSquashRange(line, ['d', 'x'])).toThrow('Only commits on the checked-out branch can be squashed')
  })

  it('refuses a selection with a gap', () => {
    expect(() => findSquashRange(line, ['b', 'd'])).toThrow('Only consecutive commits can be squashed')
  })

  it('refuses when a merge commit lies between the selection and HEAD', () => {
    const withMerge = [commit('e', ['d', 'side']), ...line.slice(1)]

    expect(() => findSquashRange(withMerge, ['b', 'c'])).toThrow('Cannot squash across the merge commit e ("subject e")')
  })
})
