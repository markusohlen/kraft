export interface DiffOptions {
  /** Show the whole file around the changes instead of a few lines of context. */
  fullFile: boolean
}

export const defaultDiffOptions: DiffOptions = { fullFile: false }

export type DiffLineKind = 'context' | 'added' | 'removed' | 'note'

/** A piece of a line; `changed` marks the characters that differ from the paired line on the other side. */
export interface TextSegment {
  text: string
  changed: boolean
}

export interface DiffLine {
  kind: DiffLineKind
  text: string
  oldNumber: number | null
  newNumber: number | null
  segments: TextSegment[]
}

export interface DiffHunk {
  header: string
  lines: DiffLine[]
}

export interface ParsedDiff {
  hunks: DiffHunk[]
  /** Messages outside the hunks, e.g. that a file is binary. */
  notes: string[]
}

/** One row of a side-by-side diff: the old line on the left and the new line on the right. */
export type SplitRow = { kind: 'pair'; left: DiffLine | null; right: DiffLine | null } | { kind: 'note'; text: string }

/**
 * Below this share of unchanged characters a line counts as rewritten, and highlighting
 * the "changed part" would just highlight almost everything.
 */
const minimumSharedFraction = 0.25

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

export function parseUnifiedDiff(raw: string): ParsedDiff {
  const hunks: DiffHunk[] = []
  const notes: string[] = []
  let current: DiffHunk | null = null
  let oldNumber = 0
  let newNumber = 0

  for (const rawLine of raw.split('\n')) {
    const header = hunkHeader.exec(rawLine)
    if (header) {
      oldNumber = Number(header[1])
      newNumber = Number(header[2])
      current = { header: rawLine, lines: [] }
      hunks.push(current)
    } else if (/^Binary files? /.test(rawLine)) {
      notes.push(rawLine)
    } else if (!current) {
      continue
    } else if (rawLine.startsWith('+')) {
      current.lines.push(line('added', rawLine.slice(1), null, newNumber++))
    } else if (rawLine.startsWith('-')) {
      current.lines.push(line('removed', rawLine.slice(1), oldNumber++, null))
    } else if (rawLine.startsWith(' ')) {
      current.lines.push(line('context', rawLine.slice(1), oldNumber++, newNumber++))
    } else if (rawLine.startsWith('\\')) {
      current.lines.push(line('note', rawLine, null, null))
    }
  }
  return { hunks: hunks.map(highlightPairedLines), notes }
}

/** Lines up removed lines with the added lines that replace them; unchanged lines appear on both sides. */
export function toSplitRows(hunk: DiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  forEachBlock(hunk.lines, {
    unchanged: (unchangedLine) =>
      rows.push(
        unchangedLine.kind === 'note'
          ? { kind: 'note', text: unchangedLine.text }
          : { kind: 'pair', left: unchangedLine, right: unchangedLine }
      ),
    changed: (removed, added) => {
      for (let index = 0; index < Math.max(removed.length, added.length); index++) {
        rows.push({ kind: 'pair', left: removed[index] ?? null, right: added[index] ?? null })
      }
    }
  })
  return rows
}

/** Splits two versions of a line into the shared start, the part that differs, and the shared end. */
export function highlightChange(oldText: string, newText: string): { old: TextSegment[]; new: TextSegment[] } {
  const maxShared = Math.min(oldText.length, newText.length)
  let prefix = 0
  while (prefix < maxShared && oldText[prefix] === newText[prefix]) prefix++
  let suffix = 0
  while (suffix < maxShared - prefix && oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]) suffix++
  prefix = withoutSplitCharacter(oldText, prefix)

  const longer = Math.max(oldText.length, newText.length)
  if (longer === 0 || (prefix + suffix) / longer < minimumSharedFraction) {
    return { old: plain(oldText), new: plain(newText) }
  }
  return { old: segmentsAround(oldText, prefix, suffix), new: segmentsAround(newText, prefix, suffix) }
}

function highlightPairedLines(hunk: DiffHunk): DiffHunk {
  const lines = [...hunk.lines]
  forEachBlock(hunk.lines, {
    unchanged: () => undefined,
    changed: (removed, added) => {
      for (let index = 0; index < Math.min(removed.length, added.length); index++) {
        const highlighted = highlightChange(removed[index].text, added[index].text)
        lines[lines.indexOf(removed[index])] = { ...removed[index], segments: highlighted.old }
        lines[lines.indexOf(added[index])] = { ...added[index], segments: highlighted.new }
      }
    }
  })
  return { ...hunk, lines }
}

/** Walks a hunk as unchanged lines and blocks of removed lines followed by the added lines that replace them. */
function forEachBlock(
  lines: readonly DiffLine[],
  visit: { unchanged: (line: DiffLine) => void; changed: (removed: DiffLine[], added: DiffLine[]) => void }
): void {
  let index = 0
  while (index < lines.length) {
    if (lines[index].kind === 'context' || lines[index].kind === 'note') {
      visit.unchanged(lines[index++])
      continue
    }
    const removed: DiffLine[] = []
    const added: DiffLine[] = []
    while (index < lines.length && lines[index].kind === 'removed') removed.push(lines[index++])
    while (index < lines.length && lines[index].kind === 'added') added.push(lines[index++])
    visit.changed(removed, added)
  }
}

function line(kind: DiffLineKind, text: string, oldNumber: number | null, newNumber: number | null): DiffLine {
  return { kind, text, oldNumber, newNumber, segments: plain(text) }
}

function plain(text: string): TextSegment[] {
  return [{ text, changed: false }]
}

function segmentsAround(text: string, prefix: number, suffix: number): TextSegment[] {
  // Nothing differs on this side when the other side only inserted text.
  if (prefix + suffix >= text.length) return plain(text)
  const segments: TextSegment[] = [
    { text: text.slice(0, prefix), changed: false },
    { text: text.slice(prefix, text.length - suffix), changed: true },
    { text: text.slice(text.length - suffix), changed: false }
  ]
  return segments.filter((segment) => segment.text.length > 0)
}

/** Moves the cut back so it never falls between the two halves of an emoji or other surrogate pair. */
function withoutSplitCharacter(text: string, cut: number): number {
  const code = text.charCodeAt(cut - 1)
  return cut > 0 && code >= 0xd800 && code <= 0xdbff ? cut - 1 : cut
}
