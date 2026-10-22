import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planSquash, squashCommits } from '../../src/application/squashOperations'
import { cloneTestRepository, createTestRepository, type TestRepository } from './gitTestRepository'

describe('squash', () => {
  let test: TestRepository
  const clones: TestRepository[] = []

  /** The shas of the last `count` commits, newest first, as the graph would hand them over. */
  const lastCommits = async (count: number) => (await test.git('log', `-${count}`, '--format=%H')).split('\n')

  beforeEach(async () => {
    test = await createTestRepository()
    await test.git('-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', 'commit', '-q', '--allow-empty', '-m', 'Start login')
    await test.commitFile('login.txt', 'form\n', 'Add login form')
    await test.commitFile('login.txt', 'form\nvalidation\n', 'Validate login')
  })

  afterEach(async () => {
    await Promise.all(clones.splice(0).map((clone) => clone.dispose()))
    await test.dispose()
  })

  it('combines the messages oldest first for the user to edit', async () => {
    const plan = await planSquash(test.repository, await lastCommits(3))

    expect(plan).toEqual({ branch: 'main', count: 3, message: 'Start login\n\nAdd login form\n\nValidate login', pushedTo: null })
  })

  it('turns the commits into one with the newest files and the oldest author', async () => {
    const [, , , initial] = await lastCommits(4)

    const result = await squashCommits(test.repository, await lastCommits(3), 'Add login\n\nWith validation')

    expect(await test.git('rev-parse', 'HEAD')).toBe(result.sha)
    expect(await test.git('rev-parse', 'HEAD~1')).toBe(initial)
    expect(await test.git('log', '-1', '--format=%B')).toBe('Add login\n\nWith validation')
    expect(await test.git('log', '-1', '--format=%an <%ae>')).toBe('Ada <ada@example.com>')
    expect(await test.git('show', 'HEAD:login.txt')).toBe('form\nvalidation')
    expect(result.stashMessage).toBeNull()
  })

  it('replays later commits on top of the squashed one', async () => {
    const [newer, older] = await lastCommits(2)
    await test.commitFile('logout.txt', 'logout\n', 'Add logout')

    const result = await squashCommits(test.repository, [newer, older], 'Add login form with validation')

    expect(await test.git('log', '--format=%s', '-3')).toBe('Add logout\nAdd login form with validation\nStart login')
    expect(await test.git('rev-parse', 'HEAD~1')).toBe(result.sha)
    expect(await test.git('show', 'HEAD:logout.txt')).toBe('logout')
  })

  it('stashes uncommitted changes around the squash and pops them back', async () => {
    await test.write('readme.txt', 'local edit\n')

    const result = await squashCommits(test.repository, await lastCommits(2), 'Login')

    expect(result.stashMessage).toBe('Auto stash before squashing 2 commits')
    expect((await test.repository.status()).unstaged.map((change) => change.path)).toEqual(['readme.txt'])
    expect(await test.repository.stashes()).toHaveLength(0)
  })

  it('squashes the root commit', async () => {
    const all = await lastCommits(4)

    await squashCommits(test.repository, all, 'Everything')

    expect(await test.git('rev-list', '--count', 'HEAD')).toBe('1')
    expect(await test.git('show', 'HEAD:login.txt')).toBe('form\nvalidation')
  })

  it('warns when the commits are already on the upstream branch', async () => {
    const clone = await cloneTestRepository(test)
    clones.push(clone)
    const shas = (await clone.git('log', '-2', '--format=%H')).split('\n')

    expect((await planSquash(clone.repository, shas)).pushedTo).toBe('origin/main')
  })

  it('needs a message and leaves the branch alone when it is missing', async () => {
    const head = await test.git('rev-parse', 'HEAD')

    await expect(squashCommits(test.repository, await lastCommits(2), '  ')).rejects.toThrow('A commit message is required')
    expect(await test.git('rev-parse', 'HEAD')).toBe(head)
  })

  it('refuses when no branch is checked out', async () => {
    await test.git('checkout', '-q', '--detach')

    await expect(planSquash(test.repository, await lastCommits(2))).rejects.toThrow('No branch is checked out')
  })
})
