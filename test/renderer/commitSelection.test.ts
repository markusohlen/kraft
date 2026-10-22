import { describe, expect, it } from 'vitest'
import { layoutCommitGraph } from '../../src/domain/commitGraph'
import type { Commit } from '../../src/domain/entities'
import { extendSelection, isSelected } from '../../src/renderer/src/commitSelection'
import type { Selection } from '../../src/renderer/src/useRepositoryController'

function commit(sha: string, parents: string[], date: string): Commit {
  return { sha, parents, authorName: 'A', authorEmail: 'a@x', date, subject: sha, refs: [] }
}

/** Rows: WIP, d, stash (on c), c, b, a. */
const { rows } = layoutCommitGraph(
  [
    commit('d', ['c'], '2026-01-04T00:00:00Z'),
    commit('c', ['b'], '2026-01-03T00:00:00Z'),
    commit('b', ['a'], '2026-01-02T00:00:00Z'),
    commit('a', [], '2026-01-01T00:00:00Z')
  ],
  {
    stashes: [{ index: 0, sha: 's', message: 'stash', baseSha: 'c', date: '2026-01-03T12:00:00Z' }],
    workInProgress: { baseSha: 'd' }
  }
)

describe('extendSelection', () => {
  it('selects every commit between the selected one and the clicked one, skipping stashes', () => {
    expect(extendSelection(rows, { kind: 'commit', sha: 'b' }, 'd')).toEqual({ kind: 'commits', anchor: 'b', shas: ['d', 'c', 'b'] })
  })

  it('keeps the range anchored where it started', () => {
    const range = extendSelection(rows, { kind: 'commit', sha: 'c' }, 'a')

    expect(extendSelection(rows, range, 'd')).toEqual({ kind: 'commits', anchor: 'c', shas: ['d', 'c'] })
  })

  it('follows the branch line, skipping commits of another branch shown in between', () => {
    // feature: f2 ← f1 ← base, with the other branch's o1 dated between f2 and f1.
    const interleaved = layoutCommitGraph([
      commit('f2', ['f1'], '2026-02-03T00:00:00Z'),
      commit('o1', ['base'], '2026-02-02T00:00:00Z'),
      commit('f1', ['base'], '2026-02-01T00:00:00Z'),
      commit('base', [], '2026-01-01T00:00:00Z')
    ]).rows

    expect(extendSelection(interleaved, { kind: 'commit', sha: 'f1' }, 'f2')).toEqual({ kind: 'commits', anchor: 'f1', shas: ['f2', 'f1'] })
    // Not on one line: every commit row in between, as shown.
    expect(extendSelection(interleaved, { kind: 'commit', sha: 'o1' }, 'f1')).toEqual({ kind: 'commits', anchor: 'o1', shas: ['o1', 'f1'] })
  })

  it('selects just the clicked commit when there is nothing to extend from', () => {
    expect(extendSelection(rows, null, 'c')).toEqual({ kind: 'commit', sha: 'c' })
    expect(extendSelection(rows, { kind: 'wip' }, 'c')).toEqual({ kind: 'commit', sha: 'c' })
    expect(extendSelection(rows, { kind: 'commit', sha: 'c' }, 'c')).toEqual({ kind: 'commit', sha: 'c' })
    expect(extendSelection(rows, { kind: 'commit', sha: 'gone' }, 'c')).toEqual({ kind: 'commit', sha: 'c' })
  })
})

describe('isSelected', () => {
  it('marks every commit of a multi-selection and nothing else', () => {
    const selection: Selection = { kind: 'commits', anchor: 'c', shas: ['d', 'c'] }

    expect(rows.filter((row) => isSelected(selection, row)).map((row) => (row.kind === 'commit' ? row.commit.sha : row.kind))).toEqual([
      'd',
      'c'
    ])
  })

  it('marks the one selected row otherwise', () => {
    expect(rows.filter((row) => isSelected({ kind: 'wip' }, row)).map((row) => row.kind)).toEqual(['work-in-progress'])
    expect(rows.filter((row) => isSelected(null, row))).toEqual([])
  })
})
