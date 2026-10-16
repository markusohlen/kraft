import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FileSystemRepositoryFinder } from '../../src/infrastructure/fileSystemRepositoryFinder'

describe('FileSystemRepositoryFinder', () => {
  let root: string

  /** Creates `relative/.git` as a folder, or as a file like worktrees and submodules have. */
  const repository = async (relative: string, gitAs: 'folder' | 'file' = 'folder') => {
    const folder = join(root, relative)
    await mkdir(folder, { recursive: true })
    if (gitAs === 'folder') await mkdir(join(folder, '.git'))
    else await writeFile(join(folder, '.git'), 'gitdir: ../.git/worktrees/x\n')
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'kraft-scan-'))
  })

  afterEach(() => rm(root, { recursive: true, force: true }))

  it('finds repositories at any depth, including worktrees with a .git file', async () => {
    await repository('api')
    await repository('clients/web')
    await repository('clients/mobile/app', 'file')
    await mkdir(join(root, 'notes'))

    const found = await new FileSystemRepositoryFinder().findRepositoryFolders(root)

    expect(found.folders).toEqual([join(root, 'api'), join(root, 'clients', 'mobile', 'app'), join(root, 'clients', 'web')])
    expect(found.complete).toBe(true)
  })

  it('treats the chosen folder itself as a repository when it is one', async () => {
    await repository('.')
    await repository('nested-submodule')

    const found = await new FileSystemRepositoryFinder().findRepositoryFolders(root)

    expect(found.folders).toEqual([root])
  })

  it('skips dependency, build and hidden folders', async () => {
    await repository('node_modules/some-package')
    await repository('Service/bin/Debug/copy')
    await repository('.cache/tool')
    await repository('real')

    const found = await new FileSystemRepositoryFinder().findRepositoryFolders(root)

    expect(found.folders).toEqual([join(root, 'real')])
  })

  it('stops at the depth limit', async () => {
    await repository('a/b/c')

    const shallow = await new FileSystemRepositoryFinder({ maxDepth: 2, maxFolders: 1000, concurrency: 4 }).findRepositoryFolders(root)
    const deep = await new FileSystemRepositoryFinder({ maxDepth: 3, maxFolders: 1000, concurrency: 4 }).findRepositoryFolders(root)

    expect(shallow.folders).toEqual([])
    expect(deep.folders).toEqual([join(root, 'a', 'b', 'c')])
  })

  it('reports an incomplete scan when it hits the folder limit', async () => {
    for (const name of ['a', 'b', 'c', 'd']) await repository(name)

    const found = await new FileSystemRepositoryFinder({ maxDepth: 6, maxFolders: 3, concurrency: 4 }).findRepositoryFolders(root)

    expect(found.complete).toBe(false)
    expect(found.foldersSearched).toBe(3)
    expect(found.folders).toHaveLength(2)
  })

  it('returns nothing for a folder that does not exist', async () => {
    const found = await new FileSystemRepositoryFinder().findRepositoryFolders(join(root, 'missing'))
    expect(found.folders).toEqual([])
  })
})
