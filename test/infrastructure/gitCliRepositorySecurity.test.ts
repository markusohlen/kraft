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
  })

  it('rejects an option-like branch or ref name', async () => {
    await expect(repo.repository.checkout('--output=pwned.txt')).rejects.toThrow('not a valid branch or ref name')
    await expect(repo.repository.checkoutTracking('--foo', 'origin/x')).rejects.toThrow('not a valid branch or ref name')
  })

  it('passes an option-like merge target to git as data, not as an option', async () => {
    // `--end-of-options` makes git try to resolve `--output=…` as a ref and fail, rather than act on an option.
    const error = await repo.repository.merge('--output=pwned.txt', { noFastForward: false }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain('not a valid')
  })

  it('rejects a non-integer stash index', async () => {
    await expect(repo.repository.stashPop(-1)).rejects.toThrow('not a valid stash index')
    await expect(repo.repository.stashDrop(1.5)).rejects.toThrow('not a valid stash index')
  })

  it('still works for ordinary refs and commits', async () => {
    const [sha] = (await repo.git('rev-parse', 'HEAD')).split('\n')
    expect(await repo.repository.commitMessage(sha)).toBe('Initial commit')

    await repo.repository.createBranch('feature', 'main')
    await repo.repository.checkout('feature')
    expect(await repo.repository.currentBranch()).toBe('feature')
  })
})
