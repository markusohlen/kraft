import { describe, expect, it } from 'vitest'
import { layoutCommitGraph } from '../../src/domain/commitGraph'
import { scrollTopKeepingRows } from '../../src/renderer/src/graphAnchor'
import { commit, repositoryView } from './presenterFakes'

const rowHeight = 28

function linkedCommits(...shas: string[]) {
  return shas.map((sha, index) => ({ ...commit(sha), parents: index + 1 < shas.length ? [shas[index + 1]] : [] }))
}

function viewOf(shas: string[], { workInProgress = false, currentBranch = 'main' as string | null, path = '/repos/widgets' } = {}) {
  return repositoryView({
    path,
    currentBranch,
    graph: layoutCommitGraph(linkedCommits(...shas), { stashes: [], workInProgress: workInProgress ? { baseSha: shas[0] } : undefined })
  })
}

describe('scrollTopKeepingRows', () => {
  const before = viewOf(['d', 'c', 'b', 'a'])
  const scrolledToC = 1 * rowHeight

  it('keeps the visible rows in place when commits appear above them', () => {
    expect(scrollTopKeepingRows(before, viewOf(['f', 'e', 'd', 'c', 'b', 'a']), scrolledToC, rowHeight)).toBe(3 * rowHeight)
  })

  it('keeps the part of a row that was scrolled past', () => {
    expect(scrollTopKeepingRows(before, viewOf(['e', 'd', 'c', 'b', 'a']), scrolledToC + 5, rowHeight)).toBe(2 * rowHeight + 5)
  })

  it('keeps the visible rows in place when the WIP row appears and goes', () => {
    const withChanges = viewOf(['d', 'c', 'b', 'a'], { workInProgress: true })

    expect(scrollTopKeepingRows(before, withChanges, scrolledToC, rowHeight)).toBe(2 * rowHeight)
    expect(scrollTopKeepingRows(withChanges, before, 2 * rowHeight, rowHeight)).toBe(scrolledToC)
  })

  it('stays at the top, to show what is new', () => {
    expect(scrollTopKeepingRows(before, viewOf(['e', 'd', 'c', 'b', 'a']), 0, rowHeight)).toBe(0)
  })

  it('holds the place with the next row when the first visible one is gone', () => {
    const amended = viewOf(['new-d', 'new-c', 'x', 'b', 'a'])

    expect(scrollTopKeepingRows(before, amended, scrolledToC, rowHeight)).toBe(2 * rowHeight)
  })

  it('stays where it is when none of the rows remain', () => {
    expect(scrollTopKeepingRows(before, viewOf(['z', 'y']), scrolledToC, rowHeight)).toBe(scrolledToC)
  })

  it('does not fight a checkout, which moves the graph on purpose', () => {
    const otherBranch = viewOf(['e', 'd', 'c', 'b', 'a'], { currentBranch: 'feature' })

    expect(scrollTopKeepingRows(before, otherBranch, scrolledToC, rowHeight)).toBe(scrolledToC)
  })

  it('does not fight moving between commits on a detached HEAD', () => {
    const detachedBefore = viewOf(['d', 'c', 'b', 'a'], { currentBranch: null })
    const detachedAfter = viewOf(['e', 'd', 'c', 'b', 'a'], { currentBranch: null })

    expect(scrollTopKeepingRows(detachedBefore, detachedAfter, scrolledToC, rowHeight)).toBe(scrolledToC)
  })

  it('does not carry a position over to another repository', () => {
    const otherRepository = viewOf(['e', 'd', 'c', 'b', 'a'], { path: '/repos/gadgets' })

    expect(scrollTopKeepingRows(before, otherRepository, scrolledToC, rowHeight)).toBe(scrolledToC)
  })
})
