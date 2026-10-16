import type { CSSProperties } from 'react'
import { CommitGraphView } from './components/CommitGraphView'
import { CommitPanel } from './components/CommitPanel'
import { ContextMenu } from './components/ContextMenu'
import { DiffView } from './components/DiffView'
import { FormDialog } from './components/FormDialog'
import { RepositoryTabs } from './components/RepositoryTabs'
import { ScanRepositoriesDialog } from './components/ScanRepositoriesDialog'
import { ResizeHandle } from './components/ResizeHandle'
import { SettingsDialog } from './components/SettingsDialog'
import { StashPanel } from './components/StashPanel'
import { Sidebar } from './components/Sidebar'
import { Toasts } from './components/Toasts'
import { Toolbar } from './components/Toolbar'
import { Welcome } from './components/Welcome'
import { WorkingTreePanel } from './components/WorkingTreePanel'
import { usePanelSize } from './usePanelSize'
import { useRepositoryController } from './useRepositoryController'

export function App() {
  const controller = useRepositoryController()
  const { view, selection, diff } = controller
  const showSidebar = !(diff && controller.diffExpanded)
  const sidebar = usePanelSize('kraft.sidebarWidth', { initial: 250, min: 160, max: 520 })
  const details = usePanelSize('kraft.detailsWidth', { initial: 340, min: 260, max: 760 })
  const panelWidths = { '--sidebar-width': `${sidebar.size}px`, '--details-width': `${details.size}px` } as CSSProperties

  return (
    <div className="app">
      <RepositoryTabs controller={controller} />
      {view ? (
        <>
          <Toolbar controller={controller} />
          <div className="workspace" style={panelWidths}>
            {showSidebar && (
              <>
                <Sidebar controller={controller} />
                <ResizeHandle size={sidebar.size} onResize={sidebar.resize} direction={1} />
              </>
            )}
            <main className="center">{diff ? <DiffView controller={controller} /> : <CommitGraphView controller={controller} />}</main>
            <ResizeHandle size={details.size} onResize={details.resize} direction={-1} />
            <aside className="details">
              {selection?.kind === 'commit' ? (
                <CommitPanel key={selection.sha} controller={controller} sha={selection.sha} />
              ) : selection?.kind === 'stash' ? (
                <StashPanel key={selection.sha} controller={controller} sha={selection.sha} />
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
      {/* Before the other overlays, so dialogs opened from the settings appear on top of them. */}
      {controller.settingsOpen && <SettingsDialog controller={controller} onClose={controller.closeSettings} />}
      {controller.scanRoot && (
        <ScanRepositoriesDialog key={controller.scanRoot} controller={controller} root={controller.scanRoot} onClose={controller.closeScan} />
      )}
      <Toasts controller={controller} />
      {controller.dialog && <FormDialog request={controller.dialog} onClose={controller.closeDialog} />}
      {controller.contextMenu && <ContextMenu menu={controller.contextMenu} onClose={controller.closeMenu} />}
    </div>
  )
}
