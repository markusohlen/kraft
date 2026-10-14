import type { Branch, Commit, FileChange, FileChangeStatus, RefLabel, Stash, WorkingTreeStatus } from '../domain/entities'

const fieldSeparator = '\x1f'
const recordSeparator = '\x1e'

/** `git log` format matching {@link parseLog}; use together with `--decorate=full`. */
export const logFormat = ['%H', '%P', '%an', '%ae', '%aI', '%s', '%D'].join('%x1f') + '%x1e'

export function parseLog(output: string): Commit[] {
  return output
    .split(recordSeparator)
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha, parents, authorName, authorEmail, date, subject, decorations] = record.split(fieldSeparator)
      return {
        sha,
        parents: parents ? parents.split(' ') : [],
        authorName,
        authorEmail,
        date,
        subject,
        refs: parseDecorations(decorations ?? '')
      }
    })
}

/** Parses full-name decorations, e.g. `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1`. */
export function parseDecorations(decorations: string): RefLabel[] {
  return decorations
    .split(', ')
    .filter(Boolean)
    .flatMap((decoration): RefLabel[] => {
      if (decoration === 'HEAD') return [{ name: 'HEAD', kind: 'head' }]
      if (decoration.startsWith('HEAD -> ')) {
        return [{ name: stripPrefix(decoration.slice('HEAD -> '.length), 'refs/heads/'), kind: 'head' }]
      }
      if (decoration.startsWith('tag: ')) return [{ name: stripPrefix(decoration.slice(5), 'refs/tags/'), kind: 'tag' }]
      if (decoration.startsWith('refs/heads/')) return [{ name: stripPrefix(decoration, 'refs/heads/'), kind: 'local' }]
      if (decoration.startsWith('refs/remotes/') && !decoration.endsWith('/HEAD')) {
        return [{ name: stripPrefix(decoration, 'refs/remotes/'), kind: 'remote' }]
      }
      return []
    })
}

/** Parses `git status --porcelain=v1 -z`. */
export function parseStatus(output: string): WorkingTreeStatus {
  const status: WorkingTreeStatus = { staged: [], unstaged: [] }
  const entries = output.split('\0')
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    if (entry.length < 4) continue
    const [indexCode, workTreeCode, path] = [entry[0], entry[1], entry.slice(3)]
    const oldPath = indexCode === 'R' || indexCode === 'C' ? entries[++index] : null

    if (indexCode === '!') continue
    if (indexCode === '?') {
      status.unstaged.push({ path, oldPath: null, status: 'untracked' })
    } else if (isConflict(indexCode, workTreeCode)) {
      status.unstaged.push({ path, oldPath: null, status: 'conflicted' })
    } else {
      if (indexCode !== ' ') status.staged.push({ path, oldPath, status: statusFromCode(indexCode) })
      if (workTreeCode !== ' ') status.unstaged.push({ path, oldPath: null, status: statusFromCode(workTreeCode) })
    }
  }
  return status
}

/** Parses `git diff --name-status -z`, where renames are `R<score>\0old\0new`. */
export function parseNameStatus(output: string): FileChange[] {
  const tokens = output.split('\0').filter(Boolean)
  const changes: FileChange[] = []
  for (let index = 0; index < tokens.length; index++) {
    const code = tokens[index][0]
    if (code === 'R' || code === 'C') {
      const oldPath = tokens[++index]
      changes.push({ path: tokens[++index], oldPath: code === 'R' ? oldPath : null, status: statusFromCode(code) })
    } else {
      changes.push({ path: tokens[++index], oldPath: null, status: statusFromCode(code) })
    }
  }
  return changes
}

/** Format for `git for-each-ref refs/heads` matching {@link parseBranches}. */
export const branchFormat = ['%(refname:short)', '%(objectname)', '%(HEAD)', '%(upstream:short)', '%(upstream:track,nobracket)'].join(
  '%1f'
)

export function parseBranches(output: string): Branch[] {
  return lines(output).map((line) => {
    const [name, sha, head, upstream, track] = line.split(fieldSeparator)
    return {
      name,
      sha,
      isCurrent: head === '*',
      upstream: upstream || null,
      ahead: trackCount(track, 'ahead'),
      behind: trackCount(track, 'behind')
    }
  })
}

/** Format for `git stash list` matching {@link parseStashes}. */
export const stashFormat = ['%gd', '%H', '%gs'].join('%x1f')

export function parseStashes(output: string): Stash[] {
  return lines(output).map((line) => {
    const [selector, sha, message] = line.split(fieldSeparator)
    return { index: Number(/\{(\d+)\}/.exec(selector)?.[1] ?? 0), sha, message }
  })
}

export function lines(output: string): string[] {
  return output.split(/\r?\n/).filter(Boolean)
}

function trackCount(track: string | undefined, direction: 'ahead' | 'behind'): number {
  const match = new RegExp(`${direction} (\\d+)`).exec(track ?? '')
  return match ? Number(match[1]) : 0
}

function isConflict(indexCode: string, workTreeCode: string): boolean {
  return indexCode === 'U' || workTreeCode === 'U' || (indexCode === workTreeCode && (indexCode === 'A' || indexCode === 'D'))
}

function statusFromCode(code: string): FileChangeStatus {
  switch (code) {
    case 'A':
    case 'C':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case '?':
      return 'untracked'
    case 'U':
      return 'conflicted'
    default:
      return 'modified'
  }
}

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}
