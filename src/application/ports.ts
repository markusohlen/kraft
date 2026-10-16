import type { DiffOptions } from '../domain/diff'
import type { Branch, Commit, FileChange, Stash, WorkingTreeStatus } from '../domain/entities'

export interface MergeOptions {
  noFastForward: boolean
  message?: string
}

/** Everything the use cases need from a single Git repository. */
export interface GitRepository {
  readonly path: string

  log(limit: number): Promise<Commit[]>
  commitMessage(sha: string): Promise<string>
  commitParents(sha: string): Promise<string[]>
  commitFiles(sha: string): Promise<FileChange[]>
  commitFileDiff(sha: string, path: string, options: DiffOptions): Promise<string>

  status(): Promise<WorkingTreeStatus>
  workingFileDiff(change: FileChange, staged: boolean, options: DiffOptions): Promise<string>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(changes: FileChange[]): Promise<void>
  commit(message: string): Promise<void>

  currentBranch(): Promise<string | null>
  branches(): Promise<Branch[]>
  remoteBranches(): Promise<string[]>
  remotes(): Promise<string[]>
  tags(): Promise<string[]>
  branchExists(name: string): Promise<boolean>
  checkout(branch: string): Promise<void>
  checkoutTracking(localName: string, remoteBranch: string): Promise<void>
  createBranch(name: string, startPoint: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>
  merge(branch: string, options: MergeOptions): Promise<void>
  rebase(onto: string): Promise<void>
  /** Commits the changes of `sha` on HEAD; `mainline` is the parent number a merge commit is compared with. */
  cherryPick(sha: string, mainline: number | null): Promise<void>
  isCherryPickInProgress(): Promise<boolean>
  abortCherryPick(): Promise<void>
  createTag(name: string, message: string): Promise<void>

  stashes(): Promise<Stash[]>
  /** Stashes staged, unstaged and untracked changes. Returns false when there was nothing to stash. */
  stashPush(message: string): Promise<boolean>
  stashPop(index: number): Promise<void>
  stashApply(index: number): Promise<void>
  stashDrop(index: number): Promise<void>

  fetch(): Promise<void>
  pull(): Promise<void>
  push(branch: string, setUpstreamRemote: string | null): Promise<void>
  /** Pushes a local branch, checked out or not, to `remoteBranch` on `remote` without changing its upstream. */
  pushBranch(branch: string, remote: string, remoteBranch: string): Promise<void>
  /** The URL the remote fetches from, with `insteadOf` rewrites applied. */
  remoteUrl(remote: string): Promise<string>

  getConfig(key: string): Promise<string | null>
  setConfig(key: string, value: string): Promise<void>
}

export interface GitRepositoryFactory {
  /** Opens the repository containing `path`, failing if it is not inside a Git working tree. */
  open(path: string): Promise<GitRepository>
}
