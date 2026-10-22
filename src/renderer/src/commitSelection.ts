import { rowKey, type GraphRow } from '../../domain/commitGraph'
import type { Commit } from '../../domain/entities'
import type { Selection } from './useRepositoryController'

export function selectionFor(row: GraphRow): Selection {
  if (row.kind === 'commit') return { kind: 'commit', sha: row.commit.sha }
  return row.kind === 'stash' ? { kind: 'stash', sha: row.stash.sha } : { kind: 'wip' }
}

/**
 * Shift-click: selects the commits from the one the range started at to `sha`. When both are on one
 * branch line, that line's commits are taken and other branches' commits shown in between (the graph
 * is sorted by date) are skipped; otherwise every commit row in between is, as file lists do.
 * Without a selected commit to start from, the clicked commit is simply selected.
 */
export function extendSelection(rows: readonly GraphRow[], selection: Selection, sha: string): Selection {
  const anchor = selection?.kind === 'commit' ? selection.sha : selection?.kind === 'commits' ? selection.anchor : null
  const commits = rows.flatMap((row) => (row.kind === 'commit' ? [row.commit] : []))
  const anchorIndex = commits.findIndex((commit) => commit.sha === anchor)
  const clickedIndex = commits.findIndex((commit) => commit.sha === sha)
  if (anchor === null || anchorIndex === -1 || clickedIndex === -1 || anchor === sha) return { kind: 'commit', sha }

  const [newer, older] = anchorIndex < clickedIndex ? [anchor, sha] : [sha, anchor]
  const shas =
    firstParentPath(commits, newer, older) ??
    commits.slice(Math.min(anchorIndex, clickedIndex), Math.max(anchorIndex, clickedIndex) + 1).map((commit) => commit.sha)
  return { kind: 'commits', anchor, shas }
}

/** The commits from `newer` down its first parents to `older`, newest first; null when `older` is not on that path. */
function firstParentPath(commits: readonly Commit[], newer: string, older: string): string[] | null {
  const bySha = new Map(commits.map((commit) => [commit.sha, commit]))
  const path: string[] = []
  for (let current = bySha.get(newer); current; current = bySha.get(current.parents[0])) {
    path.push(current.sha)
    if (current.sha === older) return path
  }
  return null
}

export function isSelected(selection: Selection, row: GraphRow): boolean {
  if (selection?.kind === 'commits') return row.kind === 'commit' && selection.shas.includes(row.commit.sha)
  return selection !== null && rowKey(row) === selectionKey(selection)
}

/** The {@link rowKey} of a single selected row. */
function selectionKey(selection: Exclude<Selection, null | { kind: 'commits' }>): string {
  if (selection.kind === 'commit') return selection.sha
  return selection.kind === 'stash' ? `stash:${selection.sha}` : 'work-in-progress'
}
