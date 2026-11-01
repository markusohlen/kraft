/**
 * The length of the conflict markers Kraft asks git for. Much longer than git's default of 7, so a
 * line of the file's own text that happens to start with `<<<<<<<` is not mistaken for a marker.
 */
export const conflictMarkerSize = 32

/** "Ours" is the checked-out branch (A), "theirs" the one being merged in (B). */
export type MergeSide = 'ours' | 'theirs'

export type MergeSegment =
  | { kind: 'common'; lines: string[] }
  /** `base` holds the lines as they were before either side changed them. */
  | { kind: 'conflict'; ours: string[]; base: string[]; theirs: string[] }

export type ConflictSegment = Extract<MergeSegment, { kind: 'conflict' }>

/** A file merged as far as git could, split into the lines both sides agree on and the conflicts between them. */
export interface MergedText {
  segments: MergeSegment[]
  lineEnding: '\n' | '\r\n'
  endsWithLineEnding: boolean
}

/** The lines picked from each side of one conflict, by their index within that side. */
export interface ConflictChoice {
  ours: number[]
  theirs: number[]
  /** The side picked first; its lines come first in the result. */
  first: MergeSide
  /** Whether a side with no lines here is picked, which resolves the conflict to that side's nothing instead of leaving it unresolved. */
  emptySidePicked: boolean
}

export const emptyChoice: ConflictChoice = { ours: [], theirs: [], first: 'ours', emptySidePicked: false }

/** What a side's checkbox shows for the conflicts it covers. */
export interface SidePickState {
  checked: boolean
  indeterminate: boolean
}

/** Where a line of the result comes from: both sides, one side, or a conflict nothing was picked from yet. */
export type ResolvedLineOrigin = 'common' | MergeSide | 'unresolved'

export interface ResolvedLine {
  text: string
  origin: ResolvedLineOrigin
  /** The conflict the line belongs to, or null for a line both sides agree on. */
  conflict: number | null
}

/**
 * Parses text with conflict markers as `git merge-file --diff3` writes them. Without a base section
 * (the `merge` conflict style) a conflict's base is empty.
 */
export function parseConflictMarkers(text: string, markerSize = conflictMarkerSize): MergedText {
  const endsWithLineEnding = text.endsWith('\n')
  const lines = text === '' ? [] : text.split(/\r?\n/)
  if (endsWithLineEnding) lines.pop()

  const segments: MergeSegment[] = []
  let section: 'common' | MergeSide | 'base' = 'common'
  let conflict: ConflictSegment | null = null
  const addCommon = (line: string) => {
    const last = segments[segments.length - 1]
    if (last?.kind === 'common') last.lines.push(line)
    else segments.push({ kind: 'common', lines: [line] })
  }

  for (const line of lines) {
    if (section === 'common' && isMarker(line, '<', markerSize)) {
      conflict = { kind: 'conflict', ours: [], base: [], theirs: [] }
      section = 'ours'
    } else if (section === 'ours' && isMarker(line, '|', markerSize)) {
      section = 'base'
    } else if ((section === 'ours' || section === 'base') && line === '='.repeat(markerSize)) {
      section = 'theirs'
    } else if (section === 'theirs' && isMarker(line, '>', markerSize)) {
      segments.push(conflict!)
      conflict = null
      section = 'common'
    } else if (section === 'common') {
      addCommon(line)
    } else {
      conflict![section].push(line)
    }
  }
  if (section !== 'common') throw new Error('The merged text ends inside a conflict')

  return { segments, lineEnding: text.includes('\r\n') ? '\r\n' : '\n', endsWithLineEnding }
}

function isMarker(line: string, character: string, markerSize: number): boolean {
  return line.startsWith(character.repeat(markerSize)) && (line.length === markerSize || line[markerSize] === ' ')
}

