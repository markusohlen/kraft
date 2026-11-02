import { hasUncommittedChanges } from '../domain/entities'
import type { GitRepository } from './ports'

export type AutoStashRestore = 'keep' | 'pop'

export interface AutoStashResult {
  /** The stash message when changes were stashed; null when the working tree was clean. */
  stashMessage: string | null
}

/**
 * Stashes uncommitted changes before `operation` so it runs on a clean working tree.
 * A checkout keeps the stash (the changes belong to the previous branch); merges and
 * rebases pop it back once the operation succeeds. If the operation fails the stash is
 * left in place so no work is lost.
 */
export async function withAutoStash(
  repository: GitRepository,
  message: string,
  restore: AutoStashRestore,
  operation: () => Promise<void>
): Promise<AutoStashResult> {
  const stashed = await stashChanges(repository, message)
  await operation()
  if (stashed && restore === 'pop') await repository.stashPop(0)
  return { stashMessage: stashed ? message : null }
}

/**
 * A staged edit that was undone in the working tree counts as uncommitted, but popping its stash would
 * restore no file, so such a stash is not kept. Returns whether a stash was kept.
 */
async function stashChanges(repository: GitRepository, message: string): Promise<boolean> {
  if (!hasUncommittedChanges(await repository.status()) || !(await repository.stashPush(message))) return false
  const [newest] = await repository.stashes()
  const [files, untracked] = await Promise.all([repository.commitFiles(newest.sha), repository.stashUntrackedFiles(newest.sha)])
  if (files.length > 0 || untracked.length > 0) return true
  await repository.stashDrop(newest.index)
  return false
}

export const autoStashMessages = {
  checkout: (branch: string) => `Auto stash before checking out "${branch}"`,
  merge: (branch: string) => `Auto stash before merge of "${branch}"`,
  rebase: (onto: string) => `Auto stash before rebase onto "${onto}"`,
  cherryPick: (commit: string) => `Auto stash before cherry-pick of "${commit}"`,
  pull: (branch: string) => `Auto stash before pull of "${branch}"`,
  squash: (count: number) => `Auto stash before squashing ${count} commits`
}
