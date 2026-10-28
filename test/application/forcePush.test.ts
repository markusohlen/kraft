import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { forcePushBranch } from '../../src/application/branchOperations'
import { cloneTestRepository, createTestRepository, type TestRepository } from './gitTestRepository'

describe('force pushing a branch', () => {
  let server: TestRepository
  let local: TestRepository

  beforeEach(async () => {
    server = await createTestRepository()
    // The server has main checked out, which git refuses to push to, so the tests push `shared`.
    await server.git('checkout', '-q', '-b', 'shared')
    await server.commitFile('shared.txt', 'one\n', 'Shared work')
    await server.git('checkout', '-q', 'main')
    local = await cloneTestRepository(server)
    await local.git('checkout', '-q', 'shared')
  })

  afterEach(async () => {
    await local.dispose()
    await server.dispose()
  })

  /** A teammate pushes a commit to `shared`. */
  async function teammatePushes(message: string): Promise<void> {
    await server.git('checkout', '-q', 'shared')
    await server.commitFile('teammate.txt', `${message}\n`, message)
    await server.git('checkout', '-q', 'main')
  }

  it('replaces the upstream with an amended commit', async () => {
    await local.git('commit', '-q', '--amend', '-m', 'Shared work, reworded')
    const amended = await local.git('rev-parse', 'HEAD')

    await forcePushBranch(local.repository, 'shared')

    expect(await server.git('rev-parse', 'shared')).toBe(amended)
    expect(await local.git('rev-parse', 'origin/shared')).toBe(amended)
  })

  it('force pushes a branch that is not checked out', async () => {
    await local.git('commit', '-q', '--amend', '-m', 'Shared work, reworded')
    const amended = await local.git('rev-parse', 'HEAD')
    await local.git('checkout', '-q', 'main')

    await forcePushBranch(local.repository, 'shared')

    expect(await server.git('rev-parse', 'shared')).toBe(amended)
  })

  it('refuses when someone pushed since the last fetch', async () => {
    await teammatePushes('Teammate work')
    const theirs = await server.git('rev-parse', 'shared')
    await local.git('commit', '-q', '--amend', '-m', 'Shared work, reworded')

    await expect(forcePushBranch(local.repository, 'shared')).rejects.toThrow('stale info')
    expect(await server.git('rev-parse', 'shared')).toBe(theirs)
  })

  it('refuses when a fetched commit never made it into the local branch', async () => {
    await teammatePushes('Teammate work')
    const theirs = await server.git('rev-parse', 'shared')
    await local.git('fetch', '-q')
    await local.git('commit', '-q', '--amend', '-m', 'Shared work, reworded')

    await expect(forcePushBranch(local.repository, 'shared')).rejects.toThrow('never on shared')
    expect(await server.git('rev-parse', 'shared')).toBe(theirs)
  })

  it('asks for a normal push first when the branch has no upstream', async () => {
    await local.git('checkout', '-q', '-b', 'fresh')

    await expect(forcePushBranch(local.repository, 'fresh')).rejects.toThrow('has not been pushed yet')
  })
})
