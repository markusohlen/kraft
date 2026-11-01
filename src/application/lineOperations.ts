import type { DiffOptions } from '../domain/diff'
import { parseUnifiedDiff } from '../domain/diff'
import type { FileChange } from '../domain/entities'
import { isEmptySelection, reasonTextCannotBeRewritten, withSelectedChanges, type LineSelection } from '../domain/lineChanges'
import type { GitRepository } from './ports'

export type LineAction = 'stage' | 'unstage' | 'discard'

export interface LineChangeRequest {
  action: LineAction
  change: FileChange
  /** The diff the lines were picked from, exactly as it was received. */
  shownDiff: string
  options: DiffOptions
  selection: LineSelection
}

/** Index modes of regular files; symbolic links and submodules hold no lines. */
const regularFileModes = ['100644', '100755']

/**
 * Stages, unstages or discards single changed lines by working out the file's new text and writing it
 * where it belongs, rather than by building a patch for git to fit in. The other lines stay byte for byte.
 */
export async function changeLines(repository: GitRepository, request: LineChangeRequest): Promise<void> {
  const { action, change, selection } = request
  const { path } = change
  if (isEmptySelection(selection)) throw new Error('Select the changed lines to act on')
  await requireModifiedFile(repository, action, path)
  // What was picked must be what is there: the file may have changed since, and those lines would then be wrong.
  const current = await repository.workingFileDiff(change, action === 'unstage', request.options)
  if (current !== request.shownDiff) throw new Error(`${path} changed since this diff was shown, so nothing was done. Select the lines again.`)
  const mode = await repository.indexEntryMode(path)
  if (mode === null || !regularFileModes.includes(mode)) throw new Error(`The lines of ${path} cannot be changed separately because it is not a regular file`)

  const diff = parseUnifiedDiff(current)
  const base = await requireRewritableText(path, action === 'discard' ? repository.readWorkingFile(path) : repository.indexFileText(path))
  const rewritten = withSelectedChanges(base, diff, selection, action === 'stage' ? 'apply' : 'undo')
  if (action === 'discard') {
    await repository.writeWorkingFile(path, rewritten)
    return
  }
  await repository.writeIndexFile(path, mode, rewritten)
  await finishWhenNothingIsLeft(repository, action, change, request.options)
}

async function requireModifiedFile(repository: GitRepository, action: LineAction, path: string): Promise<void> {
  const { staged, unstaged } = await repository.status()
  const list = action === 'unstage' ? staged : unstaged
  if (!list.some((change) => change.path === path && change.status === 'modified')) {
    throw new Error(`The lines of ${path} cannot be changed separately; only modified files support it`)
  }
}

async function requireRewritableText(path: string, reading: Promise<string>): Promise<string> {
  const text = await reading
  const reason = reasonTextCannotBeRewritten(text)
  if (reason) throw new Error(`The lines of ${path} cannot be changed separately because ${reason}`)
  return text
}

/** Having moved every line, a whole-file stage or unstage leaves the index entry as if the file had been handled normally. */
async function finishWhenNothingIsLeft(repository: GitRepository, action: 'stage' | 'unstage', change: FileChange, options: DiffOptions): Promise<void> {
  const isLeft = (await repository.workingFileDiff(change, action === 'stage' ? false : true, options)) !== ''
  if (isLeft) return
  await (action === 'stage' ? repository.stage([change.path]) : repository.unstage([change.path]))
}
