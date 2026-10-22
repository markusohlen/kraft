import { useState } from 'react'
import { hasConflicts, type FileChange } from '../../../domain/entities'
import { findIssueKeys } from '../../../domain/jira'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'
import { FileList } from './FileList'
import { JiraIssueCard } from './JiraIssues'

export function WorkingTreePanel({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const { staged, unstaged } = view.status
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const busy = controller.busyLabel !== null
  const branchIssueKey = controller.jira && view.currentBranch ? findIssueKeys(view.currentBranch, controller.jira.projectKeys)[0] : undefined

  const openDiff = (change: FileChange, isStaged: boolean) => controller.setDiff({ kind: 'working', change, staged: isStaged })
  const isOpen = (change: FileChange, isStaged: boolean) => {
    const diff = controller.diff
    return diff?.kind === 'working' && diff.staged === isStaged && diff.change.path === change.path
  }
  const paths = (changes: FileChange[]) => changes.map((change) => change.path)

  const stage = (changes: FileChange[]) => void controller.run('Staging', () => kraft.stage(paths(changes)))
  const unstage = (changes: FileChange[]) => void controller.run('Unstaging', () => kraft.unstage(paths(changes)))
  const discard = (changes: FileChange[]) =>
    controller.ask({
      title: changes.length === 1 ? `Discard changes to ${changes[0].path}?` : `Discard all ${changes.length} unstaged changes?`,
      description: 'This cannot be undone. Untracked files are deleted.',
      fields: [],
      confirmLabel: 'Discard',
      danger: true,
      onSubmit: () =>
        void controller.run('Discarding', async () => {
          await kraft.discard(changes)
          controller.setDiff(null)
        })
    })

  const commit = () => {
    const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()
    void controller.run(
      'Committing',
      async () => {
        await kraft.commit(message)
        setSummary('')
        setDescription('')
        controller.setDiff(null)
      },
      'Changes committed'
    )
  }

  return (
    <div className="panel working-tree-panel">
      <div className="panel-header">
        <div className="panel-title">
          {staged.length + unstaged.length === 0 ? 'No changes' : `${new Set(paths([...staged, ...unstaged])).size} file changes`}
        </div>
        <div className="muted small">on {view.currentBranch ?? 'detached HEAD'}</div>
        {branchIssueKey && <JiraIssueCard issueKey={branchIssueKey} />}
        {hasConflicts(view.status) && (
          <div className="conflict-banner">Resolve the conflicted files, stage them, then commit to complete the merge or cherry-pick.</div>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-section-header">
          <span>Unstaged Files ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <span className="section-buttons">
              <button className="link-button danger" disabled={busy} onClick={() => discard(unstaged)}>
                Discard all
              </button>
              <button className="stage-button" disabled={busy} onClick={() => stage(unstaged)}>
                Stage all changes
              </button>
            </span>
          )}
        </div>
        <FileList
          changes={unstaged}
          isSelected={(change) => isOpen(change, false)}
          onOpen={(change) => openDiff(change, false)}
          onClose={() => controller.setDiff(null)}
          actions={[
            { label: 'Discard', title: 'Discard changes', danger: true, onClick: (change) => discard([change]) },
            { label: 'Stage', title: 'Stage file', onClick: (change) => stage([change]) }
          ]}
        />
      </div>

      <div className="panel-section">
        <div className="panel-section-header">
          <span>Staged Files ({staged.length})</span>
          {staged.length > 0 && (
            <button className="unstage-button" disabled={busy} onClick={() => unstage(staged)}>
              Unstage all changes
            </button>
          )}
        </div>
        <FileList
          changes={staged}
          isSelected={(change) => isOpen(change, true)}
          onOpen={(change) => openDiff(change, true)}
          onClose={() => controller.setDiff(null)}
          actions={[{ label: 'Unstage', title: 'Unstage file', onClick: (change) => unstage([change]) }]}
        />
      </div>

      <div className="commit-box">
        <div className="panel-section-header">
          <span>Commit</span>
        </div>
        <input className="commit-summary" placeholder="Summary" value={summary} maxLength={200} onChange={(event) => setSummary(event.target.value)} />
        <textarea className="commit-description" placeholder="Description" value={description} onChange={(event) => setDescription(event.target.value)} />
        <button className="primary commit-button" disabled={busy || staged.length === 0 || !summary.trim()} onClick={commit}>
          {staged.length === 0 ? 'Stage files to commit' : `Commit changes to ${staged.length} file${staged.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
