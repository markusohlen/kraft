import { describe, expect, it } from 'vitest'
import { mergeToolRows } from '../../src/renderer/src/mergeToolRows'

describe('mergeToolRows', () => {
  it('numbers each side’s lines on its own and pads the shorter side of a conflict', () => {
    const rows = mergeToolRows({
      segments: [
        { kind: 'common', lines: ['top'] },
        { kind: 'conflict', ours: ['a1', 'a2'], base: ['original'], theirs: ['b1'] },
        { kind: 'common', lines: ['bottom'] }
      ],
      lineEnding: '\n',
      endsWithLineEnding: true
    })

    expect(rows).toEqual([
      { kind: 'common', oursNumber: 1, theirsNumber: 1, text: 'top' },
      {
        kind: 'conflict',
        conflict: 0,
        startsConflict: true,
        ours: { index: 0, number: 2, text: 'a1' },
        theirs: { index: 0, number: 2, text: 'b1' }
      },
      { kind: 'conflict', conflict: 0, startsConflict: false, ours: { index: 1, number: 3, text: 'a2' }, theirs: null },
      { kind: 'common', oursNumber: 4, theirsNumber: 3, text: 'bottom' }
    ])
  })
})
