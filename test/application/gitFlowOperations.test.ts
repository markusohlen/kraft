import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  finishGitFlowBranch,
  initGitFlow,
  listGitFlowBranches,
  readGitFlowConfig,
  startGitFlowBranch
} from '../../src/application/gitFlowOperations'
import { defaultGitFlowConfig } from '../../src/domain/gitFlow'
import { createTestRepository, type TestRepository } from './gitTestRepository'

const keepBranch = { deleteBranch: false, rebaseOnDevelop: false, tagMessage: '' }
const deleteBranch = { ...keepBranch, deleteBranch: true }

describe('git-flow operations', () => {
  let test: TestRepository

  beforeEach(async () => {
    test = await createTestRepository()
    await initGitFlow(test.repository, defaultGitFlowConfig)
  })

  afterEach(() => test.dispose())

  it('writes the standard git-flow config and creates develop from main', async () => {
    expect(await readGitFlowConfig(test.repository)).toEqual(defaultGitFlowConfig)
    expect(await test.git('config', 'gitflow.prefix.feature')).toBe('feature/')
    expect(await test.git('rev-parse', 'develop')).toBe(await test.git('rev-parse', 'main'))
  })

  it('reports git-flow as not initialized in a fresh repository', async () => {
    const fresh = await createTestRepository()
    try {
      expect(await readGitFlowConfig(fresh.repository)).toBeNull()
    } finally {
      await fresh.dispose()
    }
  })

  it('refuses to initialize when the main branch does not exist', async () => {
    await expect(initGitFlow(test.repository, { ...defaultGitFlowConfig, mainBranch: 'trunk' })).rejects.toThrow('"trunk" does not exist')
  })

  it('starts a feature from develop and checks it out', async () => {
    await test.commitFile('develop-only.txt', 'x\n', 'Develop work') // on main; develop stays behind
    await test.git('checkout', '-q', 'develop')

    await startGitFlowBranch(test.repository, 'feature', 'login')

    expect(await test.repository.currentBranch()).toBe('feature/login')
    expect(await test.git('rev-parse', 'HEAD')).toBe(await test.git('rev-parse', 'develop'))
    expect(await listGitFlowBranches(test.repository, defaultGitFlowConfig)).toEqual([
      { type: 'feature', name: 'login', branchName: 'feature/login' }
    ])
  })

  it('starts a hotfix from main', async () => {
    await test.git('checkout', '-q', 'develop')
    await test.commitFile('develop.txt', 'x\n', 'Develop work')

    await startGitFlowBranch(test.repository, 'hotfix', '1.0.1')

    expect(await test.git('rev-parse', 'HEAD')).toBe(await test.git('rev-parse', 'main'))
  })

  it('auto-stashes uncommitted changes when starting a branch', async () => {
    await test.write('readme.txt', 'dirty\n')

    const result = await startGitFlowBranch(test.repository, 'feature', 'dirty')

    expect(result.stashMessage).toBe('Auto stash before checking out "feature/dirty"')
    expect(await test.repository.stashes()).toHaveLength(1)
  })

  it('finishes a feature by merging it into develop with a merge commit and deleting it', async () => {
    await startGitFlowBranch(test.repository, 'feature', 'login')
    await test.commitFile('login.txt', 'login\n', 'Add login')

    await finishGitFlowBranch(test.repository, 'feature/login', deleteBranch)

    expect(await test.repository.currentBranch()).toBe('develop')
    expect(await test.git('log', '-1', '--format=%s')).toBe("Merge branch 'feature/login' into develop")
    expect(await test.git('log', '-1', '--format=%P')).toContain(' ') // two parents: a real merge
    expect(await test.repository.branchExists('feature/login')).toBe(false)
    expect(await test.git('rev-parse', 'main')).not.toBe(await test.git('rev-parse', 'develop'))
  })

  it('rebases a feature onto develop before merging when asked', async () => {
    await startGitFlowBranch(test.repository, 'feature', 'search')
    await test.commitFile('search.txt', 'search\n', 'Add search')
    await test.git('checkout', '-q', 'develop')
    await test.commitFile('other.txt', 'other\n', 'Other develop work')
    const developBefore = await test.git('rev-parse', 'develop')

    await finishGitFlowBranch(test.repository, 'feature/search', { ...keepBranch, rebaseOnDevelop: true })

    expect(await test.git('rev-parse', 'feature/search~1')).toBe(developBefore)
  })

  it('finishes a release into main and develop and tags it on main', async () => {
    await startGitFlowBranch(test.repository, 'release', '1.0.0')
    await test.commitFile('version.txt', '1.0.0\n', 'Bump version')

    const result = await finishGitFlowBranch(test.repository, 'release/1.0.0', { ...deleteBranch, tagMessage: 'First release' })

    expect(result.tag).toBe('1.0.0')
    expect(await test.git('tag', '-l', '-n1', '1.0.0')).toContain('First release')
    expect(await test.git('rev-parse', '1.0.0^{commit}')).toBe(await test.git('rev-parse', 'main'))
    expect(await test.git('show', 'main:version.txt')).toBe('1.0.0')
    expect(await test.git('show', 'develop:version.txt')).toBe('1.0.0')
    expect(await test.repository.currentBranch()).toBe('develop')
    expect(await test.repository.branchExists('release/1.0.0')).toBe(false)
  })

  it('uses the version tag prefix for hotfix tags', async () => {
    await initGitFlow(test.repository, { ...defaultGitFlowConfig, versionTagPrefix: 'v' })
    await startGitFlowBranch(test.repository, 'hotfix', '1.0.1')
    await test.commitFile('fix.txt', 'fix\n', 'Fix bug')

    const result = await finishGitFlowBranch(test.repository, 'hotfix/1.0.1', keepBranch)

    expect(result.tag).toBe('v1.0.1')
    expect(await test.git('show', 'develop:fix.txt')).toBe('fix')
    expect(await test.repository.branchExists('hotfix/1.0.1')).toBe(true)
  })

  it('rejects finishing a branch that is not a git-flow branch', async () => {
    await expect(finishGitFlowBranch(test.repository, 'main', keepBranch)).rejects.toThrow('not a git-flow')
  })
})
