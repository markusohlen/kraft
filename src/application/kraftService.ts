import { layoutCommitGraph } from '../domain/commitGraph'
import { defaultDiffOptions, type DiffOptions } from '../domain/diff'
import { hasUncommittedChanges, type Commit, type FileChange } from '../domain/entities'
import type { GitFlowBranchType, GitFlowConfig } from '../domain/gitFlow'
import {
  checkoutBranch,
  checkoutRemoteBranch,
  cherryPick,
  createAndCheckoutBranch,
  deleteBranch,
  mergeIntoCurrent,
  pullCurrent,
  pushCurrent,
  rebaseCurrentOnto
} from './branchOperations'
import {
  finishGitFlowBranch,
  initGitFlow,
  listGitFlowBranches,
  readGitFlowConfig,
  startGitFlowBranch,
  type FinishGitFlowOptions
} from './gitFlowOperations'
import type { CommitDetails, KraftApi, RepositoryView } from './kraftApi'
import type { GitRepository, GitRepositoryFactory } from './ports'
import { createPullRequest } from './pullRequestOperations'
import { planSquash, squashCommits } from './squashOperations'

/** How many commits the graph shows; enough for daily work while keeping the view fast. */
const graphCommitLimit = 1500

/** Remembers every repository that is opened, so it gets a tab. */
export interface SavedRepositories {
  remember(path: string): Promise<void>
}

export interface FolderPicker {
  /** Asks the user for a folder; `title` says what it is for. */
  chooseFolder(title: string): Promise<string | null>
}

const openRepositoryTitle = 'Open repository'

export class KraftService implements KraftApi {
  private repository: GitRepository | null = null

  constructor(
    private readonly repositories: GitRepositoryFactory,
    private readonly saved: SavedRepositories,
    private readonly folderPicker: FolderPicker
  ) {}

  chooseRepositoryFolder(title = openRepositoryTitle): Promise<string | null> {
    return this.folderPicker.chooseFolder(title)
  }

  async openRepository(path: string): Promise<RepositoryView> {
    this.repository = await this.repositories.open(path)
    await this.saved.remember(this.repository.path)
    return this.refresh()
  }

  async refresh(): Promise<RepositoryView> {
    const repository = this.requireRepository()
    const [commits, currentBranch, branches, remoteBranches, remotes, tags, stashes, status, gitFlowConfig] = await Promise.all([
      repository.log(graphCommitLimit),
      repository.currentBranch(),
      repository.branches(),
      repository.remoteBranches(),
      repository.remotes(),
      repository.tags(),
      repository.stashes(),
      repository.status(),
      readGitFlowConfig(repository)
    ])
    return {
      path: repository.path,
      name: repositoryName(repository.path),
      currentBranch,
      graph: layoutCommitGraph(commits, {
        stashes,
        workInProgress: hasUncommittedChanges(status) ? { baseSha: headSha(commits) } : undefined
      }),
      branches,
      remoteBranches,
      remotes,
      tags,
      stashes,
      status,
      gitFlow: gitFlowConfig
        ? { config: gitFlowConfig, branches: await listGitFlowBranches(repository, gitFlowConfig) }
        : null
    }
  }

  async commitDetails(sha: string): Promise<CommitDetails> {
    const repository = this.requireRepository()
    const [message, files] = await Promise.all([repository.commitMessage(sha), repository.commitFiles(sha)])
    return { sha, message, files }
  }

  commitFileDiff(sha: string, path: string, options: DiffOptions = defaultDiffOptions): Promise<string> {
    return this.requireRepository().commitFileDiff(sha, path, options)
  }

  workingFileDiff(change: FileChange, staged: boolean, options: DiffOptions = defaultDiffOptions): Promise<string> {
    return this.requireRepository().workingFileDiff(change, staged, options)
  }

  stage(paths: string[]): Promise<void> {
    return this.requireRepository().stage(paths)
  }

  unstage(paths: string[]): Promise<void> {
    return this.requireRepository().unstage(paths)
  }

  discard(changes: FileChange[]): Promise<void> {
    return this.requireRepository().discard(changes)
  }

  async commit(message: string): Promise<void> {
    if (!message.trim()) throw new Error('A commit message is required')
    const repository = this.requireRepository()
    if ((await repository.status()).staged.length === 0) throw new Error('Stage some changes before committing')
    await repository.commit(message)
  }

  checkoutBranch(branch: string) {
    return checkoutBranch(this.requireRepository(), branch)
  }

  checkoutRemoteBranch(remoteBranch: string) {
    return checkoutRemoteBranch(this.requireRepository(), remoteBranch)
  }

  createBranch(name: string, startPoint: string) {
    return createAndCheckoutBranch(this.requireRepository(), name, startPoint)
  }

  deleteBranch(branch: string, force: boolean) {
    return deleteBranch(this.requireRepository(), branch, force)
  }

  mergeIntoCurrent(branch: string) {
    return mergeIntoCurrent(this.requireRepository(), branch)
  }

  rebaseCurrentOnto(onto: string) {
    return rebaseCurrentOnto(this.requireRepository(), onto)
  }

  cherryPick(sha: string) {
    return cherryPick(this.requireRepository(), sha)
  }

  squashPlan(shas: string[]) {
    return planSquash(this.requireRepository(), shas)
  }

  squashCommits(shas: string[], message: string) {
    return squashCommits(this.requireRepository(), shas, message)
  }

  stash(message: string): Promise<boolean> {
    return this.requireRepository().stashPush(message.trim() || 'WIP')
  }

  stashPop(index: number): Promise<void> {
    return this.requireRepository().stashPop(index)
  }

  stashApply(index: number): Promise<void> {
    return this.requireRepository().stashApply(index)
  }

  stashDrop(index: number): Promise<void> {
    return this.requireRepository().stashDrop(index)
  }

  fetch(): Promise<void> {
    return this.requireRepository().fetch()
  }

  pull() {
    return pullCurrent(this.requireRepository())
  }

  push(): Promise<void> {
    return pushCurrent(this.requireRepository())
  }

  createPullRequest(branch: string, targetBranch: string) {
    return createPullRequest(this.requireRepository(), branch, targetBranch)
  }

  initGitFlow(config: GitFlowConfig): Promise<void> {
    return initGitFlow(this.requireRepository(), config)
  }

  startGitFlowBranch(type: GitFlowBranchType, name: string) {
    return startGitFlowBranch(this.requireRepository(), type, name)
  }

  finishGitFlowBranch(branchName: string, options: FinishGitFlowOptions) {
    return finishGitFlowBranch(this.requireRepository(), branchName, options)
  }

  private requireRepository(): GitRepository {
    if (!this.repository) throw new Error('No repository is open')
    return this.repository
  }
}

function headSha(commits: Commit[]): string | null {
  return commits.find((commit) => commit.refs.some((ref) => ref.kind === 'head'))?.sha ?? null
}

function repositoryName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
