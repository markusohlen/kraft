import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { RepositoryLibraryStore } from '../application/repositoryLibraryService'
import { addRepository, emptyLibrary, type LibraryEntry, type RepositoryLibrary, type SavedRepository } from '../domain/repositoryLibrary'

/** Keeps the saved repositories and folders in a JSON file. */
export class JsonRepositoryLibraryStore implements RepositoryLibraryStore {
  constructor(
    private readonly filePath: string,
    /** The list of recent repositories from earlier versions, used until the library is first saved. */
    private readonly legacyRecentFilePath?: string
  ) {}

  async load(): Promise<RepositoryLibrary> {
    const saved = await readJson(this.filePath)
    if (saved !== undefined) return parseLibrary(saved)
    const legacy = this.legacyRecentFilePath ? await readJson(this.legacyRecentFilePath) : undefined
    return Array.isArray(legacy) ? legacy.filter(isString).reduce(addRepository, emptyLibrary) : emptyLibrary
  }

  async save(library: RepositoryLibrary): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(library, null, 2))
  }
}

/** Undefined when the file does not exist. */
async function readJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw new Error(`Could not read ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Keeps every well-formed entry, so one damaged entry doesn't lose the rest of the library. */
function parseLibrary(value: unknown): RepositoryLibrary {
  const entries = (value as { entries?: unknown })?.entries
  if (!Array.isArray(entries)) return emptyLibrary
  return {
    entries: entries.flatMap((entry): LibraryEntry[] => {
      if (isSavedRepository(entry) && entry.kind === 'repository') return [{ kind: 'repository', path: entry.path, name: entry.name }]
      if (entry?.kind === 'folder' && isString(entry.id) && isString(entry.name) && Array.isArray(entry.repositories)) {
        const repositories = (entry.repositories as unknown[]).filter(isSavedRepository).map(({ path, name }) => ({ path, name }))
        return [{ kind: 'folder', id: entry.id, name: entry.name, repositories }]
      }
      return []
    })
  }
}

function isSavedRepository(value: unknown): value is SavedRepository & { kind?: string } {
  const candidate = value as Partial<SavedRepository> | null
  return isString(candidate?.path) && isString(candidate?.name)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}
