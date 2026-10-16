import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPullRequest } from '../../src/application/pullRequestOperations'
import { runGit } from '../../src/infrastructure/gitCommand'
import { createTestRepository, type TestRepository } from './gitTestRepository'

describe('creating pull requests', () => {
  let test: TestRepository
  let server: string
  const serverGit = async (...args: string[]) => (await runGit(server, args)).stdout.trim()

  beforeEach(async () => {
    test = await createTestRepository()
    server = await mkdtemp(join(tmpdir(), 'kraft-server-'))
    await serverGit('init', '-q', '--bare', '-b', 'main')
    // The URL decides the web page; pushes go to the local bare repository.
    await test.git('remote', 'add', 'origin', 'git@github.com:acme/widgets.git')
    await test.git('config', 'remote.origin.pushurl', server)
    await test.git('push', '-q', '-u', 'origin', 'main')
  })

  afterEach(async () => {
    await test.dispose()
    await rm(server, { recursive: true, force: true, maxRetries: 5 })
  })

  it('publishes a new branch and opens GitHub compare for it', async () => {
    await test.git('checkout', '-q', '-b', 'feature/login')
    await test.commitFile('login.txt', 'login\n', 'Add login')

    const page = await createPullRequest(test.repository, 'feature/login', 'main')

    expect(page).toEqual({
      url: 'https://github.com/acme/widgets/compare/main...feature/login?expand=1',
      service: 'GitHub',
      pushed: true
    })
    expect(await serverGit('rev-parse', 'feature/login')).toBe(await test.git('rev-parse', 'feature/login'))
    expect((await test.repository.branches()).find((branch) => branch.name === 'feature/login')?.upstream).toBe('origin/feature/login')
  })

  it('pushes unpushed commits of a branch that is not checked out to its upstream', async () => {
    await test.git('checkout', '-q', '-b', 'topic')
    await test.git('push', '-q', '-u', 'origin', 'topic:topic-on-server')
    await test.commitFile('topic.txt', 'topic\n', 'Topic work')
    await test.git('checkout', '-q', 'main')

    const page = await createPullRequest(test.repository, 'topic', 'main')

    expect(page.url).toBe('https://github.com/acme/widgets/compare/main...topic-on-server?expand=1')
    expect(page.pushed).toBe(true)
    expect(await serverGit('rev-parse', 'topic-on-server')).toBe(await test.git('rev-parse', 'topic'))
    expect(await test.repository.currentBranch()).toBe('main')
  })

  it('does not push a branch the remote already has', async () => {
    await test.git('checkout', '-q', '-b', 'done')
    await test.commitFile('done.txt', 'done\n', 'Done work')
    await test.git('push', '-q', '-u', 'origin', 'done')

    expect((await createPullRequest(test.repository, 'done', 'main')).pushed).toBe(false)
  })

  it('refuses remotes on unknown hosts before pushing anything', async () => {
    await test.git('remote', 'set-url', 'origin', server)
    await test.git('config', '--unset', 'remote.origin.pushurl')
    await test.git('checkout', '-q', '-b', 'local-only')

    await expect(createPullRequest(test.repository, 'local-only', 'main')).rejects.toThrow('"origin" is not on one of them')
    expect(await serverGit('branch', '--list', 'local-only')).toBe('')
  })

  it('refuses to merge a branch into itself', async () => {
    await expect(createPullRequest(test.repository, 'main', 'main')).rejects.toThrow('cannot be merged into itself')
  })
})
