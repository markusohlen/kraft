import type { RepositoryView } from '../../application/kraftApi'
import { rowKey } from '../../domain/commitGraph'

type GraphSource = Pick<RepositoryView, 'path' | 'currentBranch' | 'graph'>

/**
 * Where the graph should scroll to once `after` replaces `before`, so the rows the user is looking at
 * stay put when commits or the WIP row appear above them. At the very top it stays at the top, to show
 * what is new. A checkout or another repository is not anchored: there the graph moves on purpose.
 */
export function scrollTopKeepingRows(before: GraphSource, after: GraphSource, scrollTop: number, rowHeight: number): number {
  const sameCheckout = before.path === after.path && before.currentBranch !== null && before.currentBranch === after.currentBranch
  if (scrollTop <= 0 || !sameCheckout) return scrollTop
  const newIndexes = new Map(after.graph.rows.map((row, index) => [rowKey(row), index]))
  const firstVisible = Math.floor(scrollTop / rowHeight)
  // The first row itself may be gone, such as an amended commit; then the next one that remains holds the place.
  for (let index = firstVisible; index < before.graph.rows.length; index++) {
    const newIndex = newIndexes.get(rowKey(before.graph.rows[index]))
    if (newIndex !== undefined) return Math.max(0, scrollTop + (newIndex - index) * rowHeight)
  }
  return scrollTop
}
