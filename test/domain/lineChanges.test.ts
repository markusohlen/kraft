import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff, type DiffLine } from '../../src/domain/diff'
import { reasonTextCannotBeRewritten, selectedLineCount, selectionOf, withSelectedChanges, isEmptySelection } from '../../src/domain/lineChanges'

const noneSelected = { removed: [], added: [] }

describe('withSelectedChanges', () => {
  // old: a b c d; new: a B c d e
  const mixedDiff = parseUnifiedDiff(['@@ -1,4 +1,5 @@', ' a', '-b', '+B', ' c', ' d', '+e', ''].join('\n'))
  const oldText = 'a\nb\nc\nd\n'
  const newText = 'a\nB\nc\nd\ne\n'

  describe('applying changes to the old text', () => {
    it('leaves it unchanged with nothing selected', () => {
      expect(withSelectedChanges(oldText, mixedDiff, noneSelected, 'apply')).toBe(oldText)
    })

    it('adds only the selected added line', () => {
      expect(withSelectedChanges(oldText, mixedDiff, { removed: [], added: [5] }, 'apply')).toBe('a\nb\nc\nd\ne\n')
    })

    it('removes only the selected removed line', () => {
      expect(withSelectedChanges(oldText, mixedDiff, { removed: [2], added: [] }, 'apply')).toBe('a\nc\nd\n')
    })

    it('replaces a line when both of its sides are selected', () => {
      expect(withSelectedChanges(oldText, mixedDiff, { removed: [2], added: [2] }, 'apply')).toBe('a\nB\nc\nd\n')
    })

    it('reaches the new text with everything selected', () => {
      expect(withSelectedChanges(oldText, mixedDiff, { removed: [2], added: [2, 5] }, 'apply')).toBe(newText)
    })
  })

  describe('undoing changes in the new text', () => {
    it('leaves it unchanged with nothing selected', () => {
      expect(withSelectedChanges(newText, mixedDiff, noneSelected, 'undo')).toBe(newText)
    })

    it('takes out only the selected added line', () => {
      expect(withSelectedChanges(newText, mixedDiff, { removed: [], added: [5] }, 'undo')).toBe('a\nB\nc\nd\n')
    })

    it('brings back only the selected removed line', () => {
      expect(withSelectedChanges(newText, mixedDiff, { removed: [2], added: [] }, 'undo')).toBe('a\nb\nB\nc\nd\ne\n')
    })

    it('reaches the old text with everything selected', () => {
      expect(withSelectedChanges(newText, mixedDiff, { removed: [2], added: [2, 5] }, 'undo')).toBe(oldText)
    })
  })

  it('keeps lines outside and between hunks', () => {
    const lines = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`)
    const base = `${lines.join('\n')}\n`
    const diff = parseUnifiedDiff(
      ['@@ -1,4 +1,5 @@', '+first', ' line 1', ' line 2', ' line 3', ' line 4', '@@ -20,3 +21,4 @@', ' line 20', '+middle', ' line 21', ' line 22', ''].join('\n')
    )

    const result = withSelectedChanges(base, diff, { removed: [], added: [1, 22] }, 'apply').split('\n')

    expect(result[0]).toBe('first')
    expect(result[1]).toBe('line 1')
    expect(result[21]).toBe('middle')
    expect(result[22]).toBe('line 21')
    expect(result.at(-2)).toBe('line 30')
    expect(result).toHaveLength(33)
  })

  it('handles adjacent selected lines', () => {
    const diff = parseUnifiedDiff(['@@ -1,2 +1,5 @@', ' a', '+x', '+y', '+z', ' b', ''].join('\n'))

    expect(withSelectedChanges('a\nb\n', diff, { removed: [], added: [2, 3] }, 'apply')).toBe('a\nx\ny\nb\n')
    expect(withSelectedChanges('a\nx\ny\nz\nb\n', diff, { removed: [], added: [3, 4] }, 'undo')).toBe('a\nx\nb\n')
  })

  describe('line endings', () => {
    it('keeps CRLF stored in the text, on every line', () => {
      const diff = parseUnifiedDiff(['@@ -1,2 +1,3 @@', ' a\r', '+x\r', ' b\r', ''].join('\n'))

      expect(withSelectedChanges('a\r\nb\r\n', diff, { removed: [], added: [2] }, 'apply')).toBe('a\r\nx\r\nb\r\n')
    })

    it('leaves a working file with converted CRLF endings all CRLF', () => {
      // Git shows the working file with LF because it converts it; its text on disk has CRLF.
      const diff = parseUnifiedDiff(['@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c', ''].join('\n'))

      expect(withSelectedChanges('a\r\nB\r\nc\r\n', diff, { removed: [2], added: [2] }, 'undo')).toBe('a\r\nb\r\nc\r\n')
    })

    it('does not add CR to a file that stores LF and is compared with LF', () => {
      expect(withSelectedChanges(newText, mixedDiff, { removed: [2], added: [2] }, 'undo')).toBe('a\nb\nc\nd\ne\n')
    })
  })

  describe('a missing newline at the end', () => {
    it('keeps it missing when the last line is unaffected', () => {
      const diff = parseUnifiedDiff(['@@ -1,2 +1,3 @@', ' a', '+x', ' b', '\\ No newline at end of file', ''].join('\n'))

      expect(withSelectedChanges('a\nb', diff, { removed: [], added: [2] }, 'apply')).toBe('a\nx\nb')
    })

    it('adds a line without a newline as it is', () => {
      const diff = parseUnifiedDiff(['@@ -1 +1,2 @@', ' a', '+b', '\\ No newline at end of file', ''].join('\n'))

      expect(withSelectedChanges('a\n', diff, { removed: [], added: [2] }, 'apply')).toBe('a\nb')
    })

    it('does not merge a line into one that had no newline', () => {
      // old "a" without a newline; new "a\nb\n".
      const diff = parseUnifiedDiff(['@@ -1 +1,2 @@', '-a', '\\ No newline at end of file', '+a', '+b', ''].join('\n'))

      expect(withSelectedChanges('a', diff, { removed: [], added: [2] }, 'apply')).toBe('a\nb\n')
    })

    it('restores a removed newline when the change is undone', () => {
      const diff = parseUnifiedDiff(['@@ -1 +1 @@', '-a', '+a', '\\ No newline at end of file', ''].join('\n'))

      expect(withSelectedChanges('a', diff, { removed: [1], added: [1] }, 'undo')).toBe('a\n')
    })
  })

  describe('a diff that does not match the text', () => {
    it('refuses when a line differs', () => {
      expect(() => withSelectedChanges('a\nedited\nc\nd\n', mixedDiff, { removed: [2], added: [] }, 'apply')).toThrow('no longer matches')
    })

    it('refuses when the text is too short', () => {
      expect(() => withSelectedChanges('a\n', mixedDiff, { removed: [2], added: [] }, 'apply')).toThrow('no longer matches')
    })

    it('refuses a selected line that the diff does not have', () => {
      expect(() => withSelectedChanges(oldText, mixedDiff, { removed: [], added: [99] }, 'apply')).toThrow('no longer matches')
      expect(() => withSelectedChanges(oldText, mixedDiff, { removed: [99], added: [] }, 'apply')).toThrow('no longer matches')
    })

    it('does not take an unchanged line for a selected one', () => {
      expect(() => withSelectedChanges(oldText, mixedDiff, { removed: [1], added: [] }, 'apply')).toThrow('no longer matches')
    })
  })

  it('works from a whole-file diff', () => {
    const diff = parseUnifiedDiff(['@@ -1,3 +1,4 @@', ' a', ' b', '+x', ' c', ''].join('\n'))

    expect(withSelectedChanges('a\nb\nc\n', diff, { removed: [], added: [3] }, 'apply')).toBe('a\nb\nx\nc\n')
  })
})

describe('selectionOf', () => {
  const lines = parseUnifiedDiff(['@@ -1,2 +1,2 @@', ' a', '-b', '+B', ''].join('\n')).hunks[0].lines

  it('takes changed lines by the number on their own side', () => {
    expect(selectionOf(lines)).toEqual({ removed: [2], added: [2] })
  })

  it('skips unchanged lines and the empty side of a split row', () => {
    const context: DiffLine = lines[0]

    expect(isEmptySelection(selectionOf([context, null]))).toBe(true)
  })
})

describe('selectedLineCount', () => {
  // b is replaced by B with C added after it, and x is added further down.
  const diff = parseUnifiedDiff(['@@ -1,5 +1,7 @@', ' a', '-b', '+B', '+C', ' c', ' d', '+x', ' e', ''].join('\n'))

  it('counts a replaced line once when both of its sides are selected', () => {
    expect(selectedLineCount(diff, { removed: [2], added: [2] })).toBe(1)
  })

  it('counts one side of a replaced line once', () => {
    expect(selectedLineCount(diff, { removed: [2], added: [] })).toBe(1)
    expect(selectedLineCount(diff, { removed: [], added: [2] })).toBe(1)
  })

  it('counts an added line with no line opposite it separately', () => {
    expect(selectedLineCount(diff, { removed: [2], added: [2, 3] })).toBe(2)
  })

  it('does not pair changes from different places', () => {
    expect(selectedLineCount(diff, { removed: [2], added: [6] })).toBe(2)
  })
})

describe('reasonTextCannotBeRewritten', () => {
  it('accepts ordinary text', () => {
    expect(reasonTextCannotBeRewritten('hello\n')).toBeNull()
  })

  it('refuses binary files', () => {
    expect(reasonTextCannotBeRewritten('a\0b')).toMatch(/binary/)
  })

  it('refuses text that did not survive being read as UTF-8', () => {
    expect(reasonTextCannotBeRewritten(Buffer.from([0x61, 0xe9, 0x0a]).toString('utf8'))).toMatch(/UTF-8/)
  })
})
