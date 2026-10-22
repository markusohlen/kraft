import type { CommitGraph } from '../domain/commitGraph'
import type { DiffOptions } from '../domain/diff'
import type { Branch, FileChange, Stash, WorkingTreeStatus } from '../domain/entities'
import type { GitFlowBranch, GitFlowBranchType, GitFlowConfig } from '../domain/gitFlow'
import type { AutoStashResult } from './autoStash'
import type { RemoteCheckoutResult } from './branchOperations'
import type { FinishGitFlowOptions, FinishGitFlowResult } from './gitFlowOperations'
import type { PullRequestPage } from './pullRequestOperations'
import type { SquashPlan, SquashResult } from './squashOperations'

export interface RepositoryView {
  path: string
  name: string
  currentBranch: string | null
  graph: CommitGraph
  branches: Branch[]
  remoteBranches: string[]
  remotes: string[]
  tags: string[]
  stashes: Stash[]
  status: WorkingTreeStatus
  gitFlow: { config: GitFlowConfig; branches: GitFlowBranch[] } | null
}

export interface CommitDetails {
  sha: string
  message: string
  files: FileChange[]
}

/** The operations the user interface can request. Every call acts on the open repository. */
export interface KraftApi {
  /** Asks for a folder; `title` defaults to opening a repository. */
  chooseRepositoryFolder(title?: string): Promise<string | null>
  openRepository(path: string): Promise<RepositoryView>
  refresh(): Promise<RepositoryView>

  commitDetails(sha: string): Promise<CommitDetails>
  commitFileDiff(sha: string, path: string, options?: DiffOptions): Promise<string>
  workingFileDiff(change: FileChange, staged: boolean, options?: DiffOptions): Promise<string>

  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(changes: FileChange[]): Promise<void>
  commit(message: string): Promise<void>

  checkoutBranch(branch: string): Promise<AutoStashResult>
  /** Fetches the remote branch, then checks out its local branch and fast-forwards it when it is behind. */
  checkoutRemoteBranch(remoteBranch: string): Promise<RemoteCheckoutResult>
  createBranch(name: string, startPoint: string): Promise<AutoStashResult>
  deleteBranch(branch: string, force: boolean): Promise<void>
  mergeIntoCurrent(branch: string): Promise<AutoStashResult>
  rebaseCurrentOnto(onto: string): Promise<AutoStashResult>
  cherryPick(sha: string): Promise<AutoStashResult>
  /** Checks that consecutive commits on the checked-out branch can be squashed, before asking for the message. */
  squashPlan(shas: string[]): Promise<SquashPlan>
  squashCommits(shas: string[], message: string): Promise<SquashResult>

  stash(message: string): Promise<boolean>
  stashPop(index: number): Promise<void>
  stashApply(index: number): Promise<void>
  stashDrop(index: number): Promise<void>

  fetch(): Promise<void>
  pull(): Promise<AutoStashResult>
  push(): Promise<void>
  /** Pushes the branch if needed and returns the page that creates its pull request. */
  createPullRequest(branch: string, targetBranch: string): Promise<PullRequestPage>

  initGitFlow(config: GitFlowConfig): Promise<void>
  startGitFlowBranch(type: GitFlowBranchType, name: string): Promise<AutoStashResult>
  finishGitFlowBranch(branchName: string, options: FinishGitFlowOptions): Promise<FinishGitFlowResult>
}

export type KraftMethod = keyof KraftApi

export const kraftMethods: readonly KraftMethod[] = [
  'chooseRepositoryFolder',
  'openRepository',
  'refresh',
  'commitDetails',
  'commitFileDiff',
  'workingFileDiff',
  'stage',
  'unstage',
  'discard',
  'commit',
  'checkoutBranch',
  'checkoutRemoteBranch',
  'createBranch',
  'deleteBranch',
  'mergeIntoCurrent',
  'rebaseCurrentOnto',
  'cherryPick',
  'squashPlan',
  'squashCommits',
  'stash',
  'stashPop',
  'stashApply',
  'stashDrop',
  'fetch',
  'pull',
  'push',
  'createPullRequest',
  'initGitFlow',
  'startGitFlowBranch',
  'finishGitFlowBranch'
]
