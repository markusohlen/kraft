import { conflictMarkerSize, parseConflictMarkers, type MergedText, type MergeSide } from '../domain/mergeConflict'
import type { GitRepository } from './ports'

/** The commit a side of the conflict comes from, and the branch it is on. */
export interface ConflictSide {
  sha: string | null
  branch: string | null
}

export type MergeConflict = { path: string; sides: Record<MergeSide, ConflictSide> } & (
  /** Both sides changed the file's text; lines are picked from each. */
  | { kind: 'text'; merged: MergedText }
  /** Only one side has the file: the other deleted it (or never had it). It is kept or deleted as a whole. */
  | { kind: 'one-sided'; presentIn: MergeSide; deletedOnOtherSide: boolean; content: string }
)

/** Loads a conflicted file for picking what to keep. */
export async function loadMergeConflict(repository: GitRepository, path: string): Promise<MergeConflict> {
  await requireConflicted(repository, path)
  const [{ base, ours, theirs }, sides] = await Promise.all([repository.conflictVersions(path), conflictSides(repository)])
  if ([base, ours, theirs].some((text) => text?.includes('\0'))) {
    throw new Error(`${path} is a binary file, so its lines cannot be picked`)
  }

  if (ours !== null && theirs !== null) {
    const merged = await repository.mergeTexts(base ?? '', ours, theirs, conflictMarkerSize)
    return { kind: 'text', path, sides, merged: parseConflictMarkers(merged) }
  }
  if (ours === null && theirs === null) throw new Error(`${path} was deleted on both sides; stage it to accept the deletion`)
  const presentIn = ours !== null ? 'ours' : 'theirs'
  return { kind: 'one-sided', path, sides, presentIn, deletedOnOtherSide: base !== null, content: (ours ?? theirs)! }
}

/** Saves the resolved text of a conflicted file and stages it; `null` resolves it by deleting the file. */
export async function resolveMergeConflict(repository: GitRepository, path: string, content: string | null): Promise<void> {
  await requireConflicted(repository, path)
  if (content === null) {
    await repository.remove([path])
    return
  }
  await repository.writeWorkingFile(path, content)
  await repository.stage([path])
}

/** Only conflicted files are read or written here, so a path can never point elsewhere in (or outside) the repository. */
async function requireConflicted(repository: GitRepository, path: string): Promise<void> {
  const { unstaged } = await repository.status()
  if (!unstaged.some((change) => change.path === path && change.status === 'conflicted')) {
    throw new Error(`${path} has no merge conflict`)
  }
}

async function conflictSides(repository: GitRepository): Promise<Record<MergeSide, ConflictSide>> {
  const [oursSha, theirsSha, currentBranch] = await Promise.all([repository.headCommit(), repository.incomingCommit(), repository.currentBranch()])
  const branchOf = (sha: string | null) => (sha ? repository.branchContaining(sha) : Promise.resolve(null))
  const [oursBranch, theirsBranch] = await Promise.all([currentBranch ?? branchOf(oursSha), branchOf(theirsSha)])
  return { ours: { sha: oursSha, branch: oursBranch }, theirs: { sha: theirsSha, branch: theirsBranch } }
}
