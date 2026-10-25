import { useEffect, useState } from 'react'
import type { CommitDetails } from '../../../application/kraftApi'
import { applyStash, askDropStash, popStash } from '../actions'
import { formatFullDate, shortSha, stashSummary } from '../format'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'
import { FileList } from './FileList'

/** Details of a stash selected in the graph: what it holds and what can be done with it. */
export function StashPanel({ controller, sha }: { controller: RepositoryController; sha: string }) {
  const [details, setDetails] = useState<CommitDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stash = controller.view!.stashes.find((candidate) => candidate.sha === sha)
  const busy = controller.busyLabel !== null

  useEffect(() => {
    kraft.stashDetails(sha).then(setDetails, (failure: Error) => setError(failure.message))
  }, [sha])

  if (!stash) return <div className="panel empty-state">This stash no longer exists.</div>

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="commit-sha">
          stash@{`{${stash.index}}`} · <span className="mono">{shortSha(sha)}</span>
        </div>
        <div className="commit-subject" title={stash.message}>
          {stashSummary(stash.message)}
        </div>
        <div className="muted small">
          Stashed {formatFullDate(stash.date)} on commit <span className="mono">{shortSha(stash.baseSha)}</span>
        </div>
        <div className="section-buttons stash-buttons">
          <button className="primary" disabled={busy} title="Bring the changes back and keep the stash" onClick={() => applyStash(controller, stash)}>
            Apply
          </button>
          <button className="secondary" disabled={busy} title="Bring the changes back and delete the stash" onClick={() => popStash(controller, stash)}>
            Pop
          </button>
          <button className="link-button danger" disabled={busy} onClick={() => askDropStash(controller, stash)}>
            Delete
          </button>
        </div>
      </div>
      <div className="panel-section">
        <div className="panel-section-header">
          <span>{details ? `${details.files.length} changed files` : 'Changed files'}</span>
        </div>
        {error && <div className="empty-state error-text">{error}</div>}
        {details && (
          <FileList
            changes={details.files}
            isSelected={(change) => controller.diff?.kind === 'stash' && controller.diff.change.path === change.path}
            onOpen={(change) => controller.setDiff({ kind: 'stash', sha, change })}
            onClose={() => controller.setDiff(null)}
          />
        )}
      </div>
    </div>
  )
}
