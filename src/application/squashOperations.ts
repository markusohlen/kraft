import { findSquashRange, type SquashRange } from '../domain/squash'
import { autoStashMessages, withAutoStash, type AutoStashResult } from './autoStash'
import { requireCurrentBranch } from './branchOperations'
import type { GitRepository } from './ports'

/** How far down the branch selected commits are looked for; matches how many commits the graph shows. */
const squashSearchLimit = 1500

export interface SquashPlan {
  /** The checked-out branch the commits are squashed on. */
  branch: string
  count: number
  /** The squashed commits' messages, oldest first, as the starting point for the new message. */
  message: string
  /** The upstream branch when some of the rewritten commits are already on it, so a force-push is needed. */
  pushedTo: string | null
}

export interface SquashResult extends AutoStashResult {
  /** The commit the selected commits became. */
  sha: string
}

/** Checks that the commits can be squashed and prepares what the user confirms. */
export async function planSquash(repository: GitRepository, shas: readonly string[]): Promise<SquashPlan> {
  const branch = await requireCurrentBranch(repository)
  const range = await squashRange(repository, shas)
  const messages = await Promise.all(range.commits.map((commit) => repository.commitMessage(commit.sha)))
  return { branch, count: range.commits.length, message: messages.join('\n\n'), pushedTo: await pushedTo(repository, branch, range) }
}

/**
 * Replaces the commits with one commit that has the newest one's files and the oldest one's author,
 * as `git rebase -i` does for "squash". Commits made after them are replayed on top; uncommitted
 * changes are stashed around it and popped back.
 */
export async function squashCommits(repository: GitRepository, shas: readonly string[], message: string): Promise<SquashResult> {
  if (!message.trim()) throw new Error('A commit message is required')
  await requireCurrentBranch(repository)
  const { commits, oldest, newest, base } = await squashRange(repository, shas)
  let sha = ''
  const stash = await withAutoStash(repository, autoStashMessages.squash(commits.length), 'pop', async () => {
    const author = { name: oldest.authorName, email: oldest.authorEmail, date: oldest.date }
    sha = await repository.commitTree(newest.sha, base, message.trim(), author)
    await repository.rebaseOnto(sha, newest.sha)
  })
  return { ...stash, sha }
}

async function squashRange(repository: GitRepository, shas: readonly string[]): Promise<SquashRange> {
  return findSquashRange(await repository.firstParentLog(squashSearchLimit), shas)
}

async function pushedTo(repository: GitRepository, branch: string, range: SquashRange): Promise<string | null> {
  const upstream = (await repository.branches()).find((candidate) => candidate.name === branch)?.upstream
  return upstream && (await repository.isAncestor(range.oldest.sha, upstream)) ? upstream : null
}
