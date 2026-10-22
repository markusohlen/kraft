import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestRepository, type TestRepository } from '../application/gitTestRepository'

/**
 * Guards against git option injection: values such as `--output=<path>` or `--upload-pack=<cmd>` must be
 * treated as data (a bad ref), never as git options that could write files or run commands.
 */
describe('GitCliRepository option-injection hardening', () => {
  let repo: TestRepository

  beforeEach(async () => {
    repo = await createTestRepository()
  })
  afterEach(() => repo.dispose())

  it('rejects a non-hex commit id instead of passing it to git', async () => {
    await expect(repo.repository.commitMessage('--output=pwned.txt')).rejects.toThrow('not a valid commit id')
    await expect(repo.repository.commitFileDiff('--output=pwned.txt', 'readme.txt', { fullFile: false })).rejects.toThrow(
      'not a valid commit id'
    )
    await expect(repo.repository.cherryPick('--output=pwned.txt', null)).rejects.toThrow('not a valid commit id')
    const author = { name: 'A', email: 'a@x', date: '2026-01-01T00:00:00Z' }
    await expect(repo.repository.commitTree('--output=pwned.txt', null, 'm', author)).rejects.toThrow('not a valid commit id')
    await expect(repo.repository.rebaseOnto('abc1234', '--output=pwned.txt')).rejects.toThrow('not a valid commit id')
  })

  it('rejects an option-like branch or ref name', async () => {
    await expect(repo.repository.checkout('--output=pwned.txt')).rejects.toThrow('not a valid branch or ref name')
    await expect(repo.repository.checkoutTracking('--foo', 'origin/x')).rejects.toThrow('not a valid branch or ref name')
    await expect(repo.repository.aheadBehind('--output=pwned.txt', 'main')).rejects.toThrow('not a valid branch or ref name')
  })

  it('passes an option-like merge target to git as data, not as an option', async () => {
    // `--end-of-options` makes git try to resolve `--output=…` as a ref and fail, rather than act on an option.
    for (const merge of [
      () => repo.repository.merge('--output=pwned.txt', { noFastForward: false }),
      () => repo.repository.fastForward('--output=pwned.txt')
    ]) {
      const error = await merge().catch((e: Error) => e)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).not.toContain('not a valid')
    }
  })

  it('does not run an upload-pack command passed as the remote to fetch', async () => {
    const marker = join(repo.path, 'upload-pack-marker.txt')

    await expect(repo.repository.fetchBranch(`--upload-pack=echo pwned > "${marker}"`, 'main')).rejects.toThrow()

    await expect(access(marker)).rejects.toThrow()
  })

  it('rejects a non-integer stash index', async () => {
    await expect(repo.repository.stashPop(-1)).rejects.toThrow('not a valid stash index')
    await expect(repo.repository.stashDrop(1.5)).rejects.toThrow('not a valid stash index')
  })

  it('does not run a command named by the repository config when reading status', async () => {
    await repo.git('config', 'core.fsmonitor', 'echo pwned > fsmonitor-marker.txt')

    await repo.repository.status()

    await expect(access(join(repo.path, 'fsmonitor-marker.txt'))).rejects.toThrow()
  })

  it('shows git’s own diff rather than running an external diff command from the repository config', async () => {
    await repo.commitFile('readme.txt', 'changed\n', 'Change readme')
    await repo.git('config', 'diff.external', 'echo pwned > external-diff-marker.txt;')
    const sha = await repo.git('rev-parse', 'HEAD')

    const diff = await repo.repository.commitFileDiff(sha, 'readme.txt', { fullFile: false })

    expect(diff).toContain('+changed')
    await expect(access(join(repo.path, 'external-diff-marker.txt'))).rejects.toThrow()
  })

  it('refuses to write a working file outside the repository', async () => {
    for (const path of ['../outside.txt', join(repo.path, '..', 'outside.txt'), '']) {
      await expect(repo.repository.writeWorkingFile(path, 'x')).rejects.toThrow('is not inside the repository')
    }
    await expect(access(join(repo.path, '..', 'outside.txt'))).rejects.toThrow()
  })

  it('still works for ordinary refs and commits', async () => {
    const [sha] = (await repo.git('rev-parse', 'HEAD')).split('\n')
    expect(await repo.repository.commitMessage(sha)).toBe('Initial commit')

    await repo.repository.createBranch('feature', 'main')
    await repo.repository.checkout('feature')
    expect(await repo.repository.currentBranch()).toBe('feature')
  })
})
