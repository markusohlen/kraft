import { askCreateBranch, askStash, pushCurrent } from '../actions'
import { kraft } from '../kraftClient'
import { openOtherRepository, repositoryDisplayName } from '../libraryActions'
import type { RepositoryController } from '../useRepositoryController'

export function Toolbar({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const busy = controller.busyLabel !== null
  const current = view.branches.find((branch) => branch.isCurrent)
  const { pullRequest } = controller.presenters

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button className="repo-button" title={`${view.path}\nClick to open another repository`} onClick={() => void openOtherRepository(controller)}>
          <span className="toolbar-caption">repository</span>
          <span className="toolbar-value">{repositoryDisplayName(controller)}</span>
        </button>
        <div className="branch-indicator">
          <span className="toolbar-caption">branch</span>
          <span className="toolbar-value">{view.currentBranch ?? 'detached HEAD'}</span>
        </div>
      </div>

      <div className="toolbar-group toolbar-actions">
        <ToolbarButton icon="⟲" label="Fetch" disabled={busy} onClick={() => void controller.run('Fetching', () => kraft.fetch(), 'Fetched all remotes')} />
        <ToolbarButton
          icon="↓"
          label="Pull"
          badge={current?.behind}
          disabled={busy || !view.currentBranch}
          onClick={() => void controller.run('Pulling', () => kraft.pull(), 'Pulled')}
        />
        <ToolbarButton
          icon="↑"
          label="Push"
          badge={current?.ahead}
          disabled={busy || !view.currentBranch}
          onClick={() => pushCurrent(controller)}
        />
        <ToolbarButton
          icon="⇄"
          label="PR"
          disabled={busy || !view.currentBranch || !pullRequest.canCreate(view)}
          onClick={() => view.currentBranch && pullRequest.start(view, view.currentBranch)}
        />
        <span className="toolbar-divider" />
        <ToolbarButton icon="⑂" label="Branch" disabled={busy} onClick={() => askCreateBranch(controller, 'HEAD', view.currentBranch ?? 'HEAD')} />
        <ToolbarButton icon="⤓" label="Stash" disabled={busy} onClick={() => askStash(controller)} />
        <ToolbarButton
          icon="⤒"
          label="Pop"
          disabled={busy || view.stashes.length === 0}
          onClick={() => void controller.run('Popping stash', () => kraft.stashPop(0), 'Stash popped')}
        />
      </div>

      <div className="toolbar-group">
        <ToolbarButton icon="↻" label="Refresh" disabled={busy} onClick={() => void controller.refresh()} />
      </div>
    </header>
  )
}

interface ToolbarButtonProps {
  icon: string
  label: string
  badge?: number
  disabled?: boolean
  onClick: () => void
}

function ToolbarButton({ icon, label, badge, disabled, onClick }: ToolbarButtonProps) {
  return (
    <button className="toolbar-button" disabled={disabled} onClick={onClick}>
      <span className="toolbar-icon">
        {icon}
        {badge ? <span className="toolbar-badge">{badge}</span> : null}
      </span>
      <span className="toolbar-label">{label}</span>
    </button>
  )
}
