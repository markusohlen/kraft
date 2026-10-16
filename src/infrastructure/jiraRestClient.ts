import type { IssueTracker, JiraCredentials } from '../application/jiraService'
import { issueUrl, type JiraBoard, type JiraBoardConfiguration, type JiraIssue, type JiraStatusCategory } from '../domain/jira'

type Fetch = typeof fetch

const issueFields = 'summary,status,issuetype,assignee'
const maxSearchResults = 50
const requestTimeoutMs = 15000
/** Stops paging through boards on very large sites; the picker is unusable beyond this anyway. */
const maxBoards = 500

/** The REST API for issues and users, and the Agile API for boards (the same on Cloud and Server). */
type ApiRoot = 'platform' | 'agile'

interface BoardPage {
  values?: { id: number; name: string; location?: { projectKey?: string } }[]
  isLast?: boolean
}

interface BoardConfigurationResponse {
  filter?: { id?: string | number }
  columnConfig?: { columns?: { name: string; statuses?: { id: string }[] }[] }
}

/** Jira Cloud identifies users by accountId; Server/Data Center by user name. */
interface UserResponse {
  displayName?: string
  accountId?: string
  name?: string
}

interface IssueResponse {
  key: string
  fields: {
    summary?: string
    status?: { name?: string; statusCategory?: { key?: string } }
    issuetype?: { name?: string }
    assignee?: { displayName?: string } | null
  }
}

/** Talks to the Jira REST API: v3 on Jira Cloud, v2 on Server/Data Center. */
export class JiraRestClient implements IssueTracker {
  constructor(private readonly fetchFn: Fetch = (input, init) => fetch(input, init)) {}

  async currentUserName(credentials: JiraCredentials): Promise<string> {
    const user = await this.currentUser(credentials)
    return user.displayName ?? user.name ?? credentials.email
  }

  async issue(credentials: JiraCredentials, key: string): Promise<JiraIssue | null> {
    const path = `/issue/${encodeURIComponent(key)}?fields=${issueFields}`
    const response = await this.request(credentials, 'GET', path, { notFoundIsNull: true })
    return response ? toIssue(credentials.baseUrl, response as IssueResponse) : null
  }

  async searchIssues(credentials: JiraCredentials, jql: string): Promise<JiraIssue[]> {
    // Jira Cloud replaced /search with /search/jql; Server/Data Center only has /search.
    const searchPath = credentials.deployment === 'cloud' ? '/search/jql' : '/search'
    const query = new URLSearchParams({ jql, fields: issueFields, maxResults: String(maxSearchResults) })
    const result = (await this.request(credentials, 'GET', `${searchPath}?${query}`)) as { issues?: IssueResponse[] }
    return (result.issues ?? []).map((issue) => toIssue(credentials.baseUrl, issue))
  }

  async assignToCurrentUser(credentials: JiraCredentials, key: string): Promise<void> {
    const user = await this.currentUser(credentials)
    const assignee = credentials.deployment === 'cloud' ? { accountId: user.accountId } : { name: user.name }
    await this.request(credentials, 'PUT', `/issue/${encodeURIComponent(key)}/assignee`, { body: assignee })
  }

  async boards(credentials: JiraCredentials): Promise<JiraBoard[]> {
    const boards: JiraBoard[] = []
    for (let startAt = 0; startAt < maxBoards; ) {
      const query = new URLSearchParams({ startAt: String(startAt), maxResults: '50' })
      const page = (await this.request(credentials, 'GET', `/board?${query}`, { root: 'agile' })) as BoardPage
      const values = page.values ?? []
      boards.push(...values.map((board) => ({ id: board.id, name: board.name, projectKey: board.location?.projectKey ?? null })))
      if (page.isLast !== false || values.length === 0) break
      startAt += values.length
    }
    return boards.sort((a, b) => a.name.localeCompare(b.name))
  }

  async boardConfiguration(credentials: JiraCredentials, boardId: number): Promise<JiraBoardConfiguration> {
    const path = `/board/${encodeURIComponent(String(boardId))}/configuration`
    const config = (await this.request(credentials, 'GET', path, { root: 'agile' })) as BoardConfigurationResponse
    return {
      filterId: String(config.filter?.id ?? ''),
      columns: (config.columnConfig?.columns ?? []).map((column) => ({
        name: column.name,
        statusIds: (column.statuses ?? []).map((status) => String(status.id))
      }))
    }
  }

  private async currentUser(credentials: JiraCredentials): Promise<UserResponse> {
    return (await this.request(credentials, 'GET', '/myself')) as UserResponse
  }

  private async request(
    credentials: JiraCredentials,
    method: 'GET' | 'PUT',
    path: string,
    options: { body?: unknown; notFoundIsNull?: boolean; root?: ApiRoot } = {}
  ): Promise<unknown> {
    const apiRoot = options.root === 'agile' ? '/rest/agile/1.0' : credentials.deployment === 'cloud' ? '/rest/api/3' : '/rest/api/2'
    const headers: Record<string, string> = { Accept: 'application/json', Authorization: authorizationHeader(credentials) }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    let response: Response
    try {
      response = await this.fetchFn(`${credentials.baseUrl}${apiRoot}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(requestTimeoutMs)
      })
    } catch (error) {
      throw new Error(`Could not reach Jira at ${credentials.baseUrl}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (response.status === 404 && options.notFoundIsNull) return null
    if (!response.ok) throw new Error(await describeFailure(response))
    // Updates such as assigning answer 204 No Content.
    return response.status === 204 ? null : response.json()
  }
}

function authorizationHeader({ deployment, email, token }: JiraCredentials): string {
  return deployment === 'cloud' ? `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}` : `Bearer ${token}`
}

async function describeFailure(response: Response): Promise<string> {
  if (response.status === 401) return 'Jira rejected the sign-in (401). Check the email and API token.'
  if (response.status === 403) return 'Jira denied access (403). The account may lack permission, or a CAPTCHA login is required.'
  let details = ''
  try {
    const body = (await response.json()) as { errorMessages?: string[] }
    details = body.errorMessages?.join(' ') ?? ''
  } catch {
    // Not every error response has a JSON body; the status line alone is still useful.
  }
  return `Jira request failed: ${response.status} ${response.statusText}${details ? ` – ${details}` : ''}`
}

function toIssue(baseUrl: string, { key, fields }: IssueResponse): JiraIssue {
  return {
    key,
    summary: fields.summary ?? '',
    status: fields.status?.name ?? 'Unknown',
    statusCategory: toStatusCategory(fields.status?.statusCategory?.key),
    issueType: fields.issuetype?.name ?? 'Issue',
    assignee: fields.assignee?.displayName ?? null,
    url: issueUrl(baseUrl, key)
  }
}

function toStatusCategory(key: string | undefined): JiraStatusCategory {
  return key === 'done' || key === 'indeterminate' ? key : 'new'
}
