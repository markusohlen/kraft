import type { DiffLine, ParsedDiff } from './diff'

/** Changed lines picked in a diff: removed lines by their old line number, added lines by their new one. */
export interface LineSelection {
  removed: number[]
  added: number[]
}

/**
 * `apply` carries the picked changes over to the diff's old text, as staging does. `undo` takes them
 * back out of the diff's new text, as unstaging and discarding do.
 */
export type ChangeDirection = 'apply' | 'undo'

export function selectionOf(lines: readonly (DiffLine | null)[]): LineSelection {
  const selection: LineSelection = { removed: [], added: [] }
  for (const line of lines) {
    if (line?.kind === 'removed' && line.oldNumber !== null) selection.removed.push(line.oldNumber)
    if (line?.kind === 'added' && line.newNumber !== null) selection.added.push(line.newNumber)
  }
  return selection
}

export function isEmptySelection({ removed, added }: LineSelection): boolean {
  return removed.length === 0 && added.length === 0
}

/** Why a file's text can't be rewritten safely; null when it can. Git's output is read as UTF-8, so other encodings would come back damaged. */
export function reasonTextCannotBeRewritten(text: string): string | null {
  if (text.includes('\0')) return 'it is a binary file'
  if (text.includes('�')) return 'it is not UTF-8 text'
  return null
}

/**
 * Returns `base` with the selected changes of `diff` carried over or taken out, and every other line left
 * exactly as it was. `base` is the diff's old text for `apply` and its new text for `undo`. It may differ
 * from the diff in one way: a working file with CRLF endings shows up with LF in a diff when git converts them.
 * Any other difference means the diff is not of this text, and nothing is returned.
 */
export function withSelectedChanges(base: string, diff: ParsedDiff, selection: LineSelection, direction: ChangeDirection): string {
  const baseKind = direction === 'apply' ? 'removed' : 'added'
  const baseNumber = (line: DiffLine) => (direction === 'apply' ? line.oldNumber : line.newNumber)
  const selectedInBase = new Set(direction === 'apply' ? selection.removed : selection.added)
  const selectedElsewhere = new Set(direction === 'apply' ? selection.added : selection.removed)
  const baseLines = linesKeepingEndings(base)
  const lineEnding = convertsToCrlf(baseLines, diff, baseNumber) ? '\r\n' : '\n'
  const output = new TextLines()
  let next = 0

  for (const hunk of diff.hunks) {
    hunk.lines.forEach((line, index) => {
      if (line.kind === 'note') return
      if (line.kind !== 'context' && line.kind !== baseKind) {
        const number = direction === 'apply' ? line.newNumber : line.oldNumber
        if (number === null || !selectedElsewhere.delete(number)) return
        const endsWithoutNewline = hunk.lines[index + 1]?.kind === 'note'
        output.add(endsWithoutNewline ? line.text : line.text + lineEnding)
        return
      }
      const number = baseNumber(line)
      if (number === null) throw new Error(mismatchMessage)
      while (next < number - 1) output.add(requireLine(baseLines, next++))
      const current = requireLine(baseLines, next++)
      if (!sameLine(current, line.text)) throw new Error(mismatchMessage)
      if (!(line.kind === baseKind && selectedInBase.delete(number))) output.add(current)
    })
  }
  while (next < baseLines.length) output.add(baseLines[next++])
  if (selectedInBase.size > 0 || selectedElsewhere.size > 0) throw new Error(mismatchMessage)
  return output.toString()
}

const mismatchMessage = 'The diff no longer matches the file'

/** Collects whole lines; a line that had no line ending gets one when another follows it, or the two would merge. */
class TextLines {
  private readonly lines: string[] = []

  add(line: string): void {
    const last = this.lines.length - 1
    if (last >= 0 && !this.lines[last].endsWith('\n')) this.lines[last] += '\n'
    this.lines.push(line)
  }

  toString(): string {
    return this.lines.join('')
  }
}

function linesKeepingEndings(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? []
}

function requireLine(lines: readonly string[], index: number): string {
  if (index >= lines.length) throw new Error(mismatchMessage)
  return lines[index]
}

function withoutNewline(line: string): string {
  return line.endsWith('\n') ? line.slice(0, -1) : line
}

function sameLine(baseLine: string, diffText: string): boolean {
  const text = withoutNewline(baseLine)
  return text === diffText || text === `${diffText}\r`
}

/** Whether this text has CRLF where the diff has LF; lines brought into it then need CRLF too, to match its neighbours. */
function convertsToCrlf(baseLines: readonly string[], diff: ParsedDiff, baseNumber: (line: DiffLine) => number | null): boolean {
  return diff.hunks.some((hunk) =>
    hunk.lines.some((line) => {
      const number = baseNumber(line)
      if (number === null || line.kind === 'note') return false
      const baseLine = baseLines[number - 1]
      return baseLine !== undefined && withoutNewline(baseLine) === `${line.text}\r`
    })
  )
}
