import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkoutBranch, checkoutRemoteBranch, mergeIntoCurrent } from '../../src/application/branchOperations'
import { hasUncommittedChanges } from '../../src/domain/entities'
import { createTestRepository, type TestRepository } from './gitTestRepository'

describe('branch operations with auto-stash', () => {
  let test: TestRepository

  beforeEach(async () => {
    test = await createTestRepository()
    await test.git('branch', 'other')
  })

  afterEach(() => test.dispose())

  it('stashes uncommitted changes before checking out and leaves the stash for later', async () => {
    await test.write('readme.txt', 'edited\n')
    await test.write('new-file.txt', 'untracked\n')

    const result = await checkoutBranch(test.repository, 'other')

    expect(result.stashMessage).toBe('Auto stash before checking out "other"')
    expect(await test.repository.currentBranch()).toBe('other')
    expect(hasUncommittedChanges(await test.repository.status())).toBe(false)
    const stashes = await test.repository.stashes()
    expect(stashes).toHaveLength(1)
    expect(stashes[0].message).toContain('Auto stash before checking out "other"')
  })

  it('does not stash when the working tree is clean', async () => {
    const result = await checkoutBranch(test.repository, 'other')

    expect(result.stashMessage).toBeNull()
    expect(await test.repository.stashes()).toHaveLength(0)
  })

  it('does nothing when the branch is already checked out', async () => {
    await test.write('readme.txt', 'edited\n')

    const result = await checkoutBranch(test.repository, 'main')

    expect(result.stashMessage).toBeNull()
    expect(hasUncommittedChanges(await test.repository.status())).toBe(true)
  })

  it('stashes around a merge and pops the changes back afterwards', async () => {
    await test.git('checkout', '-q', 'other')
    await test.commitFile('other.txt', 'from other\n', 'Work on other')
    await test.git('checkout', '-q', 'main')
    await test.write('readme.txt', 'local edit\n')

    const result = await mergeIntoCurrent(test.repository, 'other')

    expect(result.stashMessage).toBe('Auto stash before merge of "other"')
    expect(await test.git('log', '-1', '--format=%s')).toBe('Work on other')
    expect((await test.repository.status()).unstaged.map((change) => change.path)).toEqual(['readme.txt'])
    expect(await test.repository.stashes()).toHaveLength(0)
  })

  it('creates a tracking branch when checking out a remote branch', async () => {
    const remote = await createTestRepository()
    try {
      await remote.git('branch', 'shared')
      await test.git('remote', 'add', 'origin', remote.path)
      await test.git('fetch', '-q', 'origin')

      await checkoutRemoteBranch(test.repository, 'origin/shared')

      expect(await test.repository.currentBranch()).toBe('shared')
      expect((await test.repository.branches()).find((branch) => branch.name === 'shared')?.upstream).toBe('origin/shared')
    } finally {
      await remote.dispose()
    }
  })
})
