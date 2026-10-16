export type RefKind = 'head' | 'local' | 'remote' | 'tag'

export interface RefLabel {
  name: string
  kind: RefKind
}

export interface Commit {
  sha: string
  parents: string[]
  authorName: string
  authorEmail: string
  /** ISO 8601 author date. */
  date: string
  subject: string
  refs: RefLabel[]
}

export interface Branch {
  name: string
  sha: string
  isCurrent: boolean
  upstream: string | null
  ahead: number
  behind: number
}

export interface Stash {
  /** Position in the stash list; `stash@{index}`. */
  index: number
  sha: string
  message: string
  /** The commit the changes were stashed from (HEAD at the time). */
  baseSha: string
  /** ISO 8601 date the stash was made. */
  date: string
}

export type FileChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

export interface FileChange {
  path: string
  /** Set for renames: the path the file was renamed from. */
  oldPath: string | null
  status: FileChangeStatus
}

export interface WorkingTreeStatus {
  staged: FileChange[]
  unstaged: FileChange[]
}

export function hasUncommittedChanges(status: WorkingTreeStatus): boolean {
  return status.staged.length > 0 || status.unstaged.length > 0
}

export function hasConflicts(status: WorkingTreeStatus): boolean {
  return [...status.staged, ...status.unstaged].some((change) => change.status === 'conflicted')
}
