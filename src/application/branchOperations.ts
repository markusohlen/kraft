import { hasUncommittedChanges } from '../domain/entities'
import { autoStashMessages, withAutoStash, type AutoStashResult } from './autoStash'
import type { GitRepository } from './ports'

export async function checkoutBranch(repository: GitRepository, branch: string): Promise<AutoStashResult> {
  if ((await repository.currentBranch()) === branch) return { stashMessage: null }
  return withAutoStash(repository, autoStashMessages.checkout(branch), 'keep', () => repository.checkout(branch))
}

/** Checks out the local branch for `origin/name`, creating a tracking branch when none exists yet. */
export async function checkoutRemoteBranch(repository: GitRepository, remoteBranch: string): Promise<AutoStashResult> {
  const localName = localNameForRemoteBranch(remoteBranch)
  if (await repository.branchExists(localName)) return checkoutBranch(repository, localName)
  return withAutoStash(repository, autoStashMessages.checkout(localName), 'keep', () =>
    repository.checkoutTracking(localName, remoteBranch)
  )
}

export function localNameForRemoteBranch(remoteBranch: string): string {
  const separator = remoteBranch.indexOf('/')
  if (separator === -1) throw new Error(`"${remoteBranch}" is not a remote branch`)
  return remoteBranch.slice(separator + 1)
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

async function requireCurrentBranch(repository: GitRepository): Promise<string> {
  const branch = await repository.currentBranch()
  if (!branch) throw new Error('No branch is checked out (detached HEAD)')
  return branch
}
