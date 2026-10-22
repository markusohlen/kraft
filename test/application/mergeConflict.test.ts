import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadMergeConflict, resolveMergeConflict } from '../../src/application/conflictOperations'
import { createTestRepository, type TestRepository } from './gitTestRepository'

describe('merge conflicts', () => {
  let test: TestRepository

  /** Commits `ours` on main and `theirs` on a branch, then merges the branch so the file conflicts. */
  async function conflictOn(file: string, base: string | null, ours: string | null, theirs: string | null) {
    if (base !== null) await test.commitFile(file, base, 'Base')
    await test.git('checkout', '-q', '-b', 'incoming')
    if (theirs === null) await test.git('rm', '-q', file)
    else await test.write(file, theirs)
    await test.git('add', '-A')
    await test.git('commit', '-q', '-m', 'Theirs')
    await test.git('checkout', '-q', 'main')
    if (ours === null) await test.git('rm', '-q', file)
    else await test.write(file, ours)
    await test.git('add', '-A')
    await test.git('commit', '-q', '-m', 'Ours')
    await test.git('merge', 'incoming').catch(() => undefined)
  }

  beforeEach(async () => {
    test = await createTestRepository()
  })

  afterEach(() => test.dispose())

  it('loads both sides of each conflict and the lines around them', async () => {
    await conflictOn('app.txt', 'top\nshared\nbottom\n', 'top\nours\nbottom\n', 'top\ntheirs\nbottom\n')

    const conflict = await loadMergeConflict(test.repository, 'app.txt')

    expect(conflict).toMatchObject({
      kind: 'text',
      path: 'app.txt',
      merged: {
        segments: [
          { kind: 'common', lines: ['top'] },
          { kind: 'conflict', ours: ['ours'], base: ['shared'], theirs: ['theirs'] },
          { kind: 'common', lines: ['bottom'] }
        ],
        lineEnding: '\n',
        endsWithLineEnding: true
      }
    })
  })

  it('names the commit and branch on each side', async () => {
    await conflictOn('app.txt', 'shared\n', 'ours\n', 'theirs\n')

    const { sides } = await loadMergeConflict(test.repository, 'app.txt')

    expect(sides).toEqual({
      ours: { sha: await test.git('rev-parse', 'main'), branch: 'main' },
      theirs: { sha: await test.git('rev-parse', 'incoming'), branch: 'incoming' }
    })
  })

  it('ignores conflict markers already written into the working file', async () => {
    await conflictOn('app.txt', 'shared\n', 'ours\n', 'theirs\n')
    await test.write('app.txt', 'half edited by hand\n')

    const conflict = await loadMergeConflict(test.repository, 'app.txt')

    expect(conflict.kind === 'text' && conflict.merged.segments).toEqual([{ kind: 'conflict', ours: ['ours'], base: ['shared'], theirs: ['theirs'] }])
  })

  it('saves the resolved text and stages it, so the merge can be committed', async () => {
    await conflictOn('app.txt', 'shared\n', 'ours\n', 'theirs\n')

    await resolveMergeConflict(test.repository, 'app.txt', 'theirs\nours\n')

    expect(await test.git('show', ':app.txt')).toBe('theirs\nours')
    expect((await test.repository.status()).staged).toEqual([{ path: 'app.txt', oldPath: null, status: 'modified' }])
    await test.git('commit', '-q', '--no-edit')
    expect(await test.git('log', '-1', '--format=%P')).toContain(' ')
  })

  it('offers keeping or deleting a file the other side deleted', async () => {
    await conflictOn('app.txt', 'shared\n', 'changed\n', null)

    expect(await loadMergeConflict(test.repository, 'app.txt')).toMatchObject({
      kind: 'one-sided',
      path: 'app.txt',
      presentIn: 'ours',
      deletedOnOtherSide: true,
      content: 'changed\n'
    })

    await resolveMergeConflict(test.repository, 'app.txt', null)

    expect((await test.repository.status()).staged).toEqual([{ path: 'app.txt', oldPath: null, status: 'deleted' }])
  })

  it('refuses files without a conflict, so no other file can be read or written', async () => {
    await conflictOn('app.txt', 'shared\n', 'ours\n', 'theirs\n')

    await expect(loadMergeConflict(test.repository, 'readme.txt')).rejects.toThrow('readme.txt has no merge conflict')
    await expect(resolveMergeConflict(test.repository, '../outside.txt', 'x')).rejects.toThrow('has no merge conflict')
  })

  it('refuses binary files', async () => {
    await conflictOn('image.bin', 'a\0base', 'a\0ours', 'a\0theirs')

    await expect(loadMergeConflict(test.repository, 'image.bin')).rejects.toThrow('is a binary file')
  })
})
