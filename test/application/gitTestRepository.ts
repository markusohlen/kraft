import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GitCliRepository } from '../../src/infrastructure/gitCliRepository'
import { runGit } from '../../src/infrastructure/gitCommand'

export interface TestRepository {
  path: string
  repository: GitCliRepository
  git: (...args: string[]) => Promise<string>
  write: (file: string, content: string) => Promise<void>
  commitFile: (file: string, content: string, message: string) => Promise<void>
  dispose: () => Promise<void>
}

/** Creates a throwaway repository on `main` with one commit. */
export async function createTestRepository(): Promise<TestRepository> {
  const test = await testRepositoryAt(await mkdtemp(join(tmpdir(), 'kraft-test-')))
  await test.git('init', '-q', '-b', 'main')
  await configureCommitter(test)
  await test.commitFile('readme.txt', 'hello\n', 'Initial commit')
  return test
}

/** Clones `source` into a throwaway repository, so `source` acts as its `origin`. */
export async function cloneTestRepository(source: TestRepository): Promise<TestRepository> {
  const test = await testRepositoryAt(await mkdtemp(join(tmpdir(), 'kraft-clone-')))
  await test.git('clone', '-q', source.path, '.')
  await configureCommitter(test)
  return test
}

async function testRepositoryAt(path: string): Promise<TestRepository> {
  const git = async (...args: string[]) => (await runGit(path, args)).stdout.trim()
  const write = (file: string, content: string) => writeFile(join(path, file), content)
  const commitFile = async (file: string, content: string, message: string) => {
    await write(file, content)
    await git('add', file)
    await git('commit', '-q', '-m', message)
  }
  return {
    path,
    repository: new GitCliRepository(path),
    git,
    write,
    commitFile,
    dispose: () => rm(path, { recursive: true, force: true, maxRetries: 5 })
  }
}

async function configureCommitter(test: TestRepository): Promise<void> {
  await test.git('config', 'user.name', 'Test User')
  await test.git('config', 'user.email', 'test@example.com')
  await test.git('config', 'commit.gpgsign', 'false')
  await test.git('config', 'tag.gpgsign', 'false')
}
