import type { Commit } from '../domain/entities'
import type { GitRepository } from './ports'

/** More matches than anyone steps through; a word found in most commits must not load the whole history. */
const maximumMatches = 500

export interface HistorySearchResult {
  /** Newest first. */
  matches: Commit[]
  /** Whether there may be more matches than `matches` holds. */
  truncated: boolean
}

/** Finds the commits whose message or author contains `query`, ignoring case, or whose sha starts with it, on every branch. */
export async function searchHistory(repository: GitRepository, query: string): Promise<HistorySearchResult> {
  const text = query.trim()
  if (!text) return { matches: [], truncated: false }
  const [bySha, byMessage, byAuthor] = await Promise.all([
    repository.findCommit(text),
    repository.searchCommits('message', text, maximumMatches),
    repository.searchCommits('author', text, maximumMatches)
  ])
  const unique = new Map([...(bySha ? [bySha] : []), ...byMessage, ...byAuthor].map((commit) => [commit.sha, commit]))
  const newestFirst = [...unique.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  return {
    matches: newestFirst.slice(0, maximumMatches),
    truncated: unique.size > maximumMatches || byMessage.length === maximumMatches || byAuthor.length === maximumMatches
  }
}
