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
  const stashed = hasUncommittedChanges(await repository.status()) && (await repository.stashPush(message))
  await operation()
  if (stashed && restore === 'pop') await repository.stashPop(0)
  return { stashMessage: stashed ? message : null }
}

export const autoStashMessages = {
  checkout: (branch: string) => `Auto stash before checking out "${branch}"`,
  merge: (branch: string) => `Auto stash before merge of "${branch}"`,
  rebase: (onto: string) => `Auto stash before rebase onto "${onto}"`,
  cherryPick: (commit: string) => `Auto stash before cherry-pick of "${commit}"`,
  pull: (branch: string) => `Auto stash before pull of "${branch}"`,
  squash: (count: number) => `Auto stash before squashing ${count} commits`
}
