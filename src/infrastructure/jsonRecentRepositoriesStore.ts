import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RecentRepositoriesStore } from '../application/kraftService'

const maxRecentRepositories = 10

export class JsonRecentRepositoriesStore implements RecentRepositoriesStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<string[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.filePath, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : []
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }

  async remember(path: string): Promise<void> {
    const recent = [path, ...(await this.load()).filter((entry) => entry !== path)].slice(0, maxRecentRepositories)
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(recent, null, 2))
  }
}
