import type { DiffHunk, DiffLine, TextSegment } from '../../domain/diff'
import { highlightLines, type HighlightedLine } from './syntaxHighlight'

/** A run of a diff line's text with its syntax token kinds, and whether it is part of what changed. */
export interface DiffPiece {
  text: string
  kinds: string[]
  changed: boolean
}

/**
 * Syntax-highlights every line of a diff. Each hunk's old version (unchanged and removed lines) and new
 * version (unchanged and added lines) are tokenized separately, as the code they are, so a comment or
 * string spanning several lines is coloured right on each side.
 */
export function highlightDiff(hunks: readonly DiffHunk[], language: string | null): Map<DiffLine, HighlightedLine> {
  const highlighted = new Map<DiffLine, HighlightedLine>()
  if (!language) return highlighted
  for (const hunk of hunks) {
    for (const side of ['removed', 'added'] as const) {
      const lines = hunk.lines.filter((line) => line.kind === 'context' || line.kind === side)
      const tokens = highlightLines(lines.map((line) => line.text), language)
      lines.forEach((line, index) => highlighted.set(line, tokens[index]))
    }
  }
  return highlighted
}

/** Cuts a line's syntax tokens where its changed text starts and ends, so each piece carries both. */
export function withChangedText(tokens: HighlightedLine, segments: readonly TextSegment[]): DiffPiece[] {
  const pieces: DiffPiece[] = []
  let segmentIndex = 0
  let usedOfSegment = 0
  for (const token of tokens) {
    let text = token.text
    while (text.length > 0) {
      while (segmentIndex < segments.length && usedOfSegment >= segments[segmentIndex].text.length) {
        segmentIndex++
        usedOfSegment = 0
      }
      const segment = segments[segmentIndex]
      if (!segment) {
        pieces.push({ text, kinds: token.kinds, changed: false })
        break
      }
      const length = Math.min(segment.text.length - usedOfSegment, text.length)
      pieces.push({ text: text.slice(0, length), kinds: token.kinds, changed: segment.changed })
      text = text.slice(length)
      usedOfSegment += length
    }
  }
  return pieces
}
