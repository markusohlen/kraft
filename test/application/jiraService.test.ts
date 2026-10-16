import { beforeEach, describe, expect, it } from 'vitest'
import type { JiraSettingsInput } from '../../src/application/jiraApi'
import {
  JiraService,
  type IssueTracker,
  type JiraCredentials,
  type JiraSettingsStore,
  type StoredJiraSettings
} from '../../src/application/jiraService'
import type { JiraBoardConfiguration, JiraIssue } from '../../src/domain/jira'

class MemoryJiraSettings implements JiraSettingsStore {
  settings: StoredJiraSettings | null = null
  async load() {
    return this.settings
  }
  async save(settings: StoredJiraSettings) {
    this.settings = settings
  }
  async clear() {
    this.settings = null
  }
}

const issue: JiraIssue = {
  key: 'KRA-1',
  summary: 'Fix login',
  status: 'In Progress',
  statusCategory: 'indeterminate',
  issueType: 'Bug',
  assignee: 'Ada',
  url: 'https://x.atlassian.net/browse/KRA-1'
}

class FakeTracker implements IssueTracker {
  validToken = 'secret'
  issueRequests = 0
  usedCredentials: JiraCredentials[] = []
  async currentUserName(credentials: JiraCredentials) {
    this.usedCredentials.push(credentials)
    if (credentials.token !== this.validToken) throw new Error('Jira rejected the sign-in (401).')
    return 'Ada Lovelace'
  }
  async issue(_credentials: JiraCredentials, key: string) {
    this.issueRequests++
    return key === issue.key ? issue : null
  }
  searchedJql: string[] = []
  assigned: string[] = []
  async searchIssues(_credentials: JiraCredentials, jql: string) {
    this.searchedJql.push(jql)
    return [issue, { ...issue, key: 'KRA-2' }]
  }
  async assignToCurrentUser(_credentials: JiraCredentials, key: string) {
    this.assigned.push(key)
  }
  board: JiraBoardConfiguration = {
    filterId: '10040',
    columns: [
      { name: 'To Do', statusIds: ['1'] },
      { name: 'In Progress', statusIds: ['3'] },
      { name: 'Review', statusIds: ['5', '3'] },
      { name: 'Done', statusIds: ['6'] }
    ]
  }
  async boards() {
    return [{ id: 7, name: 'KRA board', projectKey: 'KRA' }]
  }
  async boardConfiguration() {
    return this.board
  }
}

const cloudInput: JiraSettingsInput = {
  deployment: 'cloud',
  baseUrl: ' https://x.atlassian.net/ ',
  email: 'ada@example.com',
  token: 'secret',
  projectKeys: ['KRA']
}

