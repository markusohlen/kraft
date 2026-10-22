import type { DiffOptions } from '../domain/diff'
import type { Branch, Commit, FileChange, Stash, WorkingTreeStatus } from '../domain/entities'

export interface MergeOptions {
  noFastForward: boolean
  message?: string
}

/** A conflicted file's three versions; null where that side has no such file (deleted, or added on one side only). */
export interface ConflictVersions {
  base: string | null
  ours: string | null
  theirs: string | null
}

export interface CommitAuthor {
  name: string
  email: string
  /** ISO 8601. */
  date: string
}

/** Everything the use cases need from a single Git repository. */
export interface GitRepository {
  readonly path: string

  log(limit: number): Promise<Commit[]>
  /** HEAD's first-parent history, newest first; empty before the first commit. */
  firstParentLog(limit: number): Promise<Commit[]>
  commitMessage(sha: string): Promise<string>
  commitParents(sha: string): Promise<string[]>
  commitFiles(sha: string): Promise<FileChange[]>
  commitFileDiff(sha: string, path: string, options: DiffOptions): Promise<string>

  status(): Promise<WorkingTreeStatus>
  workingFileDiff(change: FileChange, staged: boolean, options: DiffOptions): Promise<string>
  stage(paths: string[]): Promise<void>
  unstage(paths: string[]): Promise<void>
  discard(changes: FileChange[]): Promise<void>
  /** Removes files from the working tree and the index, as `git rm` does. */
  remove(paths: string[]): Promise<void>
  /** Overwrites a file in the working tree. */
  writeWorkingFile(path: string, content: string): Promise<void>
  conflictVersions(path: string): Promise<ConflictVersions>
  /** HEAD's commit; null before the first commit. */
  headCommit(): Promise<string | null>
  /** The commit being merged, cherry-picked, reverted or rebased that stopped on conflicts; null when none is. */
  incomingCommit(): Promise<string | null>
  /** A local branch `sha` is on, preferring one whose tip it is; null when no branch has it. */
  branchContaining(sha: string): Promise<string | null>
  /**
   * Merges three versions of a text as git would, leaving conflict markers of `markerSize` characters where
   * they clash, with the base version of each conflict between the two sides (the `diff3` style).
   */
  mergeTexts(base: string, ours: string, theirs: string, markerSize: number): Promise<string>
  commit(message: string): Promise<void>
  /**
   * Creates a commit holding the files of `treeOf`, without moving any branch or touching the working
   * tree, and returns its sha. `parent` null makes it a root commit.
   */
  commitTree(treeOf: string, parent: string | null, message: string, author: CommitAuthor): Promise<string>

  currentBranch(): Promise<string | null>
  branches(): Promise<Branch[]>
  remoteBranches(): Promise<string[]>
  remotes(): Promise<string[]>
  tags(): Promise<string[]>
  branchExists(name: string): Promise<boolean>
  checkout(branch: string): Promise<void>
  checkoutTracking(localName: string, remoteBranch: string): Promise<void>
  /** Commits only `branch` has (`ahead`) and only `other` has (`behind`). */
  aheadBehind(branch: string, other: string): Promise<{ ahead: number; behind: number }>
  /** Moves the checked-out branch forward to `target`; fails unless that is a fast-forward. */
  fastForward(target: string): Promise<void>
  createBranch(name: string, startPoint: string): Promise<void>
  deleteBranch(name: string, force: boolean): Promise<void>
  merge(branch: string, options: MergeOptions): Promise<void>
  rebase(onto: string): Promise<void>
  /** Replays the checked-out branch's commits after `upstream` onto `newBase`. */
  rebaseOnto(newBase: string, upstream: string): Promise<void>
  /** Whether `ancestor` is reachable from `descendant`. */
  isAncestor(ancestor: string, descendant: string): Promise<boolean>
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
  /** Fetches one branch, updating its remote-tracking branch. */
  fetchBranch(remote: string, branch: string): Promise<void>
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
