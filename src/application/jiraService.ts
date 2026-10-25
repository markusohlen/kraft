import {
  asIssueKey,
  issueSearchJql,
  myIssuesInStatusesJql,
  myOpenIssuesJql,
  statusIdsForColumns,
  type JiraBoard,
  type JiraBoardConfiguration,
  type JiraColumnFilter,
  type JiraIssue
} from '../domain/jira'
import { isLocalHttp } from '../domain/hostingProvider'
import type { JiraApi, JiraConnection, JiraSettingsInput, JiraSettingsView } from './jiraApi'

export interface JiraCredentials extends JiraConnection {
  token: string
}

export interface StoredJiraSettings extends JiraCredentials {
  userName: string
}

export interface JiraSettingsStore {
  load(): Promise<StoredJiraSettings | null>
  save(settings: StoredJiraSettings): Promise<void>
  clear(): Promise<void>
}

/** The Jira server, as seen by the use cases. */
export interface IssueTracker {
  /** Returns the display name of the signed-in user; fails when the credentials are rejected. */
  currentUserName(credentials: JiraCredentials): Promise<string>
  issue(credentials: JiraCredentials, key: string): Promise<JiraIssue | null>
  searchIssues(credentials: JiraCredentials, jql: string): Promise<JiraIssue[]>
  assignToCurrentUser(credentials: JiraCredentials, key: string): Promise<void>
  boards(credentials: JiraCredentials): Promise<JiraBoard[]>
  boardConfiguration(credentials: JiraCredentials, boardId: number): Promise<JiraBoardConfiguration>
}

/** Issues change rarely while you look at them; caching avoids a request every time a commit is selected. */
const issueCacheMs = 2 * 60 * 1000

export class JiraService implements JiraApi {
  private readonly issueCache = new Map<string, { issue: JiraIssue | null; fetchedAt: number }>()

  constructor(
    private readonly store: JiraSettingsStore,
    private readonly tracker: IssueTracker,
    private readonly now: () => number = Date.now
  ) {}

  async jiraSettings(): Promise<JiraSettingsView | null> {
    const stored = await this.store.load()
    return stored ? toView(stored) : null
  }

  async saveJiraSettings(input: JiraSettingsInput): Promise<JiraSettingsView> {
    const previous = await this.store.load()
    // A board id only means something on the site it came from.
    const columnFilter = previous && sameSite(previous.baseUrl, input.baseUrl) ? previous.columnFilter : null
    const credentials = validate({ ...input, columnFilter, token: input.token.trim() || previous?.token || '' })
    const userName = await this.tracker.currentUserName(credentials)
    const stored = { ...credentials, userName }
    await this.store.save(stored)
    this.issueCache.clear()
    return toView(stored)
  }

  async disconnectJira(): Promise<void> {
    await this.store.clear()
    this.issueCache.clear()
  }

  async jiraIssue(key: string): Promise<JiraIssue | null> {
    const cached = this.issueCache.get(key)
    if (cached && this.now() - cached.fetchedAt < issueCacheMs) return cached.issue
    const issue = await this.tracker.issue(await this.requireCredentials(), key)
    this.issueCache.set(key, { issue, fetchedAt: this.now() })
    return issue
  }

  async myOpenJiraIssues(): Promise<JiraIssue[]> {
    const credentials = await this.requireCredentials()
    const filter = credentials.columnFilter
    if (!filter) return this.tracker.searchIssues(credentials, myOpenIssuesJql)

    const board = await this.tracker.boardConfiguration(credentials, filter.boardId)
    const statusIds = statusIdsForColumns(board.columns, filter.columns)
    if (statusIds.length === 0) {
      throw new Error(`None of the chosen columns (${filter.columns.join(', ')}) are on board "${filter.boardName}" any more. Choose the columns again.`)
    }
    return this.tracker.searchIssues(credentials, myIssuesInStatusesJql(board.filterId, statusIds))
  }

  async searchJiraIssues(text: string): Promise<JiraIssue[]> {
    if (!text.trim()) return []
    const credentials = await this.requireCredentials()
    const key = asIssueKey(text)
    const [exactMatch, textMatches] = await Promise.all([
      key ? this.tracker.issue(credentials, key) : null,
      this.tracker.searchIssues(credentials, issueSearchJql(text, credentials.projectKeys))
    ])
    return exactMatch ? [exactMatch, ...textMatches.filter((issue) => issue.key !== exactMatch.key)] : textMatches
  }

  async assignJiraIssueToMe(key: string): Promise<void> {
    await this.tracker.assignToCurrentUser(await this.requireCredentials(), key)
    this.issueCache.delete(key)
  }

  async jiraBoards(): Promise<JiraBoard[]> {
    return this.tracker.boards(await this.requireCredentials())
  }

  async jiraBoardColumns(boardId: number): Promise<string[]> {
    const board = await this.tracker.boardConfiguration(await this.requireCredentials(), boardId)
    return board.columns.map((column) => column.name)
  }

  async saveJiraColumnFilter(filter: JiraColumnFilter | null): Promise<JiraSettingsView> {
    if (filter && filter.columns.length === 0) throw new Error('Choose at least one column')
    const stored = { ...(await this.requireCredentials()), columnFilter: filter }
    await this.store.save(stored)
    return toView(stored)
  }

  private async requireCredentials(): Promise<StoredJiraSettings> {
    const stored = await this.store.load()
    if (!stored) throw new Error('Jira is not connected. Connect it from the Jira section in the sidebar.')
    return stored
  }
}

function validate(credentials: JiraCredentials): JiraCredentials {
  const baseUrl = credentials.baseUrl.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error(`"${baseUrl}" is not a valid Jira address. Use e.g. https://your-site.atlassian.net`)
  }
  // The API token is sent on every request, so https is required; http would leak it to the network.
  // http is tolerated only for a local Jira (e.g. a dev instance on localhost) where there is no network hop.
  if (url.protocol !== 'https:' && !isLocalHttp(url)) {
    throw new Error('The Jira address must start with https:// (http is only allowed for localhost)')
  }
  const email = credentials.email.trim()
  if (credentials.deployment === 'cloud' && !email) throw new Error('Jira Cloud needs the email address you sign in with')
  if (!credentials.token) throw new Error('An API token is required')
  return { ...credentials, baseUrl, email }
}

function sameSite(savedBaseUrl: string, newBaseUrl: string): boolean {
  return savedBaseUrl === newBaseUrl.trim().replace(/\/+$/, '')
}

function toView({ baseUrl, deployment, email, projectKeys, columnFilter, userName }: StoredJiraSettings): JiraSettingsView {
  return { baseUrl, deployment, email, projectKeys, columnFilter, userName }
}
