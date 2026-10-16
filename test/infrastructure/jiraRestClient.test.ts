import { describe, expect, it } from 'vitest'
import type { JiraCredentials } from '../../src/application/jiraService'
import { JiraRestClient } from '../../src/infrastructure/jiraRestClient'

const cloud: JiraCredentials = {
  deployment: 'cloud',
  baseUrl: 'https://x.atlassian.net',
  email: 'ada@example.com',
  token: 'secret',
  projectKeys: [],
  columnFilter: null
}
const server: JiraCredentials = { ...cloud, deployment: 'server', baseUrl: 'https://jira.corp.example/jira', email: '' }

const issueBody = {
  key: 'KRA-1',
  fields: {
    summary: 'Fix login',
    status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    issuetype: { name: 'Bug' },
    assignee: { displayName: 'Ada' }
  }
}

function recordingFetch(status: number, body: unknown) {
  const requests: { url: string; method: string; headers: Record<string, string>; body: unknown }[] = []
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined
    })
    return new Response(JSON.stringify(body), { status, statusText: status === 200 ? 'OK' : 'Error' })
  }
  return { requests, fetchFn: fetchFn as typeof fetch }
}

describe('JiraRestClient', () => {
  it('uses REST v3 with basic auth on Jira Cloud and maps the issue', async () => {
    const { requests, fetchFn } = recordingFetch(200, issueBody)

    const issue = await new JiraRestClient(fetchFn).issue(cloud, 'KRA-1')

    expect(requests[0].url).toBe('https://x.atlassian.net/rest/api/3/issue/KRA-1?fields=summary,status,issuetype,assignee')
    expect(requests[0].headers.Authorization).toBe(`Basic ${Buffer.from('ada@example.com:secret').toString('base64')}`)
    expect(issue).toEqual({
      key: 'KRA-1',
      summary: 'Fix login',
      status: 'In Progress',
      statusCategory: 'indeterminate',
      issueType: 'Bug',
      assignee: 'Ada',
      url: 'https://x.atlassian.net/browse/KRA-1'
    })
  })

  it('uses REST v2 with a bearer token on Jira Server', async () => {
    const { requests, fetchFn } = recordingFetch(200, { issues: [issueBody] })

    const issues = await new JiraRestClient(fetchFn).searchIssues(server, 'assignee = currentUser()')

    expect(requests[0].url).toMatch(/^https:\/\/jira\.corp\.example\/jira\/rest\/api\/2\/search\?jql=/)
    expect(requests[0].headers.Authorization).toBe('Bearer secret')
    expect(issues.map((issue) => issue.url)).toEqual(['https://jira.corp.example/jira/browse/KRA-1'])
  })

  it('searches with the /search/jql endpoint on Jira Cloud', async () => {
    const { requests, fetchFn } = recordingFetch(200, { issues: [] })

    await new JiraRestClient(fetchFn).searchIssues(cloud, 'text ~ "login"')

    const url = new URL(requests[0].url)
    expect(url.pathname).toBe('/rest/api/3/search/jql')
    expect(url.searchParams.get('jql')).toBe('text ~ "login"')
  })

  it('assigns by accountId on Jira Cloud and by user name on Jira Server', async () => {
    const user = { displayName: 'Ada', accountId: 'acc-1', name: 'ada' }
    const onCloud = recordingFetch(200, user)
    await new JiraRestClient(onCloud.fetchFn).assignToCurrentUser(cloud, 'KRA-1')
    expect(onCloud.requests[1]).toMatchObject({
      method: 'PUT',
      url: 'https://x.atlassian.net/rest/api/3/issue/KRA-1/assignee',
      body: { accountId: 'acc-1' }
    })

    const onServer = recordingFetch(200, user)
    await new JiraRestClient(onServer.fetchFn).assignToCurrentUser(server, 'KRA-1')
    expect(onServer.requests[1]).toMatchObject({ method: 'PUT', body: { name: 'ada' } })
  })

  it('reads boards page by page from the Agile API', async () => {
    const pages = [
      { values: [{ id: 2, name: 'Web', location: { projectKey: 'WEB' } }], isLast: false },
      { values: [{ id: 1, name: 'Api' }], isLast: true }
    ]
    const urls: string[] = []
    const fetchFn = (async (input: string | URL | Request) => {
      urls.push(String(input))
      return new Response(JSON.stringify(pages[urls.length - 1]))
    }) as typeof fetch

    const boards = await new JiraRestClient(fetchFn).boards(cloud)

    expect(urls[0]).toBe('https://x.atlassian.net/rest/agile/1.0/board?startAt=0&maxResults=50')
    expect(urls[1]).toContain('startAt=1')
    expect(boards).toEqual([
      { id: 1, name: 'Api', projectKey: null },
      { id: 2, name: 'Web', projectKey: 'WEB' }
    ])
  })

  it('maps a board configuration to its filter and the statuses of each column', async () => {
    const { requests, fetchFn } = recordingFetch(200, {
      filter: { id: 10040 },
      columnConfig: { columns: [{ name: 'To Do', statuses: [{ id: '1' }] }, { name: 'In Progress', statuses: [{ id: '3' }, { id: '4' }] }] }
    })

    const board = await new JiraRestClient(fetchFn).boardConfiguration(server, 7)

    expect(requests[0].url).toBe('https://jira.corp.example/jira/rest/agile/1.0/board/7/configuration')
    expect(board).toEqual({
      filterId: '10040',
      columns: [
        { name: 'To Do', statusIds: ['1'] },
        { name: 'In Progress', statusIds: ['3', '4'] }
      ]
    })
  })

  it('returns null for a missing issue', async () => {
    const { fetchFn } = recordingFetch(404, { errorMessages: ['Issue does not exist'] })
    expect(await new JiraRestClient(fetchFn).issue(cloud, 'KRA-404')).toBeNull()
  })

  it('explains rejected credentials and other failures', async () => {
    await expect(new JiraRestClient(recordingFetch(401, {}).fetchFn).currentUserName(cloud)).rejects.toThrow('Check the email and API token')
    await expect(
      new JiraRestClient(recordingFetch(400, { errorMessages: ['Bad JQL'] }).fetchFn).searchIssues(cloud, 'bad')
    ).rejects.toThrow('400 Error – Bad JQL')
  })

  it('reports when Jira cannot be reached', async () => {
    const failingFetch = (async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }) as typeof fetch
    await expect(new JiraRestClient(failingFetch).currentUserName(cloud)).rejects.toThrow('Could not reach Jira at https://x.atlassian.net')
  })
})
