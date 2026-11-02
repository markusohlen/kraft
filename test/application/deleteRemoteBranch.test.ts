import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { deleteRemoteBranch } from '../../src/application/branchOperations'
import { cloneTestRepository, createTestRepository, type TestRepository } from './gitTestRepository'

describe('deleting a remote branch', () => {
  let server: TestRepository
  let local: TestRepository

  beforeEach(async () => {
    server = await createTestRepository()
    await server.git('branch', 'feature/shared')
    local = await cloneTestRepository(server)
  })

  afterEach(async () => {
    await local.dispose()
    await server.dispose()
  })

  it('removes the branch from the remote and its remote-tracking branch', async () => {
    await deleteRemoteBranch(local.repository, 'origin/feature/shared')

    expect(await server.repository.branchExists('feature/shared')).toBe(false)
    expect(await local.repository.remoteBranches()).not.toContain('origin/feature/shared')
  })

  it('leaves a local branch of the same name alone', async () => {
    await local.git('branch', 'feature/shared', 'origin/feature/shared')

    await deleteRemoteBranch(local.repository, 'origin/feature/shared')

    expect(await local.repository.branchExists('feature/shared')).toBe(true)
  })

  it('refuses a name that is on no remote', async () => {
    await expect(deleteRemoteBranch(local.repository, 'elsewhere/feature/shared')).rejects.toThrow('is not a remote branch')
    expect(await server.repository.branchExists('feature/shared')).toBe(true)
  })
})
