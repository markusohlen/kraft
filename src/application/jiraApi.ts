import type { JiraBoard, JiraColumnFilter, JiraIssue } from '../domain/jira'

/** Jira Cloud signs in with email + API token; Server/Data Center with a personal access token. */
export type JiraDeployment = 'cloud' | 'server'

export interface JiraConnection {
  baseUrl: string
  deployment: JiraDeployment
  /** Only used by Jira Cloud. */
  email: string
  /** When set, only issue keys of these projects are recognised in branch names and commit messages. */
  projectKeys: string[]
  /** When set, "assigned to me" only shows issues in these columns of this board. */
  columnFilter: JiraColumnFilter | null
}

/** What the user interface may see of the connection; the token never leaves the main process. */
export interface JiraSettingsView extends JiraConnection {
  userName: string
}

/** The column filter is chosen separately, with `saveJiraColumnFilter`. */
export interface JiraSettingsInput extends Omit<JiraConnection, 'columnFilter'> {
  /** Empty keeps the token that is already saved. */
  token: string
}

/** Jira operations the user interface can request. */
export interface JiraApi {
  jiraSettings(): Promise<JiraSettingsView | null>
  /** Verifies the connection with Jira before saving it. */
  saveJiraSettings(input: JiraSettingsInput): Promise<JiraSettingsView>
  disconnectJira(): Promise<void>
  /** Null when the issue does not exist or is not visible to the signed-in user. */
  jiraIssue(key: string): Promise<JiraIssue | null>
  myOpenJiraIssues(): Promise<JiraIssue[]>
  /** Finds issues by key or free text; an exact key match comes first. */
  searchJiraIssues(text: string): Promise<JiraIssue[]>
  assignJiraIssueToMe(key: string): Promise<void>
  jiraBoards(): Promise<JiraBoard[]>
  jiraBoardColumns(boardId: number): Promise<string[]>
  /** Null shows all open issues again. */
  saveJiraColumnFilter(filter: JiraColumnFilter | null): Promise<JiraSettingsView>
}

export type JiraMethod = keyof JiraApi

export const jiraMethods: readonly JiraMethod[] = [
  'jiraSettings',
  'saveJiraSettings',
  'disconnectJira',
  'jiraIssue',
  'myOpenJiraIssues',
  'searchJiraIssues',
  'assignJiraIssueToMe',
  'jiraBoards',
  'jiraBoardColumns',
  'saveJiraColumnFilter'
]
