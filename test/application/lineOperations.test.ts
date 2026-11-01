import { chmod, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeLines, type LineAction } from '../../src/application/lineOperations'
import { defaultDiffOptions, type DiffOptions } from '../../src/domain/diff'
import type { FileChange } from '../../src/domain/entities'
import type { LineSelection } from '../../src/domain/lineChanges'
import { createTestRepository, type TestRepository } from './gitTestRepository'

const change: FileChange = { path: 'file.txt', oldPath: null, status: 'modified' }

describe('changing single lines', () => {
  let test: TestRepository

  beforeEach(async () => {
    test = await createTestRepository()
    await test.commitFile('file.txt', 'one\ntwo\nthree\nfour\n', 'Add file')
  })

  afterEach(() => test.dispose())

  const stored = (path = 'file.txt') => test.git('show', `:${path}`)
  const onDisk = (path = 'file.txt') => readFile(join(test.path, path), 'utf8')
  const status = () => test.git('status', '--porcelain')

  /** Acts on the diff as it is right now, as the window does with the one it shows. */
  async function act(action: LineAction, selection: LineSelection, target: FileChange = change, options: DiffOptions = defaultDiffOptions) {
    const shownDiff = await test.repository.workingFileDiff(target, action === 'unstage', options)
    await changeLines(test.repository, { action, change: target, shownDiff, options, selection })
  }

  describe('staging', () => {
    it('stages only the selected line and leaves the working file alone', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nTHREE\nfour\n')

      await act('stage', { removed: [], added: [2] })

      expect(await stored()).toBe('one\nadded\ntwo\nthree\nfour')
      expect(await onDisk()).toBe('one\nadded\ntwo\nTHREE\nfour\n')
      expect(await status()).toBe('MM file.txt')
    })

    it('stages a replaced line when both of its sides are selected', async () => {
      await test.write('file.txt', 'one\nTWO\nthree\nfour\n')

      await act('stage', { removed: [2], added: [2] })

      expect(await test.git('diff', '--cached', '--stat', '--', 'file.txt')).toContain('2 +-')
      expect(await status()).toBe('M  file.txt')
    })

    it('leaves the file fully staged once every line is', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\n')

      await act('stage', { removed: [], added: [2] })

      expect(await status()).toBe('M  file.txt')
      expect(await test.git('diff', '--', 'file.txt')).toBe('')
    })

    it('adds to what is already staged', async () => {
      await test.write('file.txt', 'one\nfirst\ntwo\nthree\nsecond\nfour\n')
      await act('stage', { removed: [], added: [2] })

      await act('stage', { removed: [], added: [5] })

      expect(await stored()).toBe('one\nfirst\ntwo\nthree\nsecond\nfour')
    })

    it('stores LF for a working file git converts from CRLF', async () => {
      await test.git('config', 'core.autocrlf', 'true')
      await writeFile(join(test.path, 'file.txt'), 'one\r\nadded\r\ntwo\r\nthree\r\nfour\r\nlast\r\n')

      await act('stage', { removed: [], added: [2] })

      expect(await test.git('cat-file', 'blob', ':file.txt')).toBe('one\nadded\ntwo\nthree\nfour')
      expect(await onDisk()).toBe('one\r\nadded\r\ntwo\r\nthree\r\nfour\r\nlast\r\n')
    })

    it('keeps an executable file executable', async () => {
      await test.git('update-index', '--chmod=+x', 'file.txt')
      await test.git('commit', '-q', '-m', 'Make executable')
      await chmod(join(test.path, 'file.txt'), 0o755)
      await test.git('config', 'core.fileMode', 'false')
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\nlast\n')

      await act('stage', { removed: [], added: [2] })

      expect(await test.git('ls-files', '--stage', '--', 'file.txt')).toMatch(/^100755 /)
    })

    it('works from a whole-file diff', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\nlast\n')

      await act('stage', { removed: [], added: [6] }, change, { fullFile: true })

      expect(await stored()).toBe('one\ntwo\nthree\nfour\nlast')
    })

    it('handles a path with spaces and characters a pathspec treats specially', async () => {
      const path = 'odd name [1].txt'
      await test.commitFile(path, 'one\n', 'Add odd file')
      await test.write(path, 'one\ntwo\nthree\n')

      await act('stage', { removed: [], added: [3] }, { ...change, path })

      expect(await stored(path)).toBe('one\nthree')
    })
  })

  describe('unstaging', () => {
    it('unstages only the selected line and leaves the working file alone', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nTHREE\nfour\n')
      await test.git('add', 'file.txt')

      await act('unstage', { removed: [], added: [2] })

      expect(await stored()).toBe('one\ntwo\nTHREE\nfour')
      expect(await onDisk()).toBe('one\nadded\ntwo\nTHREE\nfour\n')
    })

    it('brings back a line the index had removed', async () => {
      await test.write('file.txt', 'one\nthree\nfour\n')
      await test.git('add', 'file.txt')

      await act('unstage', { removed: [2], added: [] })

      expect(await stored()).toBe('one\ntwo\nthree\nfour')
      expect(await onDisk()).toBe('one\nthree\nfour\n')
    })

    it('leaves nothing staged once every line is out', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\n')
      await test.git('add', 'file.txt')

      await act('unstage', { removed: [], added: [2] })

      expect(await status()).toBe('M file.txt')
    })
  })

  describe('discarding', () => {
    it('discards only the selected line, as in the issue: an added comment', async () => {
      await test.write('file.txt', 'one\n// a comment\ntwo\nTHREE\nfour\n')

      await act('discard', { removed: [], added: [2] })

      expect(await onDisk()).toBe('one\ntwo\nTHREE\nfour\n')
      expect(await stored()).toBe('one\ntwo\nthree\nfour')
    })

    it('brings back a removed line', async () => {
      await test.write('file.txt', 'one\nthree\nfour\n')

      await act('discard', { removed: [2], added: [] })

      expect(await onDisk()).toBe('one\ntwo\nthree\nfour\n')
    })

    it('leaves the file unchanged in status once every line is discarded', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\n')

      await act('discard', { removed: [], added: [2] })

      expect(await status()).toBe('')
    })

    it('keeps CRLF in a working file git converts', async () => {
      await test.git('config', 'core.autocrlf', 'true')
      await writeFile(join(test.path, 'file.txt'), 'one\r\nTWO\r\nthree\r\nfour\r\nadded\r\n')

      await act('discard', { removed: [2], added: [2] })

      expect(await onDisk()).toBe('one\r\ntwo\r\nthree\r\nfour\r\nadded\r\n')
      expect(await stored()).toBe('one\ntwo\nthree\nfour')
    })

    it('keeps CRLF stored in the repository', async () => {
      await test.git('config', 'core.autocrlf', 'false')
      await test.commitFile('crlf.txt', 'one\r\ntwo\r\n', 'Add CRLF file')
      await writeFile(join(test.path, 'crlf.txt'), 'one\r\nadded\r\ntwo\r\nlast\r\n')
      const target = { ...change, path: 'crlf.txt' }

      await act('stage', { removed: [], added: [4] }, target)
      await act('discard', { removed: [], added: [2] }, target)

      expect(await test.git('cat-file', 'blob', ':crlf.txt')).toBe('one\r\ntwo\r\nlast')
      expect(await onDisk('crlf.txt')).toBe('one\r\ntwo\r\nlast\r\n')
    })

    it('keeps a missing newline at the end of the file', async () => {
      await test.commitFile('open.txt', 'one\ntwo', 'Add file without a newline')
      await test.write('open.txt', 'one\nadded\ntwo')

      await act('discard', { removed: [], added: [2] }, { ...change, path: 'open.txt' })

      expect(await onDisk('open.txt')).toBe('one\ntwo')
    })
  })

  describe('refusing', () => {
    it('does nothing when the file changed since the diff was shown', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\n')
      const shownDiff = await test.repository.workingFileDiff(change, false, defaultDiffOptions)
      await test.write('file.txt', 'one\nedited since\ntwo\nthree\nfour\n')

      for (const action of ['stage', 'discard'] as const) {
        await expect(
          changeLines(test.repository, { action, change, shownDiff, options: defaultDiffOptions, selection: { removed: [], added: [2] } })
        ).rejects.toThrow('changed since this diff was shown')
      }

      expect(await onDisk()).toBe('one\nedited since\ntwo\nthree\nfour\n')
      expect(await stored()).toBe('one\ntwo\nthree\nfour')
    })

    it('does nothing with no lines selected', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\n')

      await expect(act('stage', { removed: [], added: [] })).rejects.toThrow('Select the changed lines')
    })

    it('refuses a file that is not modified on that side', async () => {
      await test.write('file.txt', 'one\nadded\ntwo\nthree\nfour\n')

      await expect(act('unstage', { removed: [], added: [2] })).rejects.toThrow('only modified files')
    })

    it('refuses an untracked file', async () => {
      await test.write('new.txt', 'one\n')
      const target: FileChange = { path: 'new.txt', oldPath: null, status: 'untracked' }

      await expect(act('stage', { removed: [], added: [1] }, target)).rejects.toThrow('only modified files')
    })

    it('refuses a file that is not UTF-8, which would come back damaged', async () => {
      await writeFile(join(test.path, 'latin.txt'), Buffer.from('caf\xe9\nline\n', 'latin1'))
      await test.git('add', 'latin.txt')
      await test.git('commit', '-q', '-m', 'Add Latin-1 file')
      await writeFile(join(test.path, 'latin.txt'), Buffer.from('caf\xe9\nline\nadded\n', 'latin1'))

      await expect(act('discard', { removed: [], added: [3] }, { ...change, path: 'latin.txt' })).rejects.toThrow('not UTF-8')

      expect((await readFile(join(test.path, 'latin.txt')))[3]).toBe(0xe9)
    })
  })
})
