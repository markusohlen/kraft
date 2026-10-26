import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import type { JiraIssue } from '../../../domain/jira'
import { openInBrowser } from '../browser'
import { askCreateIssueBranch, askDisconnectJira, askJiraSettings, assignToMe } from '../jiraActions'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'
import { JiraColumnsDialog } from './JiraColumnsDialog'
import { SidebarSection, type SectionControl } from './SidebarSection'

/** Waits for a pause in typing so every keystroke doesn't hit Jira. */
const searchDelayMs = 400

type IssuesState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'loaded'; issues: JiraIssue[] } | { kind: 'failed'; message: string }

export function JiraSidebarSection({ controller, control }: { controller: RepositoryController; control: SectionControl }) {
  if (!controller.jira) {
    return (
      <SidebarSection title="Jira" control={control}>
        <div className="sidebar-empty">
          <button className="secondary" onClick={() => askJiraSettings(controller)}>
            Connect Jira
          </button>
        </div>
      </SidebarSection>
    )
  }
  // Keyed by the connection so switching Jira sites starts with fresh lists.
  return <ConnectedJiraSection key={controller.jira.baseUrl} controller={controller} control={control} />
}

function ConnectedJiraSection({ controller, control }: { controller: RepositoryController; control: SectionControl }) {
  const [assigned, setAssigned] = useState<IssuesState>({ kind: 'loading' })
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<IssuesState>({ kind: 'idle' })
  const [choosingColumns, setChoosingColumns] = useState(false)
  const columnFilter = controller.jira?.columnFilter ?? null
  // Reload whenever the chosen board or columns change.
  const columnFilterKey = JSON.stringify(columnFilter)

  const loadAssigned = useCallback(() => {
    setAssigned({ kind: 'loading' })
    kraft.myOpenJiraIssues().then(
      (issues) => setAssigned({ kind: 'loaded', issues }),
      (error: Error) => setAssigned({ kind: 'failed', message: error.message })
    )
  }, [])

  useEffect(loadAssigned, [loadAssigned, columnFilterKey])

  useEffect(() => {
    if (!query.trim()) {
      setResults({ kind: 'idle' })
      return
    }
    let current = true
    const timer = window.setTimeout(() => {
      setResults({ kind: 'loading' })
      kraft.searchJiraIssues(query).then(
        (issues) => current && setResults({ kind: 'loaded', issues }),
        (error: Error) => current && setResults({ kind: 'failed', message: error.message })
      )
    }, searchDelayMs)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [query])

  const startWork = (issue: JiraIssue) => askCreateIssueBranch(controller, issue, loadAssigned)
  const showMenu = (event: MouseEvent, issue: JiraIssue) => {
    event.preventDefault()
    controller.showMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'Create branch and assign to me', onSelect: () => startWork(issue) },
        { label: 'Assign to me', onSelect: () => assignToMe(controller, issue, loadAssigned) },
        { label: 'Open in Jira', onSelect: () => openInBrowser(issue.url) },
        { label: `Copy ${issue.key}`, onSelect: () => void navigator.clipboard.writeText(issue.key) }
      ]
    })
  }
  const showSettingsMenu = (event: MouseEvent) => {
    controller.showMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'Choose board columns…', onSelect: () => setChoosingColumns(true) },
        { label: 'Jira connection…', onSelect: () => askJiraSettings(controller) },
        { label: 'All settings…', onSelect: controller.openSettings },
        { label: 'Disconnect Jira', danger: true, onSelect: () => askDisconnectJira(controller) }
      ]
    })
  }

  const assignedCount = assigned.kind === 'loaded' ? assigned.issues.length : undefined
  return (
    <SidebarSection
      control={control}
      title="Jira"
      count={assignedCount}
      actions={
        <>
          <button className="icon-button" title="Reload my issues" onClick={loadAssigned}>
            ↻
          </button>
          <button className="icon-button" title={`Connected as ${controller.jira?.userName}`} onClick={showSettingsMenu}>
            ⚙
          </button>
        </>
      }
    >
      <input
        className="sidebar-filter jira-search"
        placeholder="Search Jira by key or text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && setQuery('')}
      />
      {results.kind !== 'idle' ? (
        <IssueList title="Search results" state={results} emptyText="No issues match." onStart={startWork} onMenu={showMenu} />
      ) : (
        <IssueList
          title={columnFilter ? `Assigned to me · ${columnFilter.columns.join(', ')}` : 'Assigned to me'}
          state={assigned} 
          emptyText={columnFilter ? 'None of your issues are in these columns.' : 'No open issues are assigned to you.'}
          onStart={startWork}
          onMenu={showMenu}
        />
      )}
      {choosingColumns && <JiraColumnsDialog controller={controller} onClose={() => setChoosingColumns(false)} />}
    </SidebarSection>
  )
}

interface IssueListProps {
  title: string
  state: IssuesState
  emptyText: string
  onStart: (issue: JiraIssue) => void
  onMenu: (event: MouseEvent, issue: JiraIssue) => void
}

function IssueList({ title, state, emptyText, onStart, onMenu }: IssueListProps) {
  return (
    <div className="jira-list">
      <div className="jira-list-title">{title}</div>
      {state.kind === 'loading' && <div className="sidebar-empty muted small">Loading…</div>}
      {state.kind === 'failed' && <div className="sidebar-empty error-text small">{state.message}</div>}
      {state.kind === 'loaded' && state.issues.length === 0 && <div className="sidebar-empty muted small">{emptyText}</div>}
      {state.kind === 'loaded' &&
        state.issues.map((issue) => (
          <div
            key={issue.key}
            className="sidebar-item jira-item"
            title={`${issue.key}: ${issue.summary}\n${issue.status} · ${issue.assignee ?? 'Unassigned'}\nDouble-click to create a branch`}
            onDoubleClick={() => onStart(issue)}
            onContextMenu={(event) => onMenu(event, issue)}
          >
            <span className={`status-dot ${issue.statusCategory}`} />
            <span className="jira-item-key">{issue.key}</span>
            <span className="item-name">{issue.summary}</span>
            <button className="item-action" onClick={() => onStart(issue)}>
              Branch
            </button>
          </div>
        ))}
    </div>
  )
}
