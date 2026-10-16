import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cherryPick } from '../../src/application/branchOperations'
import { createTestRepository, type TestRepository } from './gitTestRepository'

describe('cherry-pick', () => {
  let test: TestRepository

  beforeEach(async () => {
    test = await createTestRepository()
    await test.git('checkout', '-q', '-b', 'other')
    await test.commitFile('fix.txt', 'fix\n', 'Fix bug')
    await test.git('checkout', '-q', 'main')
  })

  afterEach(() => test.dispose())

  it('commits the changes of another branch’s commit on the current branch', async () => {
    await test.commitFile('main.txt', 'main\n', 'Main work')
    const mainBefore = await test.git('rev-parse', 'HEAD')

    const result = await cherryPick(test.repository, await test.git('rev-parse', 'other'))

    expect(result.stashMessage).toBeNull()
    expect(await test.git('log', '-1', '--format=%s')).toBe('Fix bug')
    expect(await test.git('rev-parse', 'HEAD~1')).toBe(mainBefore)
    expect(await test.git('show', 'HEAD:fix.txt')).toBe('fix')
  })

  it('stashes uncommitted changes around the cherry-pick and pops them back', async () => {
    await test.write('readme.txt', 'local edit\n')

    const result = await cherryPick(test.repository, await test.git('rev-parse', 'other'))

    expect(result.stashMessage).toMatch(/^Auto stash before cherry-pick of "[0-9a-f]{7}"$/)
    expect(await test.git('log', '-1', '--format=%s')).toBe('Fix bug')
    expect((await test.repository.status()).unstaged.map((change) => change.path)).toEqual(['readme.txt'])
    expect(await test.repository.stashes()).toHaveLength(0)
  })

  it('picks the changes a merge commit brought in', async () => {
    await test.git('checkout', '-q', '-b', 'release')
    await test.git('merge', '-q', '--no-ff', '-m', 'Merge other', 'other')
    const merge = await test.git('rev-parse', 'HEAD')
    await test.git('checkout', '-q', 'main')

    await cherryPick(test.repository, merge)

    expect(await test.git('show', 'HEAD:fix.txt')).toBe('fix')
    expect(await test.git('log', '-1', '--format=%P')).not.toContain(' ')
  })

  it('reports changes that are already on the branch and leaves nothing in progress', async () => {
    await cherryPick(test.repository, await test.git('rev-parse', 'other'))
    const head = await test.git('rev-parse', 'HEAD')
    await test.write('readme.txt', 'local edit\n')

    await expect(cherryPick(test.repository, await test.git('rev-parse', 'other'))).rejects.toThrow('are already on main')

    expect(await test.git('rev-parse', 'HEAD')).toBe(head)
    expect(await test.repository.isCherryPickInProgress()).toBe(false)
    // Nothing happened, so the auto-stash is back in the working tree.
    expect((await test.repository.status()).unstaged.map((change) => change.path)).toEqual(['readme.txt'])
    expect(await test.repository.stashes()).toHaveLength(0)
  })

  it('stops on conflicts so they can be resolved and committed with the original author', async () => {
    await test.git('checkout', '-q', 'other')
    await test.write('readme.txt', 'theirs\n')
    await test.git('-c', 'user.name=Other Author', 'commit', '-q', '-am', 'Change readme on other')
    await test.git('checkout', '-q', 'main')
    await test.commitFile('readme.txt', 'ours\n', 'Change readme on main')

    await expect(cherryPick(test.repository, await test.git('rev-parse', 'other'))).rejects.toThrow()

    expect(await test.repository.isCherryPickInProgress()).toBe(true)
    expect((await test.repository.status()).unstaged).toEqual([{ path: 'readme.txt', oldPath: null, status: 'conflicted' }])
    await test.write('readme.txt', 'resolved\n')
    await test.repository.stage(['readme.txt'])
    await test.repository.commit('Change readme on other')
    expect(await test.git('log', '-1', '--format=%an')).toBe('Other Author')
    expect(await test.repository.isCherryPickInProgress()).toBe(false)
  })
})
