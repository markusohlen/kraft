import { useEffect, useState } from 'react'
import type { CommitDetails } from '../../../application/kraftApi'
import { formatFullDate, initials, shortSha } from '../format'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'
import { FileList } from './FileList'

export function CommitPanel({ controller, sha }: { controller: RepositoryController; sha: string }) {
  const [details, setDetails] = useState<CommitDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = controller.view!.graph.rows.find((row) => row.commit.sha === sha)?.commit

  useEffect(() => {
    kraft.commitDetails(sha).then(setDetails, (failure: Error) => setError(failure.message))
  }, [sha])

  if (!commit) return <div className="panel empty-state">This commit is no longer in the graph.</div>

  const [subject, ...bodyLines] = (details?.message ?? commit.subject).split('\n')
  const body = bodyLines.join('\n').trim()

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="commit-sha">
          commit: <span className="mono">{shortSha(sha)}</span>
          <button className="link-button" title="Copy full sha" onClick={() => void navigator.clipboard.writeText(sha)}>
            copy
          </button>
        </div>
        <div className="commit-subject">{subject}</div>
        {body && <pre className="commit-body">{body}</pre>}
        <div className="commit-author">
          <span className="author-avatar">{initials(commit.authorName)}</span>
          <div>
            <div>{commit.authorName}</div>
            <div className="muted small">authored {formatFullDate(commit.date)}</div>
          </div>
        </div>
        <div className="muted small">
          parent{commit.parents.length === 1 ? '' : 's'}: {commit.parents.map(shortSha).join(', ') || 'none'}
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
            isSelected={(change) => controller.diff?.kind === 'commit' && controller.diff.change.path === change.path}
            onOpen={(change) => controller.setDiff({ kind: 'commit', sha, change })}
          />
        )}
      </div>
    </div>
  )
}
