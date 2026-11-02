import type { CommitGraph } from '../domain/commitGraph'
import type { DiffOptions } from '../domain/diff'
import type { Branch, FileChange, Stash, WorkingTreeStatus } from '../domain/entities'
import type { GitFlowBranch, GitFlowBranchType, GitFlowConfig } from '../domain/gitFlow'
import type { AutoStashResult } from './autoStash'
import type { RemoteCheckoutResult } from './branchOperations'
import type { MergeConflict } from './conflictOperations'
import type { LineChangeRequest } from './lineOperations'
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
  stashDetails(sha: string): Promise<CommitDetails>
  stashFileDiff(sha: string, change: FileChange, options?: DiffOptions): Promise<string>
  workingFileDiff(change: FileChange, staged: boolean, options?: DiffOptions): Promise<string>

  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(changes: FileChange[]): Promise<void>
  /** Stages, unstages or discards single changed lines of a modified file; refuses when the file changed since shownDiff. */
  changeLines(request: LineChangeRequest): Promise<void>
  commit(message: string): Promise<void>
  /** The full message of HEAD's commit, to edit when amending; null before the first commit. */
  headCommitMessage(): Promise<string | null>
  /** Replaces the last commit with one holding its changes plus the staged ones; nothing staged only rewords it. */
  amendCommit(message: string): Promise<void>
  mergeConflict(path: string): Promise<MergeConflict>
  /** Saves and stages a conflicted file's resolved text; `null` resolves it by deleting the file. */
  resolveMergeConflict(path: string, content: string | null): Promise<void>

  checkoutBranch(branch: string): Promise<AutoStashResult>
  /** Fetches the remote branch, then checks out its local branch and fast-forwards it when it is behind. */
  checkoutRemoteBranch(remoteBranch: string): Promise<RemoteCheckoutResult>
  createBranch(name: string, startPoint: string): Promise<AutoStashResult>
  deleteBranch(branch: string, force: boolean): Promise<void>
  /** Deletes a branch such as `origin/feature/x` from its remote, for everyone. */
  deleteRemoteBranch(remoteBranch: string): Promise<void>
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
  /** Fetches without the user having asked: never prompts for credentials. Only one runs at a time. */
  fetchInBackground(): Promise<void>
  pull(): Promise<AutoStashResult>
  push(): Promise<void>
  /** Replaces a local branch's upstream with it, refusing when that would drop commits not seen locally. */
  forcePush(branch: string): Promise<void>
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
  'stashDetails',
  'stashFileDiff',
  'workingFileDiff',
  'stage',
  'unstage',
  'discard',
  'changeLines',
  'commit',
  'headCommitMessage',
  'amendCommit',
  'mergeConflict',
  'resolveMergeConflict',
  'checkoutBranch',
  'checkoutRemoteBranch',
  'createBranch',
  'deleteBranch',
  'deleteRemoteBranch',
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
  'fetchInBackground',
  'pull',
  'push',
  'forcePush',
  'createPullRequest',
  'initGitFlow',
  'startGitFlowBranch',
  'finishGitFlowBranch'
]
