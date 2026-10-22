import { describe, expect, it } from 'vitest'
import { parseUnifiedDiff } from '../../src/domain/diff'
import { highlightDiff, withChangedText } from '../../src/renderer/src/diffHighlight'

describe('withChangedText', () => {
  it('cuts tokens where the changed text starts and ends', () => {
    const tokens = [
      { text: 'const', kinds: ['keyword'] },
      { text: ' x = ', kinds: [] },
      { text: '"old"', kinds: ['string'] }
    ]
    const segments = [
      { text: 'const x = "', changed: false },
      { text: 'old', changed: true },
      { text: '"', changed: false }
    ]

    expect(withChangedText(tokens, segments)).toEqual([
      { text: 'const', kinds: ['keyword'], changed: false },
      { text: ' x = ', kinds: [], changed: false },
      { text: '"', kinds: ['string'], changed: false },
      { text: 'old', kinds: ['string'], changed: true },
      { text: '"', kinds: ['string'], changed: false }
    ])
  })

  it('handles empty segments and lines', () => {
    expect(withChangedText([], [{ text: '', changed: false }])).toEqual([])
    expect(withChangedText([{ text: 'a', kinds: [] }], [{ text: '', changed: false }])).toEqual([{ text: 'a', kinds: [], changed: false }])
  })
})

describe('highlightDiff', () => {
  const diff = parseUnifiedDiff(['@@ -1,2 +1,2 @@', ' /* start', '-old */', '+new */ const x = 1'].join('\n'))
  const [context, removed, added] = diff.hunks[0].lines

  it('tokenizes the old and new versions on their own, keeping comments that span lines', () => {
    const highlighted = highlightDiff(diff.hunks, 'typescript')

    expect(highlighted.get(context)).toEqual([{ text: '/* start', kinds: ['comment'] }])
    expect(highlighted.get(removed)).toEqual([{ text: 'old */', kinds: ['comment'] }])
    expect(highlighted.get(added)?.[0]).toEqual({ text: 'new */', kinds: ['comment'] })
    expect(highlighted.get(added)).toContainEqual({ text: 'const', kinds: ['keyword'] })
  })

  it('highlights nothing without a language', () => {
    expect(highlightDiff(diff.hunks, null).size).toBe(0)
  })
})
