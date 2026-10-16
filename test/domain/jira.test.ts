import { describe, expect, it } from 'vitest'
import {
  asIssueKey,
  findIssueKeys,
  issueBranchName,
  issueSearchJql,
  issueUrl,
  myIssuesInStatusesJql,
  parseProjectKeys,
  splitByIssueKeys,
  statusIdsForColumns
} from '../../src/domain/jira'

describe('Jira issue keys', () => {
  it('finds keys in branch names and commit messages, once each and in order', () => {
    expect(findIssueKeys('feature/KRA-12-login')).toEqual(['KRA-12'])
    expect(findIssueKeys('WEB-3: fix KRA-12 and KRA-12 again')).toEqual(['WEB-3', 'KRA-12'])
  })

  it('ignores lower-case text, single-letter projects and keys glued to other words', () => {
    expect(findIssueKeys('kra-12 A-1 XKRA-12a KRA-0')).toEqual([])
  })

  it('only recognises the configured projects when project keys are given', () => {
    expect(findIssueKeys('Use UTF-8 for KRA-7', ['kra'])).toEqual(['KRA-7'])
    expect(findIssueKeys('Use UTF-8 for KRA-7')).toEqual(['UTF-8', 'KRA-7'])
  })

  it('splits text around keys so the keys can become links', () => {
    expect(splitByIssueKeys('Fix KRA-1 now')).toEqual([
      { text: 'Fix ', issueKey: null },
      { text: 'KRA-1', issueKey: 'KRA-1' },
      { text: ' now', issueKey: null }
    ])
    expect(splitByIssueKeys('no keys')).toEqual([{ text: 'no keys', issueKey: null }])
  })
})

describe('issue branch names', () => {
  it('keeps the key and turns the summary into a short slug', () => {
    expect(issueBranchName({ key: 'KRA-12', summary: 'Fix login timeout!' })).toBe('KRA-12-fix-login-timeout')
    expect(issueBranchName({ key: 'KRA-13', summary: 'Ändra språk på Översikt' })).toBe('KRA-13-andra-sprak-pa-oversikt')
  })

  it('cuts long summaries at a word boundary', () => {
    const name = issueBranchName({ key: 'KRA-1', summary: 'Make the commit graph render much faster for very large repositories' })
    expect(name).toBe('KRA-1-make-the-commit-graph-render-much')
  })

  it('falls back to the key when the summary has no usable characters', () => {
    expect(issueBranchName({ key: 'KRA-2', summary: '???' })).toBe('KRA-2')
  })
})

describe('Jira search', () => {
  it('searches text, escaping quotes and backslashes', () => {
    expect(issueSearchJql(' say "hi" \\ ')).toBe('text ~ "say \\"hi\\" \\\\" ORDER BY updated DESC')
  })

  it('limits the search to the configured projects', () => {
    expect(issueSearchJql('login', ['KRA', 'WEB'])).toBe('project in ("KRA", "WEB") AND text ~ "login" ORDER BY updated DESC')
  })

  it('recognises a query that is exactly one issue key', () => {
    expect(asIssueKey(' kra-12 ')).toBe('KRA-12')
    expect(asIssueKey('KRA-12 login')).toBeNull()
    expect(asIssueKey('login')).toBeNull()
  })
})

describe('Jira board columns', () => {
  const columns = [
    { name: 'To Do', statusIds: ['1'] },
    { name: 'In Progress', statusIds: ['3', '4'] },
    { name: 'Review', statusIds: ['4', '5'] }
  ]

  it('collects the distinct statuses of the chosen columns and skips unknown ones', () => {
    expect(statusIdsForColumns(columns, ['In Progress', 'Review', 'Gone'])).toEqual(['3', '4', '5'])
    expect(statusIdsForColumns(columns, ['Gone'])).toEqual([])
  })

  it('queries my issues on the board in those statuses', () => {
    expect(myIssuesInStatusesJql('10040', ['3', '5'])).toBe(
      'filter = 10040 AND assignee = currentUser() AND status in (3, 5) ORDER BY updated DESC'
    )
  })

  it('refuses anything but numeric ids in the query', () => {
    expect(myIssuesInStatusesJql('1', ['3', '1) OR (1=1'])).toContain('status in (3)')
    expect(() => myIssuesInStatusesJql('1 OR 1=1', ['3'])).toThrow()
    expect(() => myIssuesInStatusesJql('1', ['x'])).toThrow()
  })
})

describe('Jira helpers', () => {
  it('builds browse links regardless of a trailing slash', () => {
    expect(issueUrl('https://x.atlassian.net/', 'KRA-1')).toBe('https://x.atlassian.net/browse/KRA-1')
  })

  it('parses project keys from free text', () => {
    expect(parseProjectKeys(' kra, WEB;kra  ops ')).toEqual(['KRA', 'WEB', 'OPS'])
    expect(parseProjectKeys('')).toEqual([])
  })
})
