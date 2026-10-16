import { describe, expect, it } from 'vitest'
import { layoutCommitGraph, rowKey, type GraphRow } from '../../src/domain/commitGraph'
import type { Commit, Stash } from '../../src/domain/entities'

function commit(sha: string, parents: string[] = [], date = '2026-01-01T00:00:00Z'): Commit {
  return { sha, parents, authorName: 'A', authorEmail: 'a@x', date, subject: sha, refs: [] }
}

function stash(sha: string, baseSha: string, date: string, index = 0): Stash {
  return { index, sha, message: `stash ${sha}`, baseSha, date }
}

/** Rows keyed by commit sha, `stash:<sha>` or `work-in-progress`. */
function byKey(rows: GraphRow[]): Record<string, GraphRow> {
  return Object.fromEntries(rows.map((row) => [rowKey(row), row]))
}

describe('layoutCommitGraph', () => {
  it('keeps a linear history in one lane', () => {
    const { rows, laneCount } = layoutCommitGraph([commit('c', ['b']), commit('b', ['a']), commit('a')])

    expect(laneCount).toBe(1)
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 0])
    expect(rows[0].incomingLanes).toEqual([])
    expect(rows[1].incomingLanes).toEqual([0])
    expect(rows[2].outgoingLanes).toEqual([])
  })

  it('opens a second lane for a merged branch and closes it at the fork point', () => {
    // m merges f into main; both f and b descend from a.
    const { rows, laneCount } = layoutCommitGraph([
      commit('m', ['b', 'f']),
      commit('f', ['a']),
      commit('b', ['a']),
      commit('a')
    ])
    const byLane = byKey(rows)

    expect(laneCount).toBe(2)
    expect(byLane.m.outgoingLanes).toEqual([0, 1])
    expect(byLane.f.lane).toBe(1)
    expect(byLane.f.passThroughLanes).toEqual([0])
    expect(byLane.b.lane).toBe(0)
    expect(byLane.b.passThroughLanes).toEqual([1])
    expect(byLane.a.incomingLanes).toEqual([0, 1])
  })

  it('keeps a branch tip in its own lane until it curves into its parent on the left', () => {
    const { rows } = layoutCommitGraph([commit('x', ['a']), commit('y', ['a']), commit('a')])

    expect(rows[0].lane).toBe(0)
    expect(rows[1].lane).toBe(1)
    expect(rows[1].passThroughLanes).toEqual([0])
    expect(rows[1].outgoingLanes).toEqual([1])
    expect(rows[2].lane).toBe(0)
    expect(rows[2].incomingLanes).toEqual([0, 1])
  })

  it('converges a fork back into the leftmost lane', () => {
    // main: c -> b -> a; topic: t -> a. Topic is newer, so it is drawn first.
    const { rows } = layoutCommitGraph([commit('t', ['a']), commit('c', ['b']), commit('b', ['a']), commit('a')])

    expect(byKey(rows).a.lane).toBe(0)
  })

  it('reuses freed lanes instead of growing wider', () => {
    const { laneCount } = layoutCommitGraph([
      commit('m2', ['m1', 'g']),
      commit('g', ['m1']),
      commit('m1', ['b', 'f']),
      commit('f', ['b']),
      commit('b')
    ])

    expect(laneCount).toBe(2)
  })
})

describe('stashes and uncommitted changes in the graph', () => {
  it('places a stash by its date, above the commit it was made on, joined to it by a dotted line', () => {
    const { rows } = layoutCommitGraph(
      [commit('c', ['b'], '2026-01-03T00:00:00Z'), commit('b', ['a'], '2026-01-02T00:00:00Z'), commit('a', [], '2026-01-01T00:00:00Z')],
      { stashes: [stash('s', 'a', '2026-01-02T12:00:00Z')] }
    )

    expect(rows.map(rowKey)).toEqual(['c', 'stash:s', 'b', 'a'])
    const rowsByKey = byKey(rows)
    expect(rowsByKey['stash:s'].lane).toBe(1)
    expect(rowsByKey['stash:s'].outgoingLanes).toEqual([1])
    expect(rowsByKey.b.dottedPassThroughLanes).toEqual([1])
    expect(rowsByKey.a.lane).toBe(0)
    expect(rowsByKey.a.incomingLanes).toEqual([0, 1])
    expect(rowsByKey.a.dottedIncomingLanes).toEqual([1])
  })

  it('never puts a stash below the commit it was made on, even when its date is older', () => {
    const { rows } = layoutCommitGraph([commit('b', ['a'], '2026-01-02T00:00:00Z'), commit('a', [], '2026-01-01T00:00:00Z')], {
      stashes: [stash('s', 'b', '2025-06-01T00:00:00Z')]
    })

    expect(rows.map(rowKey)).toEqual(['stash:s', 'b', 'a'])
  })

  it('leaves out stashes whose commit is not in the loaded history', () => {
    const { rows } = layoutCommitGraph([commit('b')], { stashes: [stash('s', 'gone', '2026-01-01T00:00:00Z')] })
    expect(rows.map(rowKey)).toEqual(['b'])
  })

  it('shows uncommitted changes first, in the lane of the commit they are based on', () => {
    const { rows } = layoutCommitGraph(
      [commit('t', ['a'], '2026-01-03T00:00:00Z'), commit('h', ['a'], '2026-01-02T00:00:00Z'), commit('a', [], '2026-01-01T00:00:00Z')],
      { workInProgress: { baseSha: 'h' }, stashes: [stash('s', 'h', '2026-01-04T00:00:00Z')] }
    )
    const rowsByKey = byKey(rows)

    expect(rows.map(rowKey)).toEqual(['work-in-progress', 'stash:s', 't', 'h', 'a'])
    expect(rowsByKey['work-in-progress'].lane).toBe(0)
    expect(rowsByKey['stash:s'].dottedPassThroughLanes).toEqual([0])
    // The changes' dotted line holds lane 0 for HEAD; the stash and the newer branch move aside.
    expect(rowsByKey['stash:s'].lane).toBe(1)
    expect(rowsByKey.t.lane).toBe(2)
    expect(rowsByKey.h.lane).toBe(0)
    expect(rowsByKey.h.dottedIncomingLanes).toEqual([0, 1])
  })

  it('shows uncommitted changes in a repository without commits', () => {
    const { rows } = layoutCommitGraph([], { workInProgress: { baseSha: null } })
    expect(rows).toEqual([expect.objectContaining({ kind: 'work-in-progress', lane: 0, outgoingLanes: [] })])
  })

  it('never lets a merge join a dotted line', () => {
    // m merges a; the stash on a must keep its own dotted lane.
    const { rows } = layoutCommitGraph(
      [commit('m', ['b', 'a'], '2026-01-03T00:00:00Z'), commit('b', ['a'], '2026-01-02T00:00:00Z'), commit('a', [], '2026-01-01T00:00:00Z')],
      { stashes: [stash('s', 'a', '2026-01-04T00:00:00Z')] }
    )
    const rowsByKey = byKey(rows)

    expect(rowsByKey['stash:s'].outgoingLanes).toEqual([0])
    expect(rowsByKey.m.outgoingLanes).toEqual([1, 2])
    expect(rowsByKey.a.dottedIncomingLanes).toEqual([0])
    expect(rowsByKey.a.lane).toBe(1)
  })
})
