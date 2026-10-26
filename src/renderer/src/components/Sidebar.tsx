import { Fragment, useState, type MouseEvent, type ReactNode } from 'react'
import { gitFlowBranchTypes, type GitFlowBranchType } from '../../../domain/gitFlow'
import { moveSection, setSectionExpanded, setSectionVisible, sidebarSectionTitles, type SidebarSectionId } from '../../../domain/sidebarLayout'
import {
  askFinishGitFlowBranch,
  askInitGitFlow,
  askStartGitFlowBranch,
  checkoutLocal,
  checkoutRemote,
  popStash,
  showLocalBranchMenu,
  showRemoteBranchMenu,
  showStashMenu
} from '../actions'
import { buildBranchTree, countBranches, type BranchFolder, type BranchLeaf } from '../branchTree'
import type { RepositoryController } from '../useRepositoryController'
import { useSidebarSettings } from '../useSidebarSettings'
import { SlidersIcon } from './Icons'
import { JiraSidebarSection } from './JiraSidebarSection'
import { SidebarLayoutDialog } from './SidebarLayoutDialog'
import { SidebarSection, type SectionControl } from './SidebarSection'

export function Sidebar({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const [filter, setFilter] = useState('')
  const [customizing, setCustomizing] = useState(false)
  const sidebarSettings = useSidebarSettings(view.path)
  const { layout, changeLayout } = sidebarSettings
  const matches = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase())

  const localBranches = view.branches.filter((branch) => matches(branch.name))
  const localByName = new Map(localBranches.map((branch) => [branch.name, branch]))
  const remoteGroups = groupByRemote(view.remoteBranches.filter(matches))
  const tags = view.tags.filter(matches)
  const visibleSections = layout.filter((setting) => setting.visible)

  const showSectionMenu = (event: MouseEvent, id: SidebarSectionId) => {
    event.preventDefault()
    const position = visibleSections.findIndex((setting) => setting.id === id)
    const neighbour = (offset: number) => visibleSections[position + offset]
    // Takes the neighbour's place in the whole layout, so hidden sections keep their positions.
    const swapWith = (offset: number) => {
      const target = neighbour(offset)
      changeLayout((current) => moveSection(current, id, current.findIndex((setting) => setting.id === target.id)))
    }
    controller.showMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        ...(neighbour(-1) ? [{ label: 'Move up', onSelect: () => swapWith(-1) }] : []),
        ...(neighbour(1) ? [{ label: 'Move down', onSelect: () => swapWith(1) }] : []),
        { label: `Hide ${sidebarSectionTitles[id]}`, onSelect: () => changeLayout((current) => setSectionVisible(current, id, false)) },
        { label: 'Customize sidebar…', onSelect: () => setCustomizing(true) }
      ]
    })
  }

  const controlFor = (id: SidebarSectionId, open: boolean): SectionControl => ({
    open,
    onToggle: (nextOpen) => changeLayout((current) => setSectionExpanded(current, id, nextOpen)),
    onHeaderContextMenu: (event) => showSectionMenu(event, id)
  })

  const sections: Record<SidebarSectionId, (control: SectionControl) => ReactNode> = {
    jira: (control) => <JiraSidebarSection controller={controller} control={control} />,
    local: (control) => (
      <SidebarSection title="Local" count={view.branches.length} control={control}>
        <BranchFolderView
          folder={buildBranchTree(localBranches.map((branch) => branch.name))}
          depth={1}
          renderBranch={(leaf) => {
            const branch = localByName.get(leaf.fullName)!
            return (
              <div
                key={branch.name}
                className={`sidebar-item ${branch.isCurrent ? 'current' : ''}`}
                title={`${branch.name}\nDouble-click to check out`}
                onDoubleClick={() => checkoutLocal(controller, branch.name)}
                onContextMenu={(event) => showLocalBranchMenu(controller, event, branch.name)}
              >
                <span className="item-icon">{branch.isCurrent ? '✓' : '⑂'}</span>
                <span className="item-name">{leaf.label}</span>
                <TrackingBadge ahead={branch.ahead} behind={branch.behind} />
              </div>
            )
          }}
        />
      </SidebarSection>
    ),
    remote: (control) => (
      <SidebarSection title="Remote" count={view.remoteBranches.length} control={control}>
        {[...remoteGroups].map(([remote, branches]) => (
          <SidebarSection key={remote} title={remote} count={branches.length} depth={1}>
            <BranchFolderView
              folder={buildBranchTree(branches, remote)}
              depth={2}
              renderBranch={(leaf) => (
                <div
                  key={leaf.fullName}
                  className="sidebar-item"
                  title={`${leaf.fullName}\nDouble-click to check out`}
                  onDoubleClick={() => checkoutRemote(controller, leaf.fullName)}
                  onContextMenu={(event) => showRemoteBranchMenu(controller, event, leaf.fullName)}
                >
                  <span className="item-icon">☁</span>
                  <span className="item-name">{leaf.label}</span>
                </div>
              )}
            />
          </SidebarSection>
        ))}
      </SidebarSection>
    ),
    stashes: (control) => (
      <SidebarSection title="Stashes" count={view.stashes.length} control={control}>
        {view.stashes.map((stash) => (
          <div
            key={stash.sha}
            className="sidebar-item"
            title="Double-click to apply and drop (pop)"
            onClick={() => {
              controller.setDiff(null)
              controller.setSelection({ kind: 'stash', sha: stash.sha })
            }}
            onDoubleClick={() => popStash(controller, stash)}
            onContextMenu={(event) => showStashMenu(controller, event, stash)}
          >
            <span className="item-icon">⧉</span>
            <span className="item-name">{stash.message}</span>
          </div>
        ))}
      </SidebarSection>
    ),
    tags: (control) => (
      <SidebarSection title="Tags" count={view.tags.length} control={control}>
        {tags.map((tag) => (
          <div key={tag} className="sidebar-item">
            <span className="item-icon">⌂</span>
            <span className="item-name">{tag}</span>
          </div>
        ))}
      </SidebarSection>
    ),
    gitflow: (control) => <GitFlowSection controller={controller} control={control} />
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-top">
        <input className="sidebar-filter" placeholder="Filter branches and tags" value={filter} onChange={(event) => setFilter(event.target.value)} />
        <button className="icon-button" title="Customize sidebar: reorder, hide and save layouts" onClick={() => setCustomizing(true)}>
          <SlidersIcon />
        </button>
      </div>
      <div className="sidebar-scroll">
        {visibleSections.map((setting) => (
          <Fragment key={setting.id}>{sections[setting.id](controlFor(setting.id, setting.expanded))}</Fragment>
        ))}
        {visibleSections.length === 0 && (
          <div className="sidebar-empty">
            <button className="secondary" onClick={() => setCustomizing(true)}>
              Show hidden sections
            </button>
          </div>
        )}
      </div>
      {customizing && (
        <SidebarLayoutDialog
          repositoryName={view.name}
          repositoryPath={view.path}
          settings={sidebarSettings.settings}
          onSettingsChange={sidebarSettings.setSettings}
          onClose={() => setCustomizing(false)}
        />
      )}
    </nav>
  )
}

