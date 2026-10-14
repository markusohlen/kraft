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
  const path = await mkdtemp(join(tmpdir(), 'kraft-test-'))
  const git = async (...args: string[]) => (await runGit(path, args)).stdout.trim()
  const write = (file: string, content: string) => writeFile(join(path, file), content)
  const commitFile = async (file: string, content: string, message: string) => {
    await write(file, content)
    await git('add', file)
    await git('commit', '-q', '-m', message)
  }

  await git('init', '-q', '-b', 'main')
  await git('config', 'user.name', 'Test User')
  await git('config', 'user.email', 'test@example.com')
  await git('config', 'commit.gpgsign', 'false')
  await git('config', 'tag.gpgsign', 'false')
  await commitFile('readme.txt', 'hello\n', 'Initial commit')

  return {
    path,
    repository: new GitCliRepository(path),
    git,
    write,
    commitFile,
    dispose: () => rm(path, { recursive: true, force: true, maxRetries: 5 })
  }
}
