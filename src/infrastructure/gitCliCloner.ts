import { mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { RepositoryCloner } from '../application/cloneService'
import type { CloneOptions } from '../domain/hostingProvider'
import { runGit } from './gitCommand'

/**
 * Clones with the user's own git credentials (e.g. Git Credential Manager or SSH keys), so later fetches and
 * pushes sign in the same way. The URL and folder are placed after `--end-of-options`, so neither can be read
 * as an option such as `--upload-pack=<command>`.
 */
export class GitCliCloner implements RepositoryCloner {
  async clone(url: string, parentFolder: string, folderName: string, options: CloneOptions): Promise<string> {
    if (!isAbsolute(parentFolder)) throw new Error(`"${parentFolder}" is not a full folder path`)
    await mkdir(parentFolder, { recursive: true })
    const destination = join(parentFolder, folderName)
    const optionArgs = [...(options.shallow ? ['--depth', '1'] : []), ...(options.sparse ? ['--sparse'] : [])]
    await runGit(parentFolder, ['clone', ...optionArgs, '--end-of-options', url, destination])
    return destination
  }
}
