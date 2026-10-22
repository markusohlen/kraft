import { describe, expect, it } from 'vitest'
import { extendFileSelection, selectFile, selectedPaths } from '../../src/renderer/src/fileSelection'

const unstaged = ['a.ts', 'b.ts', 'c.ts', 'd.ts']

describe('extendFileSelection', () => {
  it('toggle adds a file to the selection and makes it the anchor', () => {
    expect(extendFileSelection(selectFile(false, 'a.ts'), false, unstaged, 'c.ts', 'toggle')).toEqual({
      staged: false,
      paths: ['a.ts', 'c.ts'],
      anchor: 'c.ts'
    })
  })

  it('toggle removes a selected file, and clears the selection when it was the last one', () => {
    const selection = { staged: false, paths: ['a.ts', 'c.ts'], anchor: 'c.ts' }
    expect(extendFileSelection(selection, false, unstaged, 'a.ts', 'toggle')?.paths).toEqual(['c.ts'])
    expect(extendFileSelection(selectFile(false, 'a.ts'), false, unstaged, 'a.ts', 'toggle')).toBeNull()
  })

  it('range selects every file from the anchor to the clicked one, in either direction', () => {
    expect(extendFileSelection(selectFile(false, 'b.ts'), false, unstaged, 'd.ts', 'range')?.paths).toEqual(['b.ts', 'c.ts', 'd.ts'])
    expect(extendFileSelection(selectFile(false, 'c.ts'), false, unstaged, 'a.ts', 'range')?.paths).toEqual(['a.ts', 'b.ts', 'c.ts'])
  })

  it('range keeps its anchor so a second shift-click moves the end of the range', () => {
    const first = extendFileSelection(selectFile(false, 'b.ts'), false, unstaged, 'd.ts', 'range')
    expect(extendFileSelection(first, false, unstaged, 'a.ts', 'range')).toEqual({ staged: false, paths: ['a.ts', 'b.ts'], anchor: 'b.ts' })
  })

  it('starts over with the clicked file when the selection is in the other list', () => {
    expect(extendFileSelection(selectFile(true, 'x.ts'), false, unstaged, 'c.ts', 'range')).toEqual(selectFile(false, 'c.ts'))
    expect(extendFileSelection(null, false, unstaged, 'c.ts', 'toggle')).toEqual(selectFile(false, 'c.ts'))
  })

  it('starts over when the anchor is no longer in the list', () => {
    expect(extendFileSelection(selectFile(false, 'gone.ts'), false, unstaged, 'c.ts', 'range')).toEqual(selectFile(false, 'c.ts'))
  })
})

describe('selectedPaths', () => {
  it('returns the selected files still in the list, in list order', () => {
    const selection = { staged: false, paths: ['d.ts', 'gone.ts', 'a.ts'], anchor: 'a.ts' }
    expect(selectedPaths(selection, false, unstaged)).toEqual(['a.ts', 'd.ts'])
  })

  it('returns nothing for the other list', () => {
    expect(selectedPaths(selectFile(true, 'a.ts'), false, unstaged)).toEqual([])
  })
})
