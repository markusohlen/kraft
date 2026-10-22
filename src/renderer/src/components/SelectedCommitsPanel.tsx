import type { CommitRow } from '../../../domain/commitGraph'
import { shortSha } from '../format'
import type { RepositoryController } from '../useRepositoryController'

/** Shown instead of a single commit's details while several commits are selected with shift-click. */
export function SelectedCommitsPanel({ controller, shas }: { controller: RepositoryController; shas: string[] }) {
  const { squash } = controller.presenters
  const commits = controller
    .view!.graph.rows.filter((row): row is CommitRow => row.kind === 'commit' && shas.includes(row.commit.sha))
    .map((row) => row.commit)

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">{shas.length} commits selected</div>
        <div className="muted small">Shift-click another commit to change the range.</div>
        {squash.canSquash(shas) && (
          <button className="primary" disabled={controller.busyLabel !== null} onClick={() => void squash.start(shas)}>
            Squash {shas.length} commits
          </button>
        )}
      </div>
      <ul className="selected-commits">
        {commits.map((commit) => (
          <li key={commit.sha} className="selected-commit" title={commit.subject}>
            <span className="mono muted">{shortSha(commit.sha)}</span>
            <span className="selected-commit-subject">{commit.subject}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
