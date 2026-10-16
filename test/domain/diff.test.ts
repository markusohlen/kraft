import { describe, expect, it } from 'vitest'
import { highlightChange, parseUnifiedDiff, toSplitRows, type DiffLine, type SplitRow } from '../../src/domain/diff'

const sampleDiff = [
  'diff --git a/meal.cs b/meal.cs',
  '--- a/meal.cs',
  '+++ b/meal.cs',
  '@@ -124,4 +124,5 @@ private async Task LookupNutrition(int index)',
  '     {',
  '-        ingredient.Protein = data.ProteinPer100g;',
  '+        ingredient.Protein = (int)data.ProteinPer100g;',
  '+        ingredient.Fat = data.FatPer100g;',
  '     }',
  '-    // old note',
  '\\ No newline at end of file',
  ''
].join('\n')

/** Rows as `left | right` with line numbers, e.g. `125 { | 125 {`. */
function describeRows(rows: SplitRow[]): string[] {
  const side = (line: DiffLine | null, number: number | null | undefined) => (line ? `${number} ${line.text.trim()}` : '-')
  return rows.map((row) =>
    row.kind === 'note' ? `note: ${row.text}` : `${side(row.left, row.left?.oldNumber)} | ${side(row.right, row.right?.newNumber)}`
  )
}

describe('unified diff parsing', () => {
  it('numbers the old and new lines from the hunk header', () => {
    const [hunk] = parseUnifiedDiff(sampleDiff).hunks

    expect(hunk.header).toMatch(/^@@ -124,4 \+124,5 @@/)
    expect(hunk.lines.map((line) => [line.kind, line.oldNumber, line.newNumber])).toEqual([
      ['context', 124, 124],
      ['removed', 125, null],
      ['added', null, 125],
      ['added', null, 126],
      ['context', 126, 127],
      ['removed', 127, null],
      ['note', null, null]
    ])
  })

  it('reports binary files as notes', () => {
    expect(parseUnifiedDiff('Binary files a/x.png and b/x.png differ\n')).toEqual({
      hunks: [],
      notes: ['Binary files a/x.png and b/x.png differ']
    })
  })

  it('highlights only the changed part of a replaced line', () => {
    const [hunk] = parseUnifiedDiff(sampleDiff).hunks

    expect(hunk.lines[1].segments).toEqual([{ text: '        ingredient.Protein = data.ProteinPer100g;', changed: false }])
    expect(hunk.lines[2].segments).toEqual([
      { text: '        ingredient.Protein = ', changed: false },
      { text: '(int)', changed: true },
      { text: 'data.ProteinPer100g;', changed: false }
    ])
    expect(hunk.lines[3].segments).toEqual([{ text: '        ingredient.Fat = data.FatPer100g;', changed: false }])
  })
})

describe('side-by-side rows', () => {
  it('pairs removed lines with the added lines that replace them and leaves gaps for the rest', () => {
    const [hunk] = parseUnifiedDiff(sampleDiff).hunks

    expect(describeRows(toSplitRows(hunk))).toEqual([
      '124 { | 124 {',
      '125 ingredient.Protein = data.ProteinPer100g; | 125 ingredient.Protein = (int)data.ProteinPer100g;',
      '- | 126 ingredient.Fat = data.FatPer100g;',
      '126 } | 127 }',
      '127 // old note | -',
      'note: \\ No newline at end of file'
    ])
  })
})

describe('changed-part highlighting', () => {
  it('marks the differing middle of both lines', () => {
    expect(highlightChange('let total = 1', 'let sum = 1')).toEqual({
      old: [
        { text: 'let ', changed: false },
        { text: 'total', changed: true },
        { text: ' = 1', changed: false }
      ],
      new: [
        { text: 'let ', changed: false },
        { text: 'sum', changed: true },
        { text: ' = 1', changed: false }
      ]
    })
  })

  it('does not highlight lines that were rewritten almost completely', () => {
    expect(highlightChange('return a;', 'throw new Error();')).toEqual({
      old: [{ text: 'return a;', changed: false }],
      new: [{ text: 'throw new Error();', changed: false }]
    })
  })

  it('never cuts an emoji in half', () => {
    const { old } = highlightChange('a😀b', 'a😃b')
    expect(old.map((segment) => segment.text).join('')).toBe('a😀b')
    expect(old.find((segment) => segment.changed)?.text).toBe('😀')
  })
})
