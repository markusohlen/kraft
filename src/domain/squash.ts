import type { Commit } from './entities'

export interface SquashRange {
  /** The commits to squash, oldest first. */
  commits: Commit[]
  oldest: Commit
  newest: Commit
  /** The commit the squashed commit gets as its parent; null when the oldest commit is the root. */
  base: string | null
}

/**
 * Works out which commits a squash combines. They must be consecutive on the checked-out branch's
 * first-parent line, and the commits from them up to HEAD must not be merges: replaying the later
 * commits onto the squashed one would flatten a merge.
 *
 * @param firstParentLine HEAD's first-parent history, newest first.
 * @param selected the shas of the commits to squash, in any order.
 */
export function findSquashRange(firstParentLine: readonly Commit[], selected: readonly string[]): SquashRange {
  const wanted = new Set(selected)
  if (wanted.size < 2) throw new Error('Select at least two commits to squash')

  const indexes = firstParentLine.flatMap((commit, index) => (wanted.has(commit.sha) ? [index] : []))
  if (indexes.length < wanted.size) throw new Error('Only commits on the checked-out branch can be squashed')
  const newestIndex = Math.min(...indexes)
  const oldestIndex = Math.max(...indexes)
  if (oldestIndex - newestIndex + 1 !== wanted.size) {
    throw new Error('Only consecutive commits can be squashed; the selection skips commits on the branch')
  }

  const merge = firstParentLine.slice(0, oldestIndex + 1).find((commit) => commit.parents.length > 1)
  if (merge) throw new Error(`Cannot squash across the merge commit ${merge.sha.slice(0, 7)} ("${merge.subject}")`)

  const oldest = firstParentLine[oldestIndex]
  return {
    commits: firstParentLine.slice(newestIndex, oldestIndex + 1).reverse(),
    oldest,
    newest: firstParentLine[newestIndex],
    base: oldest.parents[0] ?? null
  }
}
