import type { RepositoryView } from '../../application/kraftApi'
import type { GraphRow } from '../../domain/commitGraph'

type GraphSource = Pick<RepositoryView, 'path' | 'currentBranch' | 'graph'>

/** Where the graph was scrolled to and for what. Outlives the graph, which is unmounted while a diff is open. */
export interface GraphPlace {
  repositoryPath: string
  checkedOut: string | null
  scrollTop: number
}

export interface GraphViewport {
  height: number
  rowHeight: number
}

function isHeadRow(row: GraphRow): boolean {
  return row.kind === 'commit' && row.commit.refs.some((ref) => ref.kind === 'head')
}

/** The checked-out branch; on a detached HEAD, the commit, so moving between commits counts as a checkout too. */
export function checkedOutName({ currentBranch, graph }: GraphSource): string | null {
  if (currentBranch) return currentBranch
  const head = graph.rows.find(isHeadRow)
  return head?.kind === 'commit' ? head.commit.sha : null
}

/** The scroll position that shows a row: unchanged if it is already fully visible, otherwise with the row centered. */
export function scrollTopRevealing(rowIndex: number, scrollTop: number, { height, rowHeight }: GraphViewport): number {
  const rowTop = rowIndex * rowHeight
  if (rowTop >= scrollTop && rowTop + rowHeight <= scrollTop + height) return scrollTop
  return Math.max(0, rowTop - (height - rowHeight) / 2)
}

/**
 * Where the graph belongs once `source` is shown: where it was, at the checked-out commit after a
 * checkout, and at the top of a repository it wasn't showing. Comparing with the previous place also
 * catches checkouts made while a diff hid the graph, or outside Kraft.
 */
export function nextGraphPlace(previous: GraphPlace | null, source: GraphSource, viewport: GraphViewport): GraphPlace {
  const checkedOut = checkedOutName(source)
  const place = { repositoryPath: source.path, checkedOut }
  if (previous?.repositoryPath !== source.path) return { ...place, scrollTop: 0 }
  if (previous.checkedOut === checkedOut) return { ...place, scrollTop: previous.scrollTop }
  const headIndex = source.graph.rows.findIndex(isHeadRow)
  return { ...place, scrollTop: headIndex === -1 ? previous.scrollTop : scrollTopRevealing(headIndex, previous.scrollTop, viewport) }
}
