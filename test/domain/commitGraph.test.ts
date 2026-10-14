import { describe, expect, it } from 'vitest'
import { layoutCommitGraph } from '../../src/domain/commitGraph'
import type { Commit } from '../../src/domain/entities'

function commit(sha: string, parents: string[] = []): Commit {
  return { sha, parents, authorName: 'A', authorEmail: 'a@x', date: '2026-01-01T00:00:00Z', subject: sha, refs: [] }
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
    const byLane = Object.fromEntries(rows.map((row) => [row.commit.sha, row]))

    expect(laneCount).toBe(2)
    expect(byLane.m.outgoingLanes).toEqual([0, 1])
    expect(byLane.f.lane).toBe(1)
    expect(byLane.f.passThroughLanes).toEqual([0])
    expect(byLane.b.lane).toBe(0)
    expect(byLane.b.passThroughLanes).toEqual([1])
    expect(byLane.a.incomingLanes).toEqual([0, 1])
  })

  it('gives each branch tip that nobody points to its own lane and joins it back on the left', () => {
    const { rows } = layoutCommitGraph([commit('x', ['a']), commit('y', ['a']), commit('a')])

    expect(rows[0].lane).toBe(0)
    expect(rows[1].lane).toBe(1)
    expect(rows[1].passThroughLanes).toEqual([0])
    expect(rows[1].outgoingLanes).toEqual([0])
    expect(rows[2].incomingLanes).toEqual([0])
  })

  it('converges a fork back into the leftmost lane', () => {
    // main: c -> b -> a; topic: t -> a. Topic is newer, so it is drawn first.
    const { rows } = layoutCommitGraph([commit('t', ['a']), commit('c', ['b']), commit('b', ['a']), commit('a')])

    expect(rows.find((row) => row.commit.sha === 'a')!.lane).toBe(0)
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