describe('JiraService', () => {
  let store: MemoryJiraSettings
  let tracker: FakeTracker
  let now: number
  let service: JiraService

  beforeEach(() => {
    store = new MemoryJiraSettings()
    tracker = new FakeTracker()
    now = 0
    service = new JiraService(store, tracker, () => now)
  })

  it('verifies the connection, saves it and never exposes the token', async () => {
    const view = await service.saveJiraSettings(cloudInput)

    expect(view).toEqual({
      deployment: 'cloud',
      baseUrl: 'https://x.atlassian.net',
      email: 'ada@example.com',
      projectKeys: ['KRA'],
      columnFilter: null,
      userName: 'Ada Lovelace'
    })
    expect(store.settings?.token).toBe('secret')
    expect(await service.jiraSettings()).toEqual(view)
  })

  it('does not save credentials that Jira rejects', async () => {
    await expect(service.saveJiraSettings({ ...cloudInput, token: 'wrong' })).rejects.toThrow('401')
    expect(store.settings).toBeNull()
  })

  it('keeps the saved token when the token field is left empty', async () => {
    await service.saveJiraSettings(cloudInput)
    await service.saveJiraSettings({ ...cloudInput, token: '', projectKeys: ['WEB'] })

    expect(store.settings).toMatchObject({ token: 'secret', projectKeys: ['WEB'] })
  })

  it('rejects addresses and settings that cannot work', async () => {
    await expect(service.saveJiraSettings({ ...cloudInput, baseUrl: 'not a url' })).rejects.toThrow('not a valid Jira address')
    await expect(service.saveJiraSettings({ ...cloudInput, baseUrl: 'file:///etc' })).rejects.toThrow('https://')
    await expect(service.saveJiraSettings({ ...cloudInput, email: ' ' })).rejects.toThrow('email')
    await expect(service.saveJiraSettings({ ...cloudInput, token: '' })).rejects.toThrow('API token is required')
    expect(tracker.usedCredentials).toEqual([])
  })

  it('does not need an email for Jira Server', async () => {
    await service.saveJiraSettings({ ...cloudInput, deployment: 'server', email: '' })
    expect(store.settings?.deployment).toBe('server')
  })

  it('caches issues for a while and refetches them afterwards', async () => {
    await service.saveJiraSettings(cloudInput)

    expect(await service.jiraIssue('KRA-1')).toEqual(issue)
    expect(await service.jiraIssue('KRA-1')).toEqual(issue)
    expect(tracker.issueRequests).toBe(1)

    now += 3 * 60 * 1000
    await service.jiraIssue('KRA-1')
    expect(tracker.issueRequests).toBe(2)
  })

  it('puts an exact key match first when searching, without duplicating it', async () => {
    await service.saveJiraSettings(cloudInput)

    const found = await service.searchJiraIssues(' kra-1 ')

    expect(found.map((match) => match.key)).toEqual(['KRA-1', 'KRA-2'])
    expect(tracker.searchedJql).toEqual(['project in ("KRA") AND text ~ "kra-1" ORDER BY updated DESC'])
  })

  it('searches by text alone when the query is not a key, and not at all when it is empty', async () => {
    await service.saveJiraSettings(cloudInput)

    expect(await service.searchJiraIssues('   ')).toEqual([])
    await service.searchJiraIssues('login')
    expect(tracker.issueRequests).toBe(0)
    expect(tracker.searchedJql).toHaveLength(1)
  })

  it('assigns an issue and forgets its cached copy', async () => {
    await service.saveJiraSettings(cloudInput)
    await service.jiraIssue('KRA-1')

    await service.assignJiraIssueToMe('KRA-1')
    await service.jiraIssue('KRA-1')

    expect(tracker.assigned).toEqual(['KRA-1'])
    expect(tracker.issueRequests).toBe(2)
  })

  it('lists board columns and limits my issues to the chosen columns of that board', async () => {
    await service.saveJiraSettings(cloudInput)
    expect(await service.jiraBoardColumns(7)).toEqual(['To Do', 'In Progress', 'Review', 'Done'])

    const view = await service.saveJiraColumnFilter({ boardId: 7, boardName: 'KRA board', columns: ['In Progress', 'Review'] })
    await service.myOpenJiraIssues()

    expect(view.columnFilter?.columns).toEqual(['In Progress', 'Review'])
    expect(tracker.searchedJql).toEqual(['filter = 10040 AND assignee = currentUser() AND status in (3, 5) ORDER BY updated DESC'])
  })

  it('does not filter search results by column', async () => {
    await service.saveJiraSettings(cloudInput)
    await service.saveJiraColumnFilter({ boardId: 7, boardName: 'KRA board', columns: ['In Progress'] })

    await service.searchJiraIssues('login')

    expect(tracker.searchedJql[0]).not.toContain('status in')
  })

  it('explains when the chosen columns have disappeared from the board', async () => {
    await service.saveJiraSettings(cloudInput)
    await service.saveJiraColumnFilter({ boardId: 7, boardName: 'KRA board', columns: ['Testing'] })

    await expect(service.myOpenJiraIssues()).rejects.toThrow('None of the chosen columns (Testing) are on board "KRA board"')
  })

  it('needs at least one column, and shows all open issues again when the filter is cleared', async () => {
    await service.saveJiraSettings(cloudInput)
    await expect(service.saveJiraColumnFilter({ boardId: 7, boardName: 'KRA board', columns: [] })).rejects.toThrow('at least one column')

    await service.saveJiraColumnFilter({ boardId: 7, boardName: 'KRA board', columns: ['Review'] })
    await service.saveJiraColumnFilter(null)
    await service.myOpenJiraIssues()

    expect(tracker.searchedJql[0]).toContain('statusCategory != Done')
  })

  it('keeps the column filter when the connection is edited, but not when the site changes', async () => {
    await service.saveJiraSettings(cloudInput)
    await service.saveJiraColumnFilter({ boardId: 7, boardName: 'KRA board', columns: ['Review'] })

    await service.saveJiraSettings({ ...cloudInput, token: '' })
    expect(store.settings?.columnFilter?.boardId).toBe(7)

    await service.saveJiraSettings({ ...cloudInput, baseUrl: 'https://other.atlassian.net' })
    expect(store.settings?.columnFilter).toBeNull()
  })

  it('fails with a clear message until Jira is connected, and again after disconnecting', async () => {
    await expect(service.myOpenJiraIssues()).rejects.toThrow('Jira is not connected')

    await service.saveJiraSettings(cloudInput)
    expect((await service.myOpenJiraIssues()).map((found) => found.key)).toEqual(['KRA-1', 'KRA-2'])
    expect(tracker.searchedJql[0]).toContain('assignee = currentUser()')

    await service.disconnectJira()
    expect(await service.jiraSettings()).toBeNull()
    await expect(service.jiraIssue('KRA-1')).rejects.toThrow('Jira is not connected')
  })
})
