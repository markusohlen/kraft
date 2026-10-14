import {
  baseBranchFor,
  gitFlowBranchName,
  gitFlowConfigKeys,
  isTaggedOnFinish,
  mergeTargetsFor,
  parseGitFlowBranch,
  versionTagFor,
  type GitFlowBranch,
  type GitFlowBranchType,
  type GitFlowConfig
} from '../domain/gitFlow'
import { autoStashMessages, withAutoStash, type AutoStashResult } from './autoStash'
import type { GitRepository } from './ports'

export interface FinishGitFlowOptions {
  deleteBranch: boolean
  /** Features only: rebase the feature onto develop before merging. */
  rebaseOnDevelop: boolean
  /** Releases and hotfixes only: annotated tag message. */
  tagMessage: string
}

export interface FinishGitFlowResult extends AutoStashResult {
  tag: string | null
}

/** Returns null when git-flow has not been initialized in this repository. */
export async function readGitFlowConfig(repository: GitRepository): Promise<GitFlowConfig | null> {
  const entries = await Promise.all(
    Object.entries(gitFlowConfigKeys).map(async ([field, key]) => [field, await repository.getConfig(key)] as const)
  )
  const values = Object.fromEntries(entries) as Record<keyof GitFlowConfig, string | null>
  if (!values.mainBranch || !values.developBranch) return null
  return {
    mainBranch: values.mainBranch,
    developBranch: values.developBranch,
    featurePrefix: values.featurePrefix ?? '',
    releasePrefix: values.releasePrefix ?? '',
    hotfixPrefix: values.hotfixPrefix ?? '',
    versionTagPrefix: values.versionTagPrefix ?? ''
  }
}

/** Writes the git-flow configuration and creates develop from main if it does not exist yet. */
export async function initGitFlow(repository: GitRepository, config: GitFlowConfig): Promise<void> {
  if (config.mainBranch === config.developBranch) throw new Error('Main and develop must be different branches')
  if (!(await repository.branchExists(config.mainBranch))) {
    throw new Error(`Branch "${config.mainBranch}" does not exist; create it or choose another main branch`)
  }
  for (const [field, key] of Object.entries(gitFlowConfigKeys)) {
    await repository.setConfig(key, config[field as keyof GitFlowConfig])
  }
  if (!(await repository.branchExists(config.developBranch))) {
    await repository.createBranch(config.developBranch, config.mainBranch)
  }
}

export async function listGitFlowBranches(repository: GitRepository, config: GitFlowConfig): Promise<GitFlowBranch[]> {
  const branches = await repository.branches()
  return branches.flatMap((branch) => parseGitFlowBranch(branch.name, config) ?? [])
}

export async function startGitFlowBranch(
  repository: GitRepository,
  type: GitFlowBranchType,
  name: string
): Promise<AutoStashResult> {
  const config = await requireGitFlowConfig(repository)
  const branchName = gitFlowBranchName(type, name, config)
  const base = baseBranchFor(type, config)
  if (!(await repository.branchExists(base))) throw new Error(`Branch "${base}" is required to start a ${type}`)
  if (await repository.branchExists(branchName)) throw new Error(`Branch "${branchName}" already exists`)

  return withAutoStash(repository, autoStashMessages.checkout(branchName), 'keep', async () => {
    await repository.createBranch(branchName, base)
    await repository.checkout(branchName)
  })
}

/**
 * Finishes a git-flow branch the way git-flow does: features merge into develop; releases and
 * hotfixes merge into main, get a version tag, then merge into develop. Merges use --no-ff so
 * the branch stays visible in the graph. Ends with develop checked out.
 */
export async function finishGitFlowBranch(
  repository: GitRepository,
  branchName: string,
  options: FinishGitFlowOptions
): Promise<FinishGitFlowResult> {
  const config = await requireGitFlowConfig(repository)
  const branch = parseGitFlowBranch(branchName, config)
  if (!branch) throw new Error(`"${branchName}" is not a git-flow feature, release or hotfix branch`)
  if (!(await repository.branchExists(branchName))) throw new Error(`No ${branch.type} "${branch.name}" to finish`)
  await requireBranches(repository, mergeTargetsFor(branch.type, config), `finish a ${branch.type}`)

  const tag = isTaggedOnFinish(branch.type) ? versionTagFor(branch, config) : null
  const { stashMessage } = await withAutoStash(
    repository,
    autoStashMessages.checkout(config.developBranch),
    'keep',
    () => mergeFinishedBranch(repository, branch, config, tag, options)
  )
  return { stashMessage, tag }
}

async function mergeFinishedBranch(
  repository: GitRepository,
  branch: GitFlowBranch,
  config: GitFlowConfig,
  tag: string | null,
  options: FinishGitFlowOptions
): Promise<void> {
  if (branch.type === 'feature' && options.rebaseOnDevelop) {
    await repository.checkout(branch.branchName)
    await repository.rebase(config.developBranch)
  }
  for (const target of mergeTargetsFor(branch.type, config)) {
    await repository.checkout(target)
    await repository.merge(branch.branchName, {
      noFastForward: true,
      message: `Merge branch '${branch.branchName}' into ${target}`
    })
    if (tag && target === config.mainBranch) {
      await repository.createTag(tag, options.tagMessage.trim() || `${capitalize(branch.type)} ${branch.name}`)
    }
  }
  if (options.deleteBranch) await repository.deleteBranch(branch.branchName, false)
}

async function requireGitFlowConfig(repository: GitRepository): Promise<GitFlowConfig> {
  const config = await readGitFlowConfig(repository)
  if (!config) throw new Error('Git-flow is not initialized in this repository')
  return config
}

async function requireBranches(repository: GitRepository, branches: string[], purpose: string): Promise<void> {
  for (const branch of branches) {
    if (!(await repository.branchExists(branch))) throw new Error(`Branch "${branch}" is required to ${purpose}`)
  }
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
