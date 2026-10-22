import { describe, expect, it } from 'vitest'
import {
  conflictCount,
  emptyChoice,
  parseConflictMarkers,
  resolvedLines,
  resolveMerge,
  setPicked,
  setSidePicked,
  withLineEndings,
  type MergeSegment
} from '../../src/domain/mergeConflict'

const size = 7
const ours = '<'.repeat(size)
const base = '|'.repeat(size)
const middle = '='.repeat(size)
const theirs = '>'.repeat(size)

const merged = parseConflictMarkers(
  ['top', `${ours} ours`, 'a1', 'a2', `${base} base`, 'original', middle, 'b1', `${theirs} theirs`, 'bottom', ''].join('\n'),
  size
)
const conflict = merged.segments[1] as Extract<MergeSegment, { kind: 'conflict' }>

describe('parseConflictMarkers', () => {
  it('splits the text into common lines and conflicts with their base lines', () => {
    expect(merged.segments).toEqual([
      { kind: 'common', lines: ['top'] },
      { kind: 'conflict', ours: ['a1', 'a2'], base: ['original'], theirs: ['b1'] },
      { kind: 'common', lines: ['bottom'] }
    ])
    expect(conflictCount(merged)).toBe(1)
    expect(merged.endsWithLineEnding).toBe(true)
    expect(merged.lineEnding).toBe('\n')
  })

  it('leaves the base empty for the merge conflict style, which has no base section', () => {
    const text = [`${ours} ours`, 'a', middle, 'b', `${theirs} theirs`].join('\n')
    expect(parseConflictMarkers(text, size).segments).toEqual([{ kind: 'conflict', ours: ['a'], base: [], theirs: ['b'] }])
  })

  it('keeps Windows line endings and a missing final line ending', () => {
    const parsed = parseConflictMarkers('one\r\ntwo', size)
    expect(parsed).toEqual({ segments: [{ kind: 'common', lines: ['one', 'two'] }], lineEnding: '\r\n', endsWithLineEnding: false })
    expect(resolveMerge(parsed, [])).toBe('one\r\ntwo')
    expect(withLineEndings('one\ntwo\n', parsed)).toBe('one\r\ntwo\r\n')
  })

  it('treats shorter marker-like lines as ordinary text', () => {
    const parsed = parseConflictMarkers('<<<<<<< not a marker\n', 32)
    expect(parsed.segments).toEqual([{ kind: 'common', lines: ['<<<<<<< not a marker'] }])
  })

  it('rejects text that ends inside a conflict', () => {
    expect(() => parseConflictMarkers(`${ours} ours\na\n`, size)).toThrow('ends inside a conflict')
  })
})

describe('resolvedLines', () => {
  it('keeps the base lines of a conflict nothing was picked from, marked unresolved', () => {
    expect(resolvedLines(merged, [emptyChoice])).toEqual([
      { text: 'top', origin: 'common', conflict: null },
      { text: 'original', origin: 'unresolved', conflict: 0 },
      { text: 'bottom', origin: 'common', conflict: null }
    ])
  })

  it('tells which side each picked line came from', () => {
    const choice = setPicked(setPicked(emptyChoice, 'theirs', [0], true), 'ours', [1], true)
    expect(resolvedLines(merged, [choice]).filter((line) => line.conflict === 0)).toEqual([
      { text: 'b1', origin: 'theirs', conflict: 0 },
      { text: 'a2', origin: 'ours', conflict: 0 }
    ])
  })
})

describe('resolveMerge', () => {
  it('keeps picked lines in file order within a side', () => {
    const choice = setPicked(setPicked(emptyChoice, 'ours', [1], true), 'ours', [0], true)
    expect(resolveMerge(merged, [choice])).toBe('top\na1\na2\nbottom\n')
  })

  it('puts the side picked first before the other', () => {
    const theirsFirst = setPicked(setPicked(emptyChoice, 'theirs', [0], true), 'ours', [0], true)
    expect(resolveMerge(merged, [theirsFirst])).toBe('top\nb1\na1\nbottom\n')
  })

  it('takes a whole side', () => {
    expect(resolveMerge(merged, [setSidePicked(emptyChoice, conflict, 'theirs', true)])).toBe('top\nb1\nbottom\n')
  })
})

describe('setPicked', () => {
  it('unpicks lines, and the first side stays put while lines remain', () => {
    const both = setPicked(setSidePicked(emptyChoice, conflict, 'ours', true), 'theirs', [0], true)
    expect(setPicked(both, 'ours', [0], false)).toEqual({ ours: [1], theirs: [0], first: 'ours' })
  })

  it('leaves the other side alone when a whole side is picked or unpicked', () => {
    const both = setPicked(setSidePicked(emptyChoice, conflict, 'ours', true), 'theirs', [0], true)
    expect(setSidePicked(both, conflict, 'ours', false)).toEqual({ ours: [], theirs: [0], first: 'ours' })
  })
})
