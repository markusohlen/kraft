import { hostedRepositoryFor, hostingServiceNames, pullRequestSource, pullRequestUrl } from '../domain/pullRequest'
import type { GitRepository } from './ports'

export interface PullRequestPage {
  /** The hosting service's page that creates the pull request, to open in the browser. */
  url: string
  /** The hosting service's name, e.g. GitHub. */
  service: string
  /** True when the branch had to be pushed first. */
  pushed: boolean
}

/**
 * Prepares a pull request from a local branch into `targetBranch` on the same remote: pushes the branch
 * when the remote does not have all of it, then returns the hosting service's page that creates the
 * pull request, where the title, description and reviewers are filled in.
 */
export async function createPullRequest(repository: GitRepository, branchName: string, targetBranch: string): Promise<PullRequestPage> {
  const [branches, remotes, remoteBranches] = await Promise.all([repository.branches(), repository.remotes(), repository.remoteBranches()])
  const branch = branches.find((candidate) => candidate.name === branchName)
  if (!branch) throw new Error(`Branch "${branchName}" does not exist`)
  const source = pullRequestSource(branch, remotes, remoteBranches)
  if (!source) throw new Error('This repository has no remote to open a pull request on')
  const target = targetBranch.trim()
  if (!target) throw new Error('Choose the branch to merge into')
  if (target === source.branch) throw new Error(`${branchName} cannot be merged into itself`)

  // Checked before pushing, so a remote Kraft cannot open pull requests on is not pushed to for nothing.
  const hosted = hostedRepositoryFor(await repository.remoteUrl(source.remote))
  if (!hosted) {
    throw new Error(`Kraft opens pull requests on GitHub, GitLab, Bitbucket and Azure DevOps, and "${source.remote}" is not on one of them`)
  }
  if (source.push === 'publish') await repository.push(branch.name, source.remote)
  if (source.push === 'update') await repository.pushBranch(branch.name, source.remote, source.branch)
  return { url: pullRequestUrl(hosted, source.branch, target), service: hostingServiceNames[hosted.service], pushed: source.push !== null }
}
