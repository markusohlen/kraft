import { describe, expect, it } from 'vitest'
import { buildBranchTree, countBranches } from '../../src/renderer/src/branchTree'

describe('branch tree', () => {
  it('puts slash-separated branches in nested folders, folders first', () => {
    const tree = buildBranchTree(['main', 'feature/login', 'bugfix/crash', 'feature/auth/sso', 'develop'])

    expect(tree.branches.map((branch) => branch.fullName)).toEqual(['main', 'develop'])
    expect(tree.folders.map((folder) => folder.path)).toEqual(['bugfix', 'feature'])
    const feature = tree.folders[1]
    expect(feature.branches).toEqual([{ label: 'login', fullName: 'feature/login' }])
    expect(feature.folders[0]).toMatchObject({ name: 'auth', path: 'feature/auth', branches: [{ label: 'sso', fullName: 'feature/auth/sso' }] })
    expect(countBranches(tree)).toBe(5)
  })

  it('strips a base path such as the remote name', () => {
    const tree = buildBranchTree(['origin/main', 'origin/feature/login'], 'origin')

    expect(tree.branches).toEqual([{ label: 'main', fullName: 'origin/main' }])
    expect(tree.folders[0]).toMatchObject({ path: 'origin/feature', branches: [{ label: 'login', fullName: 'origin/feature/login' }] })
  })
})
