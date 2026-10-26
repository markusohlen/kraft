import { describe, expect, it } from 'vitest'
import { overviewMarks } from '../../src/renderer/src/diffOverview'

describe('overviewMarks', () => {
  it('turns each run of changed rows into one mark positioned by its share of the rows', () => {
    const marks = overviewMarks([null, 'added', 'added', null, 'removed', 'modified', null, null])

    expect(marks).toEqual([
      { kind: 'added', start: 1 / 8, end: 3 / 8 },
      { kind: 'removed', start: 4 / 8, end: 5 / 8 },
      { kind: 'modified', start: 5 / 8, end: 6 / 8 }
    ])
  })

  it('marks a change on the last row up to the bottom', () => {
    expect(overviewMarks([null, 'added'])).toEqual([{ kind: 'added', start: 0.5, end: 1 }])
  })

  it('has no marks without changes or rows', () => {
    expect(overviewMarks([null, null])).toEqual([])
    expect(overviewMarks([])).toEqual([])
  })
})
