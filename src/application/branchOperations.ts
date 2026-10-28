import { hasUncommittedChanges } from '../domain/entities'
import { splitRemoteBranch } from '../domain/remoteBranch'
import { autoStashMessages, withAutoStash, type AutoStashResult } from './autoStash'
import type { GitRepository } from './ports'

export async function checkoutBranch(repository: GitRepository, branch: string): Promise<AutoStashResult> {
  if ((await repository.currentBranch()) === branch) return { stashMessage: null }
  return withAutoStash(repository, autoStashMessages.checkout(branch), 'keep', () => repository.checkout(branch))
}

export interface RemoteCheckoutResult extends AutoStashResult {
  /** The local branch that is now checked out. */
  branch: string
  /** How many commits the local branch was moved forward to catch up with the remote branch. */
  fastForwarded: number
  /** Set when both have commits the other lacks; the local branch is then left as it was. */
  diverged: { local: number; remote: number } | null
  /** Why fetching failed; the checkout then used the remote branch as it was last fetched. */
  fetchError: string | null
}

/**
 * Checks out the local branch for a remote branch such as `origin/feature/x`. The branch is fetched
 * first, so commits pushed since the last fetch are included: a missing local branch is created to
 * track it, and a local branch that is behind is fast-forwarded. A local branch with commits of its
 * own is only checked out.
 */
export async function checkoutRemoteBranch(repository: GitRepository, remoteBranch: string): Promise<RemoteCheckoutResult> {
  const name = splitRemoteBranch(remoteBranch, await repository.remotes())
  if (!name) throw new Error(`"${remoteBranch}" is not a remote branch`)
  const fetchError = await repository.fetchBranch(name.remote, name.branch).then(
    () => null,
    (error: unknown) => firstLine(error)
  )
  const branch = name.branch
  const result: RemoteCheckoutResult = { branch, stashMessage: null, fastForwarded: 0, diverged: null, fetchError }

  if (!(await repository.branchExists(branch))) {
    const stash = await withAutoStash(repository, autoStashMessages.checkout(branch), 'keep', () =>
      repository.checkoutTracking(branch, remoteBranch)
    )
    return { ...result, ...stash }
  }
  const { ahead, behind } = await repository.aheadBehind(branch, remoteBranch)
  if (behind === 0 || ahead > 0) {
    const stash = await checkoutBranch(repository, branch)
    return { ...result, ...stash, diverged: behind > 0 ? { local: ahead, remote: behind } : null }
  }
  // Changes made on the checked-out branch stay with it, as for a pull; otherwise they stay stashed, as for a checkout.
  const stash =
    (await repository.currentBranch()) === branch
      ? await withAutoStash(repository, autoStashMessages.pull(branch), 'pop', () => repository.fastForward(remoteBranch))
      : await withAutoStash(repository, autoStashMessages.checkout(branch), 'keep', async () => {
          await repository.checkout(branch)
          await repository.fastForward(remoteBranch)
        })
  return { ...result, ...stash, fastForwarded: behind }
}

export async function createAndCheckoutBranch(
  repository: GitRepository,
  name: string,
  startPoint: string
): Promise<AutoStashResult> {
  const branchName = name.trim()
  if (!branchName) throw new Error('A branch name is required')
  if (await repository.branchExists(branchName)) throw new Error(`Branch "${branchName}" already exists`)
  return withAutoStash(repository, autoStashMessages.checkout(branchName), 'keep', async () => {
    await repository.createBranch(branchName, startPoint)
    await repository.checkout(branchName)
  })
}

export async function deleteBranch(repository: GitRepository, branch: string, force: boolean): Promise<void> {
  if ((await repository.currentBranch()) === branch) {
    throw new Error(`Cannot delete "${branch}" while it is checked out`)
  }
  await repository.deleteBranch(branch, force)
}

