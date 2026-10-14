import { describe, expect, it } from 'vitest'
import {
  baseBranchFor,
  defaultGitFlowConfig as config,
  gitFlowBranchName,
  mergeTargetsFor,
  parseGitFlowBranch,
  versionTagFor
} from '../../src/domain/gitFlow'

describe('git-flow rules', () => {
  it('branches features and releases off develop and hotfixes off main', () => {
    expect(baseBranchFor('feature', config)).toBe('develop')
    expect(baseBranchFor('release', config)).toBe('develop')
    expect(baseBranchFor('hotfix', config)).toBe('main')
  })

  it('merges features into develop and releases/hotfixes into main then develop', () => {
    expect(mergeTargetsFor('feature', config)).toEqual(['develop'])
    expect(mergeTargetsFor('release', config)).toEqual(['main', 'develop'])
    expect(mergeTargetsFor('hotfix', config)).toEqual(['main', 'develop'])
  })

  it('builds and parses prefixed branch names', () => {
    expect(gitFlowBranchName('feature', ' login ', config)).toBe('feature/login')
    expect(parseGitFlowBranch('release/1.2.0', config)).toEqual({ type: 'release', name: '1.2.0', branchName: 'release/1.2.0' })
    expect(parseGitFlowBranch('develop', config)).toBeNull()
    expect(parseGitFlowBranch('feature/', config)).toBeNull()
  })

  it('rejects empty names and names with spaces', () => {
    expect(() => gitFlowBranchName('feature', '  ', config)).toThrow('required')
    expect(() => gitFlowBranchName('feature', 'two words', config)).toThrow('spaces')
  })

  it('prefixes version tags', () => {
    const release = parseGitFlowBranch('release/1.0', config)!
    expect(versionTagFor(release, { ...config, versionTagPrefix: 'v' })).toBe('v1.0')
  })
})
