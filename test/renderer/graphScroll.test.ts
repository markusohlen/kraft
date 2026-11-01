import { describe, expect, it } from 'vitest'
import { layoutCommitGraph } from '../../src/domain/commitGraph'
import type { Commit, RefLabel } from '../../src/domain/entities'
import { checkedOutName, nextGraphPlace, scrollTopRevealing, type GraphPlace } from '../../src/renderer/src/graphScroll'

const viewport = { height: 100, rowHeight: 10 }

function commit(index: number, refs: RefLabel[]): Commit {
  return { sha: `c${index}`, parents: [], authorName: 'A', authorEmail: 'a@x', date: '2026-01-01T00:00:00Z', subject: `c${index}`, refs }
}

/** A graph of 100 commits with HEAD on the row at `headIndex`. */
function source(currentBranch: string | null, headIndex: number, path = '/repo') {
  const headRef: RefLabel = { name: currentBranch ?? 'HEAD', kind: 'head' }
  const commits = Array.from({ length: 100 }, (_, index) => commit(index, index === headIndex ? [headRef] : []))
  return { path, currentBranch, graph: layoutCommitGraph(commits) }
}

function place(scrollTop: number, checkedOut: string | null = 'main'): GraphPlace {
  return { repositoryPath: '/repo', checkedOut, scrollTop }
}

describe('scrollTopRevealing', () => {
  it('leaves a fully visible row where it is', () => {
    expect(scrollTopRevealing(5, 0, viewport)).toBe(0)
    expect(scrollTopRevealing(9, 0, viewport)).toBe(0)
    expect(scrollTopRevealing(20, 200, viewport)).toBe(200)
  })

  it('centers a row below the visible ones', () => {
    expect(scrollTopRevealing(50, 0, viewport)).toBe(455)
  })

  it('centers a row above the visible ones', () => {
    expect(scrollTopRevealing(50, 800, viewport)).toBe(455)
  })

  it('centers a row that is only partly visible', () => {
    expect(scrollTopRevealing(10, 5, viewport)).toBe(55)
  })

  it('does not scroll past the top', () => {
    expect(scrollTopRevealing(1, 500, viewport)).toBe(0)
  })
})

describe('checkedOutName', () => {
  it('is the branch when one is checked out', () => {
    expect(checkedOutName(source('main', 3))).toBe('main')
  })

  it('is the commit on a detached HEAD', () => {
    expect(checkedOutName(source(null, 3))).toBe('c3')
  })

  it('is null without a HEAD in the graph', () => {
    expect(checkedOutName({ path: '/repo', currentBranch: null, graph: { rows: [], laneCount: 0 } })).toBeNull()
  })
})

describe('nextGraphPlace', () => {
  it('starts at the top the first time a repository is shown', () => {
    expect(nextGraphPlace(null, source('main', 50), viewport)).toEqual(place(0))
  })

  it('starts at the top after switching repository', () => {
    const next = nextGraphPlace(place(700), source('main', 50, '/other'), viewport)
    expect(next).toEqual({ repositoryPath: '/other', checkedOut: 'main', scrollTop: 0 })
  })

  it('stays where it was when the same branch is still checked out', () => {
    expect(nextGraphPlace(place(700), source('main', 2), viewport)).toEqual(place(700))
  })

  it('scrolls to the commit of a newly checked-out branch below the visible rows', () => {
    expect(nextGraphPlace(place(0, 'main'), source('deep', 50), viewport)).toEqual(place(455, 'deep'))
  })

  it('stays where it is when the newly checked-out commit is already visible', () => {
    expect(nextGraphPlace(place(0, 'main'), source('near', 3), viewport)).toEqual(place(0, 'near'))
  })

  it('scrolls when a detached HEAD moves to another commit', () => {
    expect(nextGraphPlace(place(0, 'c1'), source(null, 50), viewport)).toEqual(place(455, 'c50'))
  })

  it('stays where it was when the checked-out commit is not in the graph', () => {
    const empty = { path: '/repo', currentBranch: 'orphan', graph: { rows: [], laneCount: 0 } }
    expect(nextGraphPlace(place(700), empty, viewport)).toEqual(place(700, 'orphan'))
  })
})