function GitFlowSection({ controller, control }: { controller: RepositoryController; control: SectionControl }) {
  const gitFlow = controller.view!.gitFlow
  if (!gitFlow) {
    return (
      <SidebarSection title="Gitflow" control={control}>
        <div className="sidebar-empty">
          <button className="secondary" onClick={() => askInitGitFlow(controller)}>
            Initialize Gitflow
          </button>
        </div>
      </SidebarSection>
    )
  }
  const typeLabels: Record<GitFlowBranchType, string> = { feature: 'Feature', release: 'Release', hotfix: 'Hotfix' }
  return (
    <SidebarSection title="Gitflow" control={control}>
      <div className="gitflow-start">
        {gitFlowBranchTypes.map((type) => (
          <button key={type} className="secondary small" onClick={() => askStartGitFlowBranch(controller, type)}>
            + {typeLabels[type]}
          </button>
        ))}
      </div>
      {gitFlowBranchTypes.map((type) => {
        const branches = gitFlow.branches.filter((branch) => branch.type === type)
        if (branches.length === 0) return null
        return (
          <SidebarSection key={type} title={`${typeLabels[type]}s`} depth={1}>
            {branches.map((branch) => (
              <div
                key={branch.branchName}
                className={`sidebar-item ${controller.view!.currentBranch === branch.branchName ? 'current' : ''}`}
                onDoubleClick={() => checkoutLocal(controller, branch.branchName)}
                onContextMenu={(event) => showLocalBranchMenu(controller, event, branch.branchName)}
              >
                <span className="item-icon">⑂</span>
                <span className="item-name">{branch.name}</span>
                <button className="item-action" onClick={() => askFinishGitFlowBranch(controller, branch.branchName)}>
                  Finish
                </button>
              </div>
            ))}
          </SidebarSection>
        )
      })}
    </SidebarSection>
  )
}

interface BranchFolderViewProps {
  folder: BranchFolder
  /** The depth of the folders inside `folder`. */
  depth: number
  renderBranch: (leaf: BranchLeaf) => ReactNode
}

/** Shows `feature/...` branches inside a collapsible `feature` folder, one indent level per path segment. */
function BranchFolderView({ folder, depth, renderBranch }: BranchFolderViewProps) {
  return (
    <>
      {folder.folders.map((child) => (
        <SidebarSection key={child.path} title={child.name} count={countBranches(child)} depth={depth}>
          <BranchFolderView folder={child} depth={depth + 1} renderBranch={renderBranch} />
        </SidebarSection>
      ))}
      {folder.branches.map(renderBranch)}
    </>
  )
}

function TrackingBadge({ ahead, behind }: { ahead: number; behind: number }) {
  if (!ahead && !behind) return null
  return (
    <span className="tracking">
      {ahead > 0 && <span>{ahead}↑</span>}
      {behind > 0 && <span>{behind}↓</span>}
    </span>
  )
}

function groupByRemote(remoteBranches: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const remoteBranch of remoteBranches) {
    const remote = remoteBranch.split('/')[0]
    groups.set(remote, [...(groups.get(remote) ?? []), remoteBranch])
  }
  return groups
}
