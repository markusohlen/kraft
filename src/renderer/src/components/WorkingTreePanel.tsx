import { useState } from 'react'
import { hasConflicts, type FileChange } from '../../../domain/entities'
import { findIssueKeys } from '../../../domain/jira'
import { extendFileSelection, selectFile, type FileSelection, type SelectionMode } from '../fileSelection'
import { kraft } from '../kraftClient'
import { usePanelSize } from '../usePanelSize'
import type { RepositoryController } from '../useRepositoryController'
import { FileList } from './FileList'
import { JiraIssueCard } from './JiraIssues'
import { ResizeHandle } from './ResizeHandle'

export function WorkingTreePanel({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const { staged, unstaged } = view.status
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [fileSelection, setFileSelection] = useState<FileSelection | null>(null)
  const stagedSection = usePanelSize('kraft.stagedFilesHeight', { initial: 200, min: 64, max: 1200 })
  const busy = controller.busyLabel !== null
  const branchIssueKey = controller.jira && view.currentBranch ? findIssueKeys(view.currentBranch, controller.jira.projectKeys)[0] : undefined

  const diff = controller.diff
  // A diff opened before this panel mounted still counts as the selected file.
  const selection =
    fileSelection ??
    (diff?.kind === 'working' ? selectFile(diff.staged, diff.change.path) : diff?.kind === 'conflict' ? selectFile(false, diff.change.path) : null)
  const isSelected = (change: FileChange, isStaged: boolean) => selection?.staged === isStaged && selection.paths.includes(change.path)
  const selectedUnstaged = unstaged.filter((change) => isSelected(change, false))
  const selectedStaged = staged.filter((change) => isSelected(change, true))
  const paths = (changes: FileChange[]) => changes.map((change) => change.path)

  // A conflicted file opens in the merge tool, to pick what to keep, rather than in the diff view.
  const showFile = (change: FileChange, isStaged: boolean) =>
    controller.setDiff(change.status === 'conflicted' ? { kind: 'conflict', change } : { kind: 'working', change, staged: isStaged })
  const openDiff = (change: FileChange, isStaged: boolean) => {
    setFileSelection(selectFile(isStaged, change.path))
    showFile(change, isStaged)
  }
  const closeDiff = () => {
    setFileSelection(null)
    controller.setDiff(null)
  }
  const selectMore = (change: FileChange, isStaged: boolean, list: FileChange[], mode: SelectionMode) => {
    const next = extendFileSelection(selection, isStaged, paths(list), change.path, mode)
    setFileSelection(next)
    if (next?.paths.includes(change.path)) showFile(change, isStaged)
  }

  const stage = (changes: FileChange[]) => void controller.run('Staging', () => kraft.stage(paths(changes)))
  const unstage = (changes: FileChange[]) => void controller.run('Unstaging', () => kraft.unstage(paths(changes)))
  const discard = (changes: FileChange[]) =>
    controller.ask({
      title: discardTitle(changes, unstaged.length),
      description: 'This cannot be undone. Untracked files are deleted.',
      fields: [],
      confirmLabel: 'Discard',
      danger: true,
      onSubmit: () =>
        void controller.run('Discarding', async () => {
          await kraft.discard(changes)
          closeDiff()
        })
    })

  // With several files selected, the section buttons act on those files instead of the whole list.
  const bulkUnstaged = selectedUnstaged.length > 1
  const bulkStaged = selectedStaged.length > 1
  const unstagedTargets = bulkUnstaged ? selectedUnstaged : unstaged
  const stagedTargets = bulkStaged ? selectedStaged : staged
  const actOnTargets = (action: (changes: FileChange[]) => void, changes: FileChange[]) => {
    action(changes)
    setFileSelection(null)
  }

  const commit = () => {
    const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()
    void controller.run(
      'Committing',
      async () => {
        await kraft.commit(message)
        setSummary('')
        setDescription('')
        closeDiff()
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
          <div className="conflict-banner">
            Click a conflicted file to pick the lines to keep, save it, then commit to complete the merge or cherry-pick.
          </div>
        )}
      </div>

      <div className="panel-section unstaged-section">
        <div className="panel-section-header">
          <span>Unstaged Files ({unstaged.length})</span>
          {unstaged.length > 0 && (
            <span className="section-buttons">
              <button className="link-button danger" disabled={busy} onClick={() => discard(unstagedTargets)}>
                {bulkUnstaged ? `Discard ${fileCount(unstagedTargets)}` : 'Discard all'}
              </button>
              <button className="stage-button" disabled={busy} onClick={() => actOnTargets(stage, unstagedTargets)}>
                {bulkUnstaged ? `Stage ${fileCount(unstagedTargets)}` : 'Stage all changes'}
              </button>
            </span>
          )}
        </div>
        <FileList
          changes={unstaged}
          isSelected={(change) => isSelected(change, false)}
          onOpen={(change) => openDiff(change, false)}
          onClose={closeDiff}
          onSelectMore={(change, mode) => selectMore(change, false, unstaged, mode)}
          actions={[
            { label: 'Discard', title: 'Discard changes', danger: true, onClick: (change) => discard([change]) },
            { label: 'Stage', title: 'Stage file', onClick: (change) => stage([change]) }
          ]}
        />
      </div>

      <ResizeHandle className="row-resize" size={stagedSection.size} onResize={stagedSection.resize} direction={-1} axis="y" />

      <div className="panel-section" style={{ flex: `0 1 ${stagedSection.size}px` }}>
        <div className="panel-section-header">
          <span>Staged Files ({staged.length})</span>
          {staged.length > 0 && (
            <button className="unstage-button" disabled={busy} onClick={() => actOnTargets(unstage, stagedTargets)}>
              {bulkStaged ? `Unstage ${fileCount(stagedTargets)}` : 'Unstage all changes'}
            </button>
          )}
        </div>
        <FileList
          changes={staged}
          isSelected={(change) => isSelected(change, true)}
          onOpen={(change) => openDiff(change, true)}
          onClose={closeDiff}
          onSelectMore={(change, mode) => selectMore(change, true, staged, mode)}
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
          {staged.length === 0 ? 'Stage files to commit' : `Commit changes to ${fileCount(staged)}`}
        </button>
      </div>
    </div>
  )
}

function fileCount(changes: FileChange[]): string {
  return `${changes.length} file${changes.length === 1 ? '' : 's'}`
}

function discardTitle(changes: FileChange[], unstagedCount: number): string {
  if (changes.length === 1) return `Discard changes to ${changes[0].path}?`
  return changes.length === unstagedCount ? `Discard all ${changes.length} unstaged changes?` : `Discard changes to ${changes.length} files?`
}
