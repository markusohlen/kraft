import { layoutCommitGraph } from '../domain/commitGraph'
import type { FileChange } from '../domain/entities'
import type { GitFlowBranchType, GitFlowConfig } from '../domain/gitFlow'
import {
  checkoutBranch,
  checkoutRemoteBranch,
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

/** How many commits the graph shows; enough for daily work while keeping the view fast. */
const graphCommitLimit = 1500

export interface RecentRepositoriesStore {
  load(): Promise<string[]>
  remember(path: string): Promise<void>
}

export interface FolderPicker {
  chooseFolder(): Promise<string | null>
}

export class KraftService implements KraftApi {
  private repository: GitRepository | null = null

  constructor(
    private readonly repositories: GitRepositoryFactory,
    private readonly recent: RecentRepositoriesStore,
    private readonly folderPicker: FolderPicker
  ) {}

  recentRepositories(): Promise<string[]> {
    return this.recent.load()
  }

  chooseRepositoryFolder(): Promise<string | null> {
    return this.folderPicker.chooseFolder()
  }

  async openRepository(path: string): Promise<RepositoryView> {
    this.repository = await this.repositories.open(path)
    await this.recent.remember(this.repository.path)
    return this.refresh()
  }

  async refresh(): Promise<RepositoryView> {
    const repository = this.requireRepository()
    const [commits, currentBranch, branches, remoteBranches, tags, stashes, status, gitFlowConfig] = await Promise.all([
      repository.log(graphCommitLimit),
      repository.currentBranch(),
      repository.branches(),
      repository.remoteBranches(),
      repository.tags(),
      repository.stashes(),
      repository.status(),
      readGitFlowConfig(repository)
    ])
    return {
      path: repository.path,
      name: repositoryName(repository.path),
      currentBranch,
      graph: layoutCommitGraph(commits),
      branches,
      remoteBranches,
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

  commitFileDiff(sha: string, path: string): Promise<string> {
    return this.requireRepository().commitFileDiff(sha, path)
  }

  workingFileDiff(change: FileChange, staged: boolean): Promise<string> {
    return this.requireRepository().workingFileDiff(change, staged)
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

function repositoryName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}