/** One side's version of the file: the common lines with that side's lines in each conflict. */
export function sideLines(merged: MergedText, side: MergeSide): string[] {
  return merged.segments.flatMap((segment) => (segment.kind === 'common' ? segment.lines : segment[side]))
}

export function conflictCount(merged: MergedText): number {
  return merged.segments.filter((segment) => segment.kind === 'conflict').length
}

/** Picks or unpicks lines of one side. Picking into an empty choice makes that side come first. */
export function setPicked(choice: ConflictChoice, side: MergeSide, indexes: readonly number[], picked: boolean): ConflictChoice {
  const current = new Set(choice[side])
  for (const index of indexes) {
    if (picked) current.add(index)
    else current.delete(index)
  }
  const wasEmpty = choice.ours.length === 0 && choice.theirs.length === 0
  return {
    ...choice,
    [side]: [...current].sort((a, b) => a - b),
    first: wasEmpty && picked ? side : choice.first
  }
}

/** Picks or unpicks every line of one side of a conflict, or the side itself if it has no lines, leaving the other side's picks alone. */
export function setSidePicked(choice: ConflictChoice, segment: ConflictSegment, side: MergeSide, picked: boolean): ConflictChoice {
  if (segment[side].length === 0) return { ...choice, emptySidePicked: picked }
  return setPicked(choice, side, segment[side].map((_, index) => index), picked)
}

export function isChoiceEmpty(choice: ConflictChoice): boolean {
  return choice.ours.length === 0 && choice.theirs.length === 0 && !choice.emptySidePicked
}

/** How much of one side is picked across conflicts, where a side with no lines in a conflict counts as a single thing to pick. */
export function sidePickState(segments: readonly ConflictSegment[], choices: readonly ConflictChoice[], side: MergeSide): SidePickState {
  let total = 0
  let picked = 0
  segments.forEach((segment, index) => {
    const hasLines = segment[side].length > 0
    total += hasLines ? segment[side].length : 1
    if (hasLines) picked += choices[index][side].length
    else if (choices[index].emptySidePicked) picked += 1
  })
  return { checked: total > 0 && picked === total, indeterminate: picked > 0 && picked < total }
}

/**
 * The result's lines: each conflict is replaced by the lines picked for it, in file order within each
 * side. A conflict nothing was picked from keeps its base lines, so neither side's change is applied.
 */
export function resolvedLines(merged: MergedText, choices: readonly ConflictChoice[]): ResolvedLine[] {
  const lines: ResolvedLine[] = []
  let conflict = 0
  for (const segment of merged.segments) {
    if (segment.kind === 'common') {
      lines.push(...segment.lines.map((text) => ({ text, origin: 'common' as const, conflict: null })))
      continue
    }
    const choice = choices[conflict] ?? emptyChoice
    if (isChoiceEmpty(choice)) {
      lines.push(...segment.base.map((text) => ({ text, origin: 'unresolved' as const, conflict })))
    } else {
      const second: MergeSide = choice.first === 'ours' ? 'theirs' : 'ours'
      for (const side of [choice.first, second]) {
        lines.push(...choice[side].map((index) => ({ text: segment[side][index], origin: side, conflict })))
      }
    }
    conflict++
  }
  return lines
}

export function resolveMerge(merged: MergedText, choices: readonly ConflictChoice[]): string {
  return joinLines(
    resolvedLines(merged, choices).map((line) => line.text),
    merged
  )
}

/** Joins lines with the file's own line ending, ending with one if the file did. */
export function joinLines(lines: readonly string[], merged: Pick<MergedText, 'lineEnding' | 'endsWithLineEnding'>): string {
  if (lines.length === 0) return ''
  return lines.join(merged.lineEnding) + (merged.endsWithLineEnding ? merged.lineEnding : '')
}

/** Text typed into the result, written back with the file's own line endings (text boxes only use `\n`). */
export function withLineEndings(text: string, merged: Pick<MergedText, 'lineEnding'>): string {
  return text.replace(/\r?\n/g, merged.lineEnding)
}
