import { describe, expect, it } from 'vitest'
import {
  conflictCount,
  emptyChoice,
  isChoiceEmpty,
  parseConflictMarkers,
  resolvedLines,
  resolveMerge,
  setPicked,
  setSidePicked,
  sidePickState,
  withLineEndings,
  type ConflictSegment,
  type MergedText
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
const conflict = merged.segments[1] as ConflictSegment
const emptyOurs: ConflictSegment = { kind: 'conflict', ours: [], base: ['original'], theirs: ['b1'] }
const mergedEmptyOurs: MergedText = { segments: [{ kind: 'common', lines: ['top'] }, emptyOurs], lineEnding: '\n', endsWithLineEnding: true }

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

  it('takes a side with no lines, dropping the base lines', () => {
    expect(resolveMerge(mergedEmptyOurs, [emptyChoice])).toBe('top\noriginal\n')
    expect(resolveMerge(mergedEmptyOurs, [setSidePicked(emptyChoice, emptyOurs, 'ours', true)])).toBe('top\n')
  })

  it('adds the other side’s lines to a picked side with no lines', () => {
    const both = setSidePicked(setSidePicked(emptyChoice, emptyOurs, 'ours', true), emptyOurs, 'theirs', true)
    expect(resolveMerge(mergedEmptyOurs, [both])).toBe('top\nb1\n')
  })

  it('leaves an empty file when the only conflict resolves to a side with no lines', () => {
    const wholeFile: MergedText = { segments: [emptyOurs], lineEnding: '\n', endsWithLineEnding: true }
    expect(resolveMerge(wholeFile, [setSidePicked(emptyChoice, emptyOurs, 'ours', true)])).toBe('')
  })
})

describe('setPicked', () => {
  it('unpicks lines, and the first side stays put while lines remain', () => {
    const both = setPicked(setSidePicked(emptyChoice, conflict, 'ours', true), 'theirs', [0], true)
    expect(setPicked(both, 'ours', [0], false)).toEqual({ ours: [1], theirs: [0], first: 'ours', emptySidePicked: false })
  })

  it('leaves the other side alone when a whole side is picked or unpicked', () => {
    const both = setPicked(setSidePicked(emptyChoice, conflict, 'ours', true), 'theirs', [0], true)
    expect(setSidePicked(both, conflict, 'ours', false)).toEqual({ ours: [], theirs: [0], first: 'ours', emptySidePicked: false })
  })
})

describe('setSidePicked on a side with no lines', () => {
  it('counts as a choice until it is unpicked, leaving the other side alone', () => {
    const picked = setSidePicked(emptyChoice, emptyOurs, 'ours', true)
    expect(isChoiceEmpty(picked)).toBe(false)
    expect(isChoiceEmpty(setSidePicked(picked, emptyOurs, 'ours', false))).toBe(true)

    const withTheirs = setSidePicked(picked, emptyOurs, 'theirs', true)
    expect(setSidePicked(withTheirs, emptyOurs, 'ours', false).theirs).toEqual([0])
    expect(setSidePicked(withTheirs, emptyOurs, 'theirs', false).emptySidePicked).toBe(true)
  })
})

describe('sidePickState', () => {
  const none = { checked: false, indeterminate: false }
  const all = { checked: true, indeterminate: false }
  const some = { checked: false, indeterminate: true }

  it('follows the picked lines of a side with lines', () => {
    expect(sidePickState([conflict], [emptyChoice], 'ours')).toEqual(none)
    expect(sidePickState([conflict], [setPicked(emptyChoice, 'ours', [0], true)], 'ours')).toEqual(some)
    expect(sidePickState([conflict], [setSidePicked(emptyChoice, conflict, 'ours', true)], 'ours')).toEqual(all)
  })

  it('is not picked just because a side has no lines', () => {
    expect(sidePickState([emptyOurs], [emptyChoice], 'ours')).toEqual(none)
    expect(sidePickState([emptyOurs], [setSidePicked(emptyChoice, emptyOurs, 'ours', true)], 'ours')).toEqual(all)
  })

  it('combines conflicts with and without lines on that side', () => {
    const segments = [conflict, emptyOurs]
    const pickedEmpty = setSidePicked(emptyChoice, emptyOurs, 'ours', true)
    expect(sidePickState(segments, [emptyChoice, pickedEmpty], 'ours')).toEqual(some)
    expect(sidePickState(segments, [setSidePicked(emptyChoice, conflict, 'ours', true), pickedEmpty], 'ours')).toEqual(all)
  })

  it('has nothing to pick without conflicts', () => {
    expect(sidePickState([], [], 'ours')).toEqual(none)
  })
})
