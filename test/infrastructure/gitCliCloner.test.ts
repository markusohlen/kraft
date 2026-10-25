import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitCliCloner } from '../../src/infrastructure/gitCliCloner'
import { runGit } from '../../src/infrastructure/gitCommand'
import { createTestRepository, type TestRepository } from '../application/gitTestRepository'

describe('GitCliCloner', () => {
  let source: TestRepository
  let parent: string

  beforeEach(async () => {
    source = await createTestRepository()
    await source.commitFile('second.txt', 'two\n', 'Second commit')
    parent = await mkdtemp(join(tmpdir(), 'kraft-clone-parent-'))
  })

  afterEach(async () => {
    await source.dispose()
    await rm(parent, { recursive: true, force: true, maxRetries: 5 })
  })

  it('clones into a new folder inside the chosen one', async () => {
    const path = await new GitCliCloner().clone(source.path, parent, 'copy', { shallow: false, sparse: false })

    expect(path).toBe(join(parent, 'copy'))
    expect((await runGit(path, ['rev-list', '--count', 'HEAD'])).stdout.trim()).toBe('2')
  })

  it('downloads only the latest commit for a shallow clone', async () => {
    // A plain path clones locally, which ignores --depth; file:// goes through the transport like a server would.
    const path = await new GitCliCloner().clone(`file://${source.path.replace(/\\/g, '/')}`, parent, 'shallow', { shallow: true, sparse: false })

    expect((await runGit(path, ['rev-list', '--count', 'HEAD'])).stdout.trim()).toBe('1')
  })

  it('reports git\'s own error when the folder is already taken', async () => {
    const cloner = new GitCliCloner()
    await cloner.clone(source.path, parent, 'copy', { shallow: false, sparse: false })

    await expect(cloner.clone(source.path, parent, 'copy', { shallow: false, sparse: false })).rejects.toThrow('already exists')
  })

  it('refuses a relative parent folder', async () => {
    await expect(new GitCliCloner().clone(source.path, 'relative', 'copy', { shallow: false, sparse: false })).rejects.toThrow('not a full folder path')
  })
})
