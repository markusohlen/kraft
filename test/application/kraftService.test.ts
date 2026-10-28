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

  it('shows the untracked files a stash took next to its other changes', async () => {
    await test.write('readme.txt', 'changed\n')
    await test.write('notes.txt', 'draft\n')
    await service.openRepository(test.path)
    await service.stash('Work in progress')
    const [stash] = (await service.refresh()).stashes

    const details = await service.stashDetails(stash.sha)
    const [modified, untracked] = details.files

    expect(details.files).toEqual([
      { path: 'readme.txt', oldPath: null, status: 'modified' },
      { path: 'notes.txt', oldPath: null, status: 'untracked' }
    ])
    expect(await service.stashFileDiff(stash.sha, modified)).toContain('+changed')
    expect(await service.stashFileDiff(stash.sha, untracked)).toContain('+draft')
  })

  it('shows a stash without untracked files like a commit', async () => {
    await test.write('readme.txt', 'changed\n')
    await test.git('stash', 'push', '-q')
    const [stash] = (await service.openRepository(test.path)).stashes

    expect((await service.stashDetails(stash.sha)).files).toEqual([{ path: 'readme.txt', oldPath: null, status: 'modified' }])
  })

  it('refuses to commit with nothing staged', async () => {
    await service.openRepository(test.path)

    await expect(service.commit('Empty')).rejects.toThrow('Stage some changes')
  })

  it('amends the last commit with the staged changes and a new message', async () => {
    await test.commitFile('feature.txt', 'feature\n', 'Add feature')
    await service.openRepository(test.path)
    await test.write('forgotten.txt', 'forgotten\n')

    expect(await service.headCommitMessage()).toBe('Add feature')
    await service.stage(['forgotten.txt'])
    await service.amendCommit('Add feature\n\nWith the forgotten file')
    const view = await service.refresh()
    const details = await service.commitDetails(commitAt(view.graph.rows, 0).sha)

    expect(view.graph.rows.map((row) => row.kind)).toEqual(['commit', 'commit'])
    expect(details.message).toBe('Add feature\n\nWith the forgotten file')
    expect(details.files.map((change) => change.path)).toEqual(['feature.txt', 'forgotten.txt'])
  })

  it('rewords the last commit when nothing is staged', async () => {
    await service.openRepository(test.path)

    await service.amendCommit('Reworded')

    expect(await service.headCommitMessage()).toBe('Reworded')
    expect(await test.git('rev-list', '--count', 'HEAD')).toBe('1')
  })

  it('refuses to amend while a cherry-pick waits to be committed', async () => {
    await test.git('switch', '-q', '-c', 'other')
    await test.commitFile('readme.txt', 'theirs\n', 'Change on other')
    await test.git('switch', '-q', 'main')
    await test.commitFile('readme.txt', 'ours\n', 'Change on main')
    await test.git('cherry-pick', 'other').catch(() => undefined)
    await service.openRepository(test.path)

    await expect(service.amendCommit('Amended')).rejects.toThrow('before amending')
  })

  it('rejects folders that are not repositories', async () => {
    await expect(service.openRepository(test.path + '-missing')).rejects.toThrow('is not a folder')
  })
})
