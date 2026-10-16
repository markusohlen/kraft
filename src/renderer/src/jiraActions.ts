import type { JiraDeployment } from '../../application/jiraApi'
import { issueBranchName, parseProjectKeys, type JiraIssue } from '../../domain/jira'
import { kraft } from './kraftClient'
import type { RepositoryController } from './useRepositoryController'

export function askJiraSettings(controller: RepositoryController): void {
  const current = controller.jira
  controller.ask({
    title: current ? 'Jira connection' : 'Connect Jira',
    description: current
      ? `Connected as ${current.userName}. Leave the token empty to keep the saved one.`
      : 'Jira Cloud: sign in with your Atlassian email and an API token from id.atlassian.com → Security → API tokens. ' +
        'Server/Data Center: use a personal access token.',
    fields: [
      {
        name: 'deployment',
        label: 'Jira type',
        type: 'select',
        initial: current?.deployment ?? 'cloud',
        options: [
          { value: 'cloud', label: 'Jira Cloud (atlassian.net)' },
          { value: 'server', label: 'Jira Server / Data Center' }
        ]
      },
      { name: 'baseUrl', label: 'Jira address', type: 'text', initial: current?.baseUrl ?? '', placeholder: 'https://your-site.atlassian.net' },
      { name: 'email', label: 'Email (Jira Cloud only)', type: 'text', initial: current?.email ?? '', placeholder: 'you@example.com' },
      { name: 'token', label: current ? 'API token (unchanged when empty)' : 'API token', type: 'password', initial: '' },
      {
        name: 'projectKeys',
        label: 'Project keys to recognise (optional, comma separated)',
        type: 'text',
        initial: current?.projectKeys.join(', ') ?? '',
        placeholder: 'KRA, WEB'
      }
    ],
    confirmLabel: current ? 'Save' : 'Connect',
    onSubmit: (values) =>
      void controller.run(
        'Connecting to Jira',
        async () =>
          controller.setJira(
            await kraft.saveJiraSettings({
              deployment: String(values.deployment) as JiraDeployment,
              baseUrl: String(values.baseUrl),
              email: String(values.email),
              token: String(values.token),
              projectKeys: parseProjectKeys(String(values.projectKeys))
            })
          ),
        'Jira is connected'
      )
  })
}

export function askDisconnectJira(controller: RepositoryController): void {
  controller.ask({
    title: 'Disconnect Jira?',
    description: 'The saved address and token are removed from this computer.',
    fields: [],
    confirmLabel: 'Disconnect',
    danger: true,
    onSubmit: () =>
      void controller.run(
        'Disconnecting Jira',
        async () => {
          await kraft.disconnectJira()
          controller.setJira(null)
        },
        'Jira is disconnected'
      )
  })
}

/**
 * Starts a branch named after the issue — a git-flow feature when git-flow is set up, otherwise a branch
 * from HEAD — and assigns the issue to you, since starting a branch means you are working on it.
 */
export function askCreateIssueBranch(controller: RepositoryController, issue: JiraIssue, onDone?: () => void): void {
  const gitFlow = controller.view?.gitFlow
  const name = issueBranchName(issue)
  controller.ask({
    title: `Start work on ${issue.key}`,
    description:
      (gitFlow
        ? `Starts ${gitFlow.config.featurePrefix}<name> from ${gitFlow.config.developBranch} and checks it out.`
        : `Creates the branch from ${controller.view?.currentBranch ?? 'HEAD'} and checks it out.`) +
      ` ${issue.key} is assigned to you in Jira.`,
    fields: [{ name: 'name', label: gitFlow ? 'Feature name' : 'Branch name', type: 'text', initial: name }],
    confirmLabel: gitFlow ? 'Start feature' : 'Create branch',
    onSubmit: ({ name: chosen }) => {
      const branchName = String(chosen).trim()
      void controller.run(
        'Creating branch',
        async () => {
          const result = await (gitFlow ? kraft.startGitFlowBranch('feature', branchName) : kraft.createBranch(branchName, 'HEAD'))
          // The branch exists now; a failed assignment is reported on its own so the stash notice isn't lost.
          try {
            await kraft.assignJiraIssueToMe(issue.key)
            controller.notify('info', `Started ${branchName} and assigned ${issue.key} to you`)
          } catch (error) {
            controller.notify('error', `${branchName} was created, but ${issue.key} could not be assigned to you: ${messageOf(error)}`)
          }
          onDone?.()
          return result
        }
      )
    }
  })
}

export function assignToMe(controller: RepositoryController, issue: JiraIssue, onDone?: () => void): void {
  void controller.run(
    `Assigning ${issue.key}`,
    async () => {
      await kraft.assignJiraIssueToMe(issue.key)
      onDone?.()
    },
    `${issue.key} is assigned to you`
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
