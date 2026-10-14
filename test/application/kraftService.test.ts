import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KraftService } from '../../src/application/kraftService'
import { GitCliRepositoryFactory } from '../../src/infrastructure/gitCliRepository'
import { createTestRepository, type TestRepository } from './gitTestRepository'

class MemoryRecentRepositories {
  paths: string[] = []
  async load() {
    return this.paths
  }
  async remember(path: string) {
    this.paths = [path, ...this.paths.filter((entry) => entry !== path)]
  }
}

const noFolderPicker = { chooseFolder: async () => null }

describe('KraftService', () => {
  let test: TestRepository
  let recent: MemoryRecentRepositories
  let service: KraftService

  beforeEach(async () => {
    test = await createTestRepository()
    recent = new MemoryRecentRepositories()
    service = new KraftService(new GitCliRepositoryFactory(), recent, noFolderPicker)
  })

  afterEach(() => test.dispose())

  it('opens a repository and builds the full view', async () => {
    await test.git('tag', 'v0')
    await test.write('notes.txt', 'draft\n')

    const view = await service.openRepository(test.path)

    expect(view.currentBranch).toBe('main')
    expect(view.graph.rows).toHaveLength(1)
    expect(view.graph.rows[0].commit.refs).toEqual(
      expect.arrayContaining([
        { name: 'main', kind: 'head' },
        { name: 'v0', kind: 'tag' }
      ])
    )
    expect(view.status.unstaged).toEqual([{ path: 'notes.txt', oldPath: null, status: 'untracked' }])
    expect(view.gitFlow).toBeNull()
    expect(recent.paths).toEqual([view.path])
  })

  it('stages, commits and shows the commit with its files', async () => {
    await service.openRepository(test.path)
    await test.write('feature.txt', 'feature\n')

    await service.stage(['feature.txt'])
    await service.commit('Add feature\n\nWith a description')
    const view = await service.refresh()
    const details = await service.commitDetails(view.graph.rows[0].commit.sha)

    expect(view.graph.rows[0].commit.subject).toBe('Add feature')
    expect(details.message).toBe('Add feature\n\nWith a description')
    expect(details.files).toEqual([{ path: 'feature.txt', oldPath: null, status: 'added' }])
    expect(await service.commitFileDiff(details.sha, 'feature.txt')).toContain('+feature')
  })

  it('refuses to commit with nothing staged', async () => {
    await service.openRepository(test.path)

    await expect(service.commit('Empty')).rejects.toThrow('Stage some changes')
  })

  it('rejects folders that are not repositories', async () => {
    await expect(service.openRepository(test.path + '-missing')).rejects.toThrow('is not a folder')
  })
})
