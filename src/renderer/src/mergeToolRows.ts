import type { MergedText } from '../../domain/mergeConflict'

/** A line of one side: its index within the conflict (what gets picked) and its line number in that side's file. */
export interface PickableLine {
  index: number
  number: number
  text: string
}

export type MergeToolRow =
  | { kind: 'common'; oursNumber: number; theirsNumber: number; text: string }
  /**
   * A side with fewer lines in a conflict gets `null` rows, so both panes stay level. The conflict's
   * first row carries the checkbox that picks the whole conflict.
   */
  | { kind: 'conflict'; conflict: number; startsConflict: boolean; ours: PickableLine | null; theirs: PickableLine | null }

/** The rows shown in both panes of the merge tool, with the same count on each side. */
export function mergeToolRows(merged: MergedText): MergeToolRow[] {
  const rows: MergeToolRow[] = []
  let oursNumber = 1
  let theirsNumber = 1
  let conflict = 0

  for (const segment of merged.segments) {
    if (segment.kind === 'common') {
      for (const text of segment.lines) rows.push({ kind: 'common', oursNumber: oursNumber++, theirsNumber: theirsNumber++, text })
      continue
    }
    const height = Math.max(segment.ours.length, segment.theirs.length)
    for (let index = 0; index < height; index++) {
      const ours = index < segment.ours.length ? { index, number: oursNumber++, text: segment.ours[index] } : null
      const theirs = index < segment.theirs.length ? { index, number: theirsNumber++, text: segment.theirs[index] } : null
      rows.push({ kind: 'conflict', conflict, startsConflict: index === 0, ours, theirs })
    }
    conflict++
  }
  return rows
}
