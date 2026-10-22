import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkoutRemoteBranch } from '../../src/application/branchOperations'
import { cloneTestRepository, createTestRepository, type TestRepository } from './gitTestRepository'

describe('checking out a remote branch', () => {
  let server: TestRepository
  let local: TestRepository

  beforeEach(async () => {
    server = await createTestRepository()
    await server.git('checkout', '-q', '-b', 'shared')
    await server.commitFile('shared.txt', 'one\n', 'Shared work')
    await server.git('checkout', '-q', 'main')
    local = await cloneTestRepository(server)
  })

  afterEach(async () => {
    await local.dispose()
    await server.dispose()
  })

  /** A teammate pushes a commit to `shared` that the local repository has not fetched yet. */
  async function pushToShared(file: string, message: string): Promise<string> {
    await server.git('checkout', '-q', 'shared')
    await server.commitFile(file, `${message}\n`, message)
    await server.git('checkout', '-q', 'main')
    return server.git('rev-parse', 'shared')
  }

  it('fetches first, so a new local branch starts at commits pushed since the last fetch', async () => {
    const newest = await pushToShared('later.txt', 'Later work')

    const result = await checkoutRemoteBranch(local.repository, 'origin/shared')

    expect(result).toEqual({ branch: 'shared', stashMessage: null, fastForwarded: 0, diverged: null, fetchError: null })
    expect(await local.repository.currentBranch()).toBe('shared')
    expect(await local.git('rev-parse', 'HEAD')).toBe(newest)
    expect((await local.repository.branches()).find((branch) => branch.name === 'shared')?.upstream).toBe('origin/shared')
  })

  it('fast-forwards an existing local branch that is behind', async () => {
    await local.git('checkout', '-q', 'shared')
    await local.git('checkout', '-q', 'main')
    await pushToShared('a.txt', 'First new commit')
    const newest = await pushToShared('b.txt', 'Second new commit')

    const result = await checkoutRemoteBranch(local.repository, 'origin/shared')

    expect(result.fastForwarded).toBe(2)
    expect(await local.repository.currentBranch()).toBe('shared')
    expect(await local.git('rev-parse', 'HEAD')).toBe(newest)
  })

  it('fast-forwards the checked-out branch and keeps uncommitted changes on it', async () => {
    await local.git('checkout', '-q', 'shared')
    await local.write('readme.txt', 'local edit\n')
    const newest = await pushToShared('later.txt', 'Later work')

    const result = await checkoutRemoteBranch(local.repository, 'origin/shared')

    expect(result.fastForwarded).toBe(1)
    expect(result.stashMessage).toBe('Auto stash before pull of "shared"')
    expect(await local.git('rev-parse', 'HEAD')).toBe(newest)
    expect((await local.repository.status()).unstaged.map((change) => change.path)).toEqual(['readme.txt'])
    expect(await local.repository.stashes()).toHaveLength(0)
  })

  it('only checks out a local branch that has commits of its own', async () => {
    await local.git('checkout', '-q', 'shared')
    await local.commitFile('mine.txt', 'mine\n', 'My work')
    const mine = await local.git('rev-parse', 'HEAD')
    await local.git('checkout', '-q', 'main')

    const ahead = await checkoutRemoteBranch(local.repository, 'origin/shared')
    expect(ahead.diverged).toBeNull()
    expect(await local.git('rev-parse', 'HEAD')).toBe(mine)

    await local.git('checkout', '-q', 'main')
    await pushToShared('theirs.txt', 'Their work')
    const diverged = await checkoutRemoteBranch(local.repository, 'origin/shared')

    expect(diverged).toMatchObject({ fastForwarded: 0, diverged: { local: 1, remote: 1 } })
    expect(await local.repository.currentBranch()).toBe('shared')
    expect(await local.git('rev-parse', 'HEAD')).toBe(mine)
  })

  it('still checks out what was last fetched when fetching fails', async () => {
    const lastFetched = await local.git('rev-parse', 'origin/shared')
    await local.git('remote', 'set-url', 'origin', `${server.path}-gone`)

    const result = await checkoutRemoteBranch(local.repository, 'origin/shared')

    expect(result.fetchError).toMatch(/\S/)
    expect(result.fetchError).not.toContain('\n')
    expect(await local.repository.currentBranch()).toBe('shared')
    expect(await local.git('rev-parse', 'HEAD')).toBe(lastFetched)
  })
})