export async function mergeIntoCurrent(repository: GitRepository, branch: string): Promise<AutoStashResult> {
  return withAutoStash(repository, autoStashMessages.merge(branch), 'pop', () =>
    repository.merge(branch, { noFastForward: false })
  )
}

export async function rebaseCurrentOnto(repository: GitRepository, onto: string): Promise<AutoStashResult> {
  return withAutoStash(repository, autoStashMessages.rebase(onto), 'pop', () => repository.rebase(onto))
}

/**
 * Commits the changes of `sha` on top of HEAD. A merge commit brings the changes it merged in, compared
 * with its first parent. On conflicts the cherry-pick stays in progress; committing the resolved files
 * finishes it and keeps the original author.
 */
export async function cherryPick(repository: GitRepository, sha: string): Promise<AutoStashResult> {
  const commit = sha.slice(0, 7)
  const mainline = (await repository.commitParents(sha)).length > 1 ? 1 : null
  let alreadyApplied = false
  const result = await withAutoStash(repository, autoStashMessages.cherryPick(commit), 'pop', async () => {
    try {
      await repository.cherryPick(sha, mainline)
    } catch (error) {
      // When HEAD already has the changes git stops with an empty cherry-pick in progress; cancel it so nothing is left behind.
      if (!(await repository.isCherryPickInProgress()) || hasUncommittedChanges(await repository.status())) throw error
      await repository.abortCherryPick()
      alreadyApplied = true
    }
  })
  // Reported after the auto-stash is popped, since nothing changed.
  if (alreadyApplied) throw new Error(`The changes in ${commit} are already on ${(await repository.currentBranch()) ?? 'HEAD'}`)
  return result
}

export async function pullCurrent(repository: GitRepository): Promise<AutoStashResult> {
  const branch = await requireCurrentBranch(repository)
  return withAutoStash(repository, autoStashMessages.pull(branch), 'pop', () => repository.pull())
}

export async function pushCurrent(repository: GitRepository): Promise<void> {
  const branchName = await requireCurrentBranch(repository)
  const branch = (await repository.branches()).find((candidate) => candidate.name === branchName)
  if (branch?.upstream) return repository.push(branchName, null)
  const [remote] = await repository.remotes()
  if (!remote) throw new Error('This repository has no remote to push to')
  await repository.push(branchName, remote)
}

/** Replaces the branch's upstream with it, for history rewritten by amending, rebasing or squashing. */
export async function forcePushBranch(repository: GitRepository, branchName: string): Promise<void> {
  const branch = (await repository.branches()).find((candidate) => candidate.name === branchName)
  if (!branch) throw new Error(`There is no local branch ${branchName}`)
  if (!branch.upstream) throw new Error(`${branchName} has not been pushed yet; push it normally`)
  const target = splitRemoteBranch(branch.upstream, await repository.remotes())
  if (!target) throw new Error(`The upstream ${branch.upstream} of ${branchName} is not on a known remote`)
  const tip = await repository.remoteBranchTip(branch.upstream)
  if (!tip) throw new Error(`${branch.upstream} has not been fetched; fetch before force pushing`)
  // Rewriting history drops the old tip from the branch, but it must have been on the branch once:
  // a tip that never was holds someone else's commits, fetched but not pulled, that would be lost.
  // (git's --force-if-includes checks the same, but fails in fresh clones whose remote branches have no reflog.)
  const seenLocally = (await repository.isAncestor(tip, branchName)) || (await repository.branchReflog(branchName)).includes(tip)
  if (!seenLocally) throw new Error(`${branch.upstream} has commits that were never on ${branchName}; pull them first so the force push does not remove them`)
  await repository.forcePushBranch(branchName, target.remote, target.branch, tip)
}

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.split('\n').find((line) => line.trim()) ?? message
}

export async function requireCurrentBranch(repository: GitRepository): Promise<string> {
  const branch = await repository.currentBranch()
  if (!branch) throw new Error('No branch is checked out (detached HEAD)')
  return branch
}
