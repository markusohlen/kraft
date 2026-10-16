import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { mapWithConcurrency } from '../application/concurrency'
import type { FoundRepositoryFolders, RepositoryFinder } from '../application/repositoryLibraryService'

export interface RepositoryFinderLimits {
  /** How many levels below the chosen folder to look. */
  maxDepth: number
  /** Stops a scan of e.g. a whole drive from running for minutes. */
  maxFolders: number
  concurrency: number
}

const defaultLimits: RepositoryFinderLimits = { maxDepth: 6, maxFolders: 50_000, concurrency: 16 }

/** Dependency, build and tool folders that never hold a project's own repository but can be huge. */
const skippedFolderNames = new Set(['node_modules', 'bin', 'obj', 'dist', 'build', 'out', 'target', 'vendor', '__pycache__', 'venv'])

/** Folders that can't be read are skipped rather than failing the whole scan. */
const unreadableFolderCodes = new Set(['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EBUSY'])

interface FolderListing {
  isRepository: boolean
  subfolders: string[]
}

/** Finds git repositories by walking the folder tree, level by level. */
export class FileSystemRepositoryFinder implements RepositoryFinder {
  constructor(private readonly limits: RepositoryFinderLimits = defaultLimits) {}

  async findRepositoryFolders(root: string): Promise<FoundRepositoryFolders> {
    const folders: string[] = []
    let level = [root]
    let foldersSearched = 0
    let complete = true

    for (let depth = 0; level.length > 0; depth++) {
      const listings = await mapWithConcurrency(level, this.limits.concurrency, listFolder)
      let next: string[] = []
      level.forEach((folder, index) => {
        const listing = listings[index]
        // A repository's own subfolders (including submodules) belong to it, so the search stops there.
        if (listing?.isRepository) folders.push(folder)
        else if (listing && depth < this.limits.maxDepth) next.push(...listing.subfolders.map((name) => join(folder, name)))
      })
      foldersSearched += level.length

      const remaining = this.limits.maxFolders - foldersSearched
      if (next.length > remaining) {
        complete = false
        next = next.slice(0, Math.max(0, remaining))
      }
      level = next
    }

    return { folders: folders.sort((a, b) => a.localeCompare(b)), foldersSearched, complete }
  }
}

async function listFolder(folder: string): Promise<FolderListing | null> {
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch (error) {
    if (unreadableFolderCodes.has((error as NodeJS.ErrnoException).code ?? '')) return null
    throw error
  }
  return {
    // `.git` is a folder in a normal repository and a file in worktrees and submodules.
    isRepository: entries.some((entry) => entry.name === '.git'),
    subfolders: entries
      // Links and junctions are not followed, which avoids loops and scanning the same place twice.
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .filter((name) => !name.startsWith('.') && !skippedFolderNames.has(name.toLowerCase()))
  }
}
