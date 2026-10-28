import type { FileChange } from '../../domain/entities'

/** Whether the file's name, or its path from the repository root, starts with `query`, ignoring case. */
export function matchesFileFilter(path: string, query: string): boolean {
  const wanted = query.trim().toLowerCase()
  if (!wanted) return true
  const lowerPath = path.toLowerCase()
  const fileName = lowerPath.slice(lowerPath.lastIndexOf('/') + 1)
  return fileName.startsWith(wanted) || lowerPath.startsWith(wanted)
}

export function filterFileChanges(changes: FileChange[], query: string): FileChange[] {
  return query.trim() ? changes.filter((change) => matchesFileFilter(change.path, query)) : changes
}

/** "3" for an unfiltered list, "1 of 3" while a filter hides some of its files. */
export function shownCount(shown: FileChange[], all: FileChange[]): string {
  return shown.length === all.length ? String(all.length) : `${shown.length} of ${all.length}`
}

/** A key that starts filtering when pressed outside any text field: a printable character without shortcut modifiers. */
export function startsFileFilter(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey
}
