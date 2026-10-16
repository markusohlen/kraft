export type JiraStatusCategory = 'new' | 'indeterminate' | 'done'

export interface JiraIssue {
  key: string
  summary: string
  status: string
  statusCategory: JiraStatusCategory
  issueType: string
  assignee: string | null
  url: string
}

/** A piece of text that is either plain or a Jira issue key, e.g. `KRA-12`. */
export interface IssueTextPart {
  text: string
  issueKey: string | null
}

/** Jira keys are an upper-case project key of at least two characters, a dash and an issue number. */
const issueKeyPattern = /(?<![A-Za-z0-9])([A-Z][A-Z0-9_]+)-([1-9][0-9]*)(?![A-Za-z0-9])/g

const maxBranchSlugLength = 40

/**
 * Splits text around Jira issue keys. With `projectKeys`, only keys of those projects count,
 * so that text like `UTF-8` or `ISO-8601` is not mistaken for an issue.
 */
export function splitByIssueKeys(text: string, projectKeys: readonly string[] = []): IssueTextPart[] {
  const allowedProjects = new Set(projectKeys.map((key) => key.toUpperCase()))
  const parts: IssueTextPart[] = []
  let plainStart = 0
  for (const match of text.matchAll(issueKeyPattern)) {
    if (allowedProjects.size > 0 && !allowedProjects.has(match[1])) continue
    const start = match.index ?? 0
    if (start > plainStart) parts.push({ text: text.slice(plainStart, start), issueKey: null })
    parts.push({ text: match[0], issueKey: match[0] })
    plainStart = start + match[0].length
  }
  if (plainStart < text.length) parts.push({ text: text.slice(plainStart), issueKey: null })
  return parts
}

/** The distinct issue keys in `text`, in order of appearance. */
export function findIssueKeys(text: string, projectKeys: readonly string[] = []): string[] {
  const keys = splitByIssueKeys(text, projectKeys).flatMap((part) => (part.issueKey ? [part.issueKey] : []))
  return [...new Set(keys)]
}

/** A branch name like `KRA-12-fix-login-timeout`, which keeps the key so the branch links back to its issue. */
export function issueBranchName(issue: Pick<JiraIssue, 'key' | 'summary'>): string {
  const slug = issue.summary
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const shortened = slug.length <= maxBranchSlugLength ? slug : slug.slice(0, maxBranchSlugLength).replace(/-[^-]*$/, '')
  return shortened ? `${issue.key}-${shortened}` : issue.key
}

export function issueUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(key)}`
}

/** Splits user input like `KRA, web` into upper-case project keys. */
export function parseProjectKeys(input: string): string[] {
  return [...new Set(input.split(/[\s,;]+/).map((key) => key.trim().toUpperCase()).filter(Boolean))]
}

export interface JiraBoard {
  id: number
  name: string
  projectKey: string | null
}

/** A board column; each column shows the issues in one or more statuses. */
export interface JiraBoardColumn {
  name: string
  statusIds: string[]
}

export interface JiraBoardConfiguration {
  /** The saved filter that decides which issues are on the board. */
  filterId: string
  columns: JiraBoardColumn[]
}

/** Which board columns the "assigned to me" list shows. */
export interface JiraColumnFilter {
  boardId: number
  boardName: string
  columns: string[]
}

/** The status ids behind the chosen columns; columns that no longer exist on the board are skipped. */
export function statusIdsForColumns(columns: readonly JiraBoardColumn[], chosenColumns: readonly string[]): string[] {
  const chosen = new Set(chosenColumns)
  return [...new Set(columns.filter((column) => chosen.has(column.name)).flatMap((column) => column.statusIds))]
}

/** Issues assigned to the signed-in user on a board, limited to the given statuses. */
export function myIssuesInStatusesJql(boardFilterId: string, statusIds: readonly string[]): string {
  // Both values come from Jira, but only plain ids may reach the query.
  const numericIds = statusIds.filter((id) => /^\d+$/.test(id))
  if (!/^\d+$/.test(boardFilterId) || numericIds.length === 0) throw new Error('The board has no usable filter or statuses')
  return `filter = ${boardFilterId} AND assignee = currentUser() AND status in (${numericIds.join(', ')}) ORDER BY updated DESC`
}

/** Open issues assigned to the signed-in user, most recently updated first. */
export const myOpenIssuesJql = 'assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC'

/**
 * JQL that finds issues by free text, limited to `projectKeys` when given.
 * Exact keys are looked up separately because JQL fails on `key = X` when X does not exist.
 */
export function issueSearchJql(text: string, projectKeys: readonly string[] = []): string {
  const escaped = text.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const projectFilter = projectKeys.length > 0 ? `project in (${projectKeys.map((key) => `"${key}"`).join(', ')}) AND ` : ''
  return `${projectFilter}text ~ "${escaped}" ORDER BY updated DESC`
}

/** The query itself when it is a single issue key, e.g. `kra-12` → `KRA-12`. */
export function asIssueKey(text: string): string | null {
  const candidate = text.trim().toUpperCase()
  const [onlyPart, ...otherParts] = splitByIssueKeys(candidate)
  return onlyPart?.issueKey && otherParts.length === 0 ? onlyPart.issueKey : null
}
