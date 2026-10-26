export type OverviewMarkKind = 'added' | 'removed' | 'modified'

/** A run of changed rows, as fractions of the whole diff from its top (0) to its bottom (1). */
export interface OverviewMark {
  kind: OverviewMarkKind
  start: number
  end: number
}

/**
 * Where the changes are in a diff of uniformly tall rows, for drawing them along the scrollbar.
 * `rowKinds` has one entry per row; `null` for unchanged rows. Neighbouring rows of the same kind
 * become one mark.
 */
export function overviewMarks(rowKinds: readonly (OverviewMarkKind | null)[]): OverviewMark[] {
  const marks: OverviewMark[] = []
  const rowCount = rowKinds.length
  let runStart = 0
  for (let index = 1; index <= rowCount; index++) {
    const kind = rowKinds[runStart]
    if (index < rowCount && rowKinds[index] === kind) continue
    if (kind) marks.push({ kind, start: runStart / rowCount, end: index / rowCount })
    runStart = index
  }
  return marks
}
