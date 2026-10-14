export type GitFlowBranchType = 'feature' | 'release' | 'hotfix'

export const gitFlowBranchTypes: readonly GitFlowBranchType[] = ['feature', 'release', 'hotfix']

export interface GitFlowConfig {
  mainBranch: string
  developBranch: string
  featurePrefix: string
  releasePrefix: string
  hotfixPrefix: string
  versionTagPrefix: string
}

export const defaultGitFlowConfig: GitFlowConfig = {
  mainBranch: 'main',
  developBranch: 'develop',
  featurePrefix: 'feature/',
  releasePrefix: 'release/',
  hotfixPrefix: 'hotfix/',
  versionTagPrefix: ''
}

/** The git config keys used by git-flow (AVH) and GitKraken, so repositories stay interoperable. */
export const gitFlowConfigKeys: Record<keyof GitFlowConfig, string> = {
  mainBranch: 'gitflow.branch.master',
  developBranch: 'gitflow.branch.develop',
  featurePrefix: 'gitflow.prefix.feature',
  releasePrefix: 'gitflow.prefix.release',
  hotfixPrefix: 'gitflow.prefix.hotfix',
  versionTagPrefix: 'gitflow.prefix.versiontag'
}

export interface GitFlowBranch {
  type: GitFlowBranchType
  /** The name without its prefix, e.g. `login` for `feature/login`. */
  name: string
  branchName: string
}

export function prefixFor(type: GitFlowBranchType, config: GitFlowConfig): string {
  switch (type) {
    case 'feature':
      return config.featurePrefix
    case 'release':
      return config.releasePrefix
    case 'hotfix':
      return config.hotfixPrefix
  }
}

export function gitFlowBranchName(type: GitFlowBranchType, name: string, config: GitFlowConfig): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`A ${type} name is required`)
  if (/\s/.test(trimmed)) throw new Error(`A ${type} name cannot contain spaces`)
  return prefixFor(type, config) + trimmed
}

/** Features and releases branch off develop; hotfixes branch off main. */
export function baseBranchFor(type: GitFlowBranchType, config: GitFlowConfig): string {
  return type === 'hotfix' ? config.mainBranch : config.developBranch
}

/** Features merge back into develop; releases and hotfixes ship to main and are merged back into develop. */
export function mergeTargetsFor(type: GitFlowBranchType, config: GitFlowConfig): string[] {
  return type === 'feature' ? [config.developBranch] : [config.mainBranch, config.developBranch]
}

export function isTaggedOnFinish(type: GitFlowBranchType): boolean {
  return type !== 'feature'
}

export function versionTagFor(branch: GitFlowBranch, config: GitFlowConfig): string {
  return config.versionTagPrefix + branch.name
}

export function parseGitFlowBranch(branchName: string, config: GitFlowConfig): GitFlowBranch | null {
  for (const type of gitFlowBranchTypes) {
    const prefix = prefixFor(type, config)
    if (prefix && branchName.startsWith(prefix) && branchName.length > prefix.length) {
      return { type, name: branchName.slice(prefix.length), branchName }
    }
  }
  return null
}
