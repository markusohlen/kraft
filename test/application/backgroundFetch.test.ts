import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KraftService } from '../../src/application/kraftService'
import { GitCliRepositoryFactory } from '../../src/infrastructure/gitCliRepository'
import { cloneTestRepository, createTestRepository, type TestRepository } from './gitTestRepository'

const noSavedRepositories = { remember: async () => {} }
const noFolderPicker = { chooseFolder: async () => null }

describe('fetching in the background', () => {
  let origin: TestRepository
  let test: TestRepository
  let service: KraftService

  beforeEach(async () => {
    origin = await createTestRepository()
    test = await cloneTestRepository(origin)
    service = new KraftService(new GitCliRepositoryFactory(), noSavedRepositories, noFolderPicker)
    await service.openRepository(test.path)
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await test.dispose()
    await origin.dispose()
  })

  /** A service whose repository has its methods replaced, to control when they finish. */
  async function serviceWithSpiedRepository() {
    const repository = await new GitCliRepositoryFactory().open(test.path)
    const spied = new KraftService({ open: async () => repository }, noSavedRepositories, noFolderPicker)
    await spied.openRepository(test.path)
    return { repository, spied }
  }

  it('brings in branches someone else pushed and prunes deleted ones', async () => {
    await origin.git('branch', 'gone')
    await test.git('fetch', '-q')
    await origin.git('branch', '-D', 'gone')
    await origin.git('branch', 'pushed-elsewhere')

    await service.fetchInBackground()

    const { remoteBranches } = await service.refresh()
    expect(remoteBranches).toContain('origin/pushed-elsewhere')
    expect(remoteBranches).not.toContain('origin/gone')
  })

  it('leaves FETCH_HEAD to the `git pull` that may be reading it', async () => {
    await test.git('fetch', '-q', 'origin', 'main')
    const before = await test.git('rev-parse', 'FETCH_HEAD')
    await origin.commitFile('more.txt', 'more\n', 'More')

    await service.fetchInBackground()

    expect(await test.git('rev-parse', 'origin/main')).not.toBe(before)
    expect(await test.git('rev-parse', 'FETCH_HEAD')).toBe(before)
  })

  it('leaves the checked-out branch and the working tree alone', async () => {
    await test.write('readme.txt', 'my changes\n')
    const head = await test.git('rev-parse', 'HEAD')
    await origin.commitFile('more.txt', 'more\n', 'More')

    await service.fetchInBackground()

    expect(await test.git('rev-parse', 'HEAD')).toBe(head)
    expect(await test.git('status', '--porcelain')).toBe('M readme.txt')
  })

  it('rejects with the reason when a remote cannot be reached', async () => {
    await test.git('remote', 'set-url', 'origin', join(origin.path, 'missing'))

    await expect(service.fetchInBackground()).rejects.toThrow(/missing|does not appear/)
  })

  it('makes a fetch by hand wait for it, so the two do not collide on a ref lock', async () => {
    const events: string[] = []
    let finish = () => {}
    const { repository, spied } = await serviceWithSpiedRepository()
    vi.spyOn(repository, 'fetchInBackground').mockImplementation(async () => {
      await new Promise<void>((resolve) => (finish = resolve))
      events.push('background fetch done')
    })
    vi.spyOn(repository, 'fetch').mockImplementation(async () => void events.push('fetch by hand'))

    const background = spied.fetchInBackground()
    const byHand = spied.fetch()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(events).toEqual([])

    finish()
    await Promise.all([background, byHand])
    expect(events).toEqual(['background fetch done', 'fetch by hand'])
  })

  it('does not let a failed background fetch fail what waited for it', async () => {
    const { repository, spied } = await serviceWithSpiedRepository()
    vi.spyOn(repository, 'fetchInBackground').mockRejectedValue(new Error('offline'))
    const fetchByHand = vi.spyOn(repository, 'fetch').mockResolvedValue()

    const background = spied.fetchInBackground()
    await spied.fetch()

    await expect(background).rejects.toThrow('offline')
    expect(fetchByHand).toHaveBeenCalledOnce()
  })

  it('runs one at a time', async () => {
    const { repository, spied } = await serviceWithSpiedRepository()
    const fetch = vi.spyOn(repository, 'fetchInBackground').mockResolvedValue()

    await Promise.all([spied.fetchInBackground(), spied.fetchInBackground()])
    expect(fetch).toHaveBeenCalledOnce()

    await spied.fetchInBackground()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('still refuses a force push over commits it brought in', async () => {
    await test.commitFile('mine.txt', 'mine\n', 'Mine')
    await test.git('push', '-q', 'origin', 'HEAD:refs/heads/feature')
    await test.git('branch', '--set-upstream-to=origin/feature')
    await test.git('fetch', '-q')
    const other = await cloneTestRepository(origin)
    await other.git('checkout', '-q', 'feature')
    await other.commitFile('theirs.txt', 'theirs\n', 'Theirs')
    await other.git('push', '-q', 'origin', 'feature')
    await other.dispose()
    await test.git('commit', '-q', '--amend', '-m', 'Mine, reworded')

    await service.fetchInBackground()

    await expect(service.forcePush(await test.git('branch', '--show-current'))).rejects.toThrow(/never on/)
  })
})
