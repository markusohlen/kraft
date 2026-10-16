import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KraftService } from '../../src/application/kraftService'
import type { GraphRow } from '../../src/domain/commitGraph'
import type { Commit } from '../../src/domain/entities'
import { GitCliRepositoryFactory } from '../../src/infrastructure/gitCliRepository'
import { createTestRepository, type TestRepository } from './gitTestRepository'

class MemorySavedRepositories {
  paths: string[] = []
  async remember(path: string) {
    this.paths = [path, ...this.paths.filter((entry) => entry !== path)]
  }
}

const noFolderPicker = { chooseFolder: async () => null }

function commitAt(rows: GraphRow[], index: number): Commit {
  const row = rows[index]
  if (row.kind !== 'commit') throw new Error(`Row ${index} is ${row.kind}, not a commit`)
  return row.commit
}

describe('KraftService', () => {
  let test: TestRepository
  let recent: MemorySavedRepositories
  let service: KraftService

  beforeEach(async () => {
    test = await createTestRepository()
    recent = new MemorySavedRepositories()
    service = new KraftService(new GitCliRepositoryFactory(), recent, noFolderPicker)
  })

  afterEach(() => test.dispose())

  it('opens a repository and builds the full view', async () => {
    await test.git('tag', 'v0')
    await test.write('notes.txt', 'draft\n')

    const view = await service.openRepository(test.path)

    expect(view.currentBranch).toBe('main')
    // The untracked file shows as uncommitted changes above the commit.
    expect(view.graph.rows.map((row) => row.kind)).toEqual(['work-in-progress', 'commit'])
    expect(commitAt(view.graph.rows, 1).refs).toEqual(
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
    const details = await service.commitDetails(commitAt(view.graph.rows, 0).sha)

    expect(commitAt(view.graph.rows, 0).subject).toBe('Add feature')
    expect(details.message).toBe('Add feature\n\nWith a description')
    expect(details.files).toEqual([{ path: 'feature.txt', oldPath: null, status: 'added' }])
    expect(await service.commitFileDiff(details.sha, 'feature.txt')).toContain('+feature')
  })

  it('shows a few lines around a change, or the whole file when asked', async () => {
    const numbered = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`)
    await test.commitFile('long.txt', `${numbered(30).join('\n')}\n`, 'Add long file')
    await test.write('long.txt', `${numbered(30).join('\n').replace('line 15', 'line fifteen')}\n`)
    await service.openRepository(test.path)
    const change = { path: 'long.txt', oldPath: null, status: 'modified' as const }

    const compact = await service.workingFileDiff(change, false)
    const full = await service.workingFileDiff(change, false, { fullFile: true })

    expect(compact).toContain('+line fifteen')
    expect(compact).not.toContain(' line 1\n')
    expect(full).toContain(' line 1\n')
    expect(full).toContain(' line 30')
  })

  it('refuses to commit with nothing staged', async () => {
    await service.openRepository(test.path)

    await expect(service.commit('Empty')).rejects.toThrow('Stage some changes')
  })

  it('rejects folders that are not repositories', async () => {
    await expect(service.openRepository(test.path + '-missing')).rejects.toThrow('is not a folder')
  })
})
