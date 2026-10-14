import { CommitGraphView } from './components/CommitGraphView'
import { CommitPanel } from './components/CommitPanel'
import { ContextMenu } from './components/ContextMenu'
import { DiffView } from './components/DiffView'
import { FormDialog } from './components/FormDialog'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { Toolbar } from './components/Toolbar'
import { Welcome } from './components/Welcome'
import { WorkingTreePanel } from './components/WorkingTreePanel'
import { useRepositoryController } from './useRepositoryController'

export function App() {
  const controller = useRepositoryController()
  const { view, selection, diff } = controller

  return (
    <div className="app">
      {view ? (
        <>
          <Toolbar controller={controller} />
          <div className="workspace">
            <Sidebar controller={controller} />
            <main className="center">{diff ? <DiffView controller={controller} /> : <CommitGraphView controller={controller} />}</main>
            <aside className="details">
              {selection?.kind === 'commit' ? (
                <CommitPanel key={selection.sha} controller={controller} sha={selection.sha} />
              ) : (
                <WorkingTreePanel controller={controller} />
              )}
            </aside>
          </div>
        </>
      ) : (
        <Welcome controller={controller} />
      )}
      {controller.busyLabel && <div className="busy-indicator">{controller.busyLabel}…</div>}
      <Toasts controller={controller} />
      {controller.dialog && <FormDialog request={controller.dialog} onClose={controller.closeDialog} />}
      {controller.contextMenu && <ContextMenu menu={controller.contextMenu} onClose={controller.closeMenu} />}
    </div>
  )
}
