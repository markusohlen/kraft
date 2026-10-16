import { useEffect, useState } from 'react'
import type { CommitDetails } from '../../../application/kraftApi'
import type { CommitRow } from '../../../domain/commitGraph'
import { findIssueKeys } from '../../../domain/jira'
import { useProfilePicture } from '../avatars'
import { formatFullDate, initials, shortSha } from '../format'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'
import { FileList } from './FileList'
import { IssueKeyText, JiraIssueCard } from './JiraIssues'

export function CommitPanel({ controller, sha }: { controller: RepositoryController; sha: string }) {
  const [details, setDetails] = useState<CommitDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const commit = controller.view!.graph.rows.find((row): row is CommitRow => row.kind === 'commit' && row.commit.sha === sha)?.commit

  useEffect(() => {
    kraft.commitDetails(sha).then(setDetails, (failure: Error) => setError(failure.message))
  }, [sha])

  if (!commit) return <div className="panel empty-state">This commit is no longer in the graph.</div>

  const [subject, ...bodyLines] = (details?.message ?? commit.subject).split('\n')
  const body = bodyLines.join('\n').trim()
  const branchNames = commit.refs.filter((ref) => ref.kind !== 'tag').map((ref) => ref.name)
  const issueKeys = controller.jira
    ? findIssueKeys([details?.message ?? commit.subject, ...branchNames].join('\n'), controller.jira.projectKeys)
    : []

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="commit-sha">
          commit: <span className="mono">{shortSha(sha)}</span>
          <button className="link-button" title="Copy full sha" onClick={() => void navigator.clipboard.writeText(sha)}>
            copy
          </button>
        </div>
        <div className="commit-subject">
          <IssueKeyText controller={controller} text={subject} />
        </div>
        {body && (
          <pre className="commit-body">
            <IssueKeyText controller={controller} text={body} />
          </pre>
        )}
        {issueKeys.map((key) => (
          <JiraIssueCard key={key} issueKey={key} />
        ))}
        <div className="commit-author">
          <AuthorAvatar controller={controller} name={commit.authorName} email={commit.authorEmail} />
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

function AuthorAvatar({ controller, name, email }: { controller: RepositoryController; name: string; email: string }) {
  const { url, onError } = useProfilePicture(email, controller.avatarStyle)
  return (
    <span className="author-avatar" title={email}>
      {url ? <img src={url} alt="" onError={onError} /> : initials(name)}
    </span>
  )
}
