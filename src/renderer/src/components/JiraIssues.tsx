import { useEffect, useState } from 'react'
import { issueUrl, splitByIssueKeys, type JiraIssue } from '../../../domain/jira'
import { openInBrowser } from '../browser'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'

/** Text with its Jira issue keys turned into links, once Jira is connected. */
export function IssueKeyText({ controller, text }: { controller: RepositoryController; text: string }) {
  const jira = controller.jira
  if (!jira) return <>{text}</>
  return (
    <>
      {splitByIssueKeys(text, jira.projectKeys).map((part, index) =>
        part.issueKey ? (
          <a
            key={index}
            className="issue-link"
            href={issueUrl(jira.baseUrl, part.issueKey)}
            title={`Open ${part.issueKey} in Jira`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openInBrowser(issueUrl(jira.baseUrl, part.issueKey!))
            }}
          >
            {part.text}
          </a>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  )
}

type IssueState = { kind: 'loading' } | { kind: 'loaded'; issue: JiraIssue | null } | { kind: 'failed'; message: string }

/** Summary, status and assignee of one issue, as shown in the details panel. */
export function JiraIssueCard({ issueKey }: { issueKey: string }) {
  const [state, setState] = useState<IssueState>({ kind: 'loading' })

  useEffect(() => {
    let current = true
    setState({ kind: 'loading' })
    kraft.jiraIssue(issueKey).then(
      (issue) => current && setState({ kind: 'loaded', issue }),
      (error: Error) => current && setState({ kind: 'failed', message: error.message })
    )
    return () => {
      current = false
    }
  }, [issueKey])

  if (state.kind === 'loading') return <div className="issue-card muted small">Loading {issueKey}…</div>
  if (state.kind === 'failed') return <div className="issue-card error-text small">{issueKey}: {state.message}</div>
  if (!state.issue) return <div className="issue-card muted small">{issueKey} was not found in Jira</div>

  const { issue } = state
  return (
    <div className="issue-card">
      <div className="issue-card-header">
        <button className="link-button issue-key" title="Open in Jira" onClick={() => openInBrowser(issue.url)}>
          {issue.key}
        </button>
        <span className="muted small">{issue.issueType}</span>
        <StatusBadge issue={issue} />
      </div>
      <div className="issue-summary">{issue.summary}</div>
      <div className="muted small">{issue.assignee ? `Assigned to ${issue.assignee}` : 'Unassigned'}</div>
    </div>
  )
}

function StatusBadge({ issue }: { issue: JiraIssue }) {
  return <span className={`status-badge ${issue.statusCategory}`}>{issue.status}</span>
}
