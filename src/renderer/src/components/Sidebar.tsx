import { useState, type ReactNode } from 'react'
import { gitFlowBranchTypes, type GitFlowBranchType } from '../../../domain/gitFlow'
import {
  askFinishGitFlowBranch,
  askInitGitFlow,
  askStartGitFlowBranch,
  checkoutLocal,
  checkoutRemote,
  showLocalBranchMenu,
  showRemoteBranchMenu
} from '../actions'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'

export function Sidebar({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const [filter, setFilter] = useState('')
  const matches = (name: string) => name.toLowerCase().includes(filter.trim().toLowerCase())

  const localBranches = view.branches.filter((branch) => matches(branch.name))
  const remoteGroups = groupByRemote(view.remoteBranches.filter(matches))
  const tags = view.tags.filter(matches)

  return (
    <nav className="sidebar">
      <input className="sidebar-filter" placeholder="Filter branches and tags" value={filter} onChange={(event) => setFilter(event.target.value)} />
      <div className="sidebar-scroll">
        <Section title="Local" count={view.branches.length}>
          {localBranches.map((branch) => (
            <div
              key={branch.name}
              className={`sidebar-item ${branch.isCurrent ? 'current' : ''}`}
              title="Double-click to check out"
              onDoubleClick={() => checkoutLocal(controller, branch.name)}
              onContextMenu={(event) => showLocalBranchMenu(controller, event, branch.name)}
            >
              <span className="item-icon">{branch.isCurrent ? '✓' : '⑂'}</span>
              <span className="item-name">{branch.name}</span>
              <TrackingBadge ahead={branch.ahead} behind={branch.behind} />
            </div>
          ))}
        </Section>

        <Section title="Remote" count={view.remoteBranches.length}>
          {[...remoteGroups].map(([remote, branches]) => (
            <Section key={remote} title={remote} nested>
              {branches.map((remoteBranch) => (
                <div
                  key={remoteBranch}
                  className="sidebar-item"
                  title="Double-click to check out"
                  onDoubleClick={() => checkoutRemote(controller, remoteBranch)}
                  onContextMenu={(event) => showRemoteBranchMenu(controller, event, remoteBranch)}
                >
                  <span className="item-icon">☁</span>
                  <span className="item-name">{remoteBranch.slice(remote.length + 1)}</span>
                </div>
              ))}
            </Section>
          ))}
        </Section>

        <Section title="Stashes" count={view.stashes.length}>
          {view.stashes.map((stash) => (
            <div
              key={stash.sha}
              className="sidebar-item"
              title="Double-click to apply and drop (pop)"
              onDoubleClick={() => void controller.run('Popping stash', () => kraft.stashPop(stash.index), 'Stash popped')}
              onContextMenu={(event) => {
                event.preventDefault()
                controller.showMenu({
                  x: event.clientX,
                  y: event.clientY,
                  items: [
                    { label: 'Pop stash', onSelect: () => void controller.run('Popping stash', () => kraft.stashPop(stash.index), 'Stash popped') },
                    { label: 'Apply stash', onSelect: () => void controller.run('Applying stash', () => kraft.stashApply(stash.index), 'Stash applied') },
                    { label: 'Delete stash', danger: true, onSelect: () => void controller.run('Deleting stash', () => kraft.stashDrop(stash.index)) }
                  ]
                })
              }}
            >
              <span className="item-icon">⧉</span>
              <span className="item-name">{stash.message}</span>
            </div>
          ))}
        </Section>

        <Section title="Tags" count={view.tags.length} initiallyOpen={false}>
          {tags.map((tag) => (
            <div key={tag} className="sidebar-item">
              <span className="item-icon">⌂</span>
              <span className="item-name">{tag}</span>
            </div>
          ))}
        </Section>

        <GitFlowSection controller={controller} />
      </div>
    </nav>
  )
}

function GitFlowSection({ controller }: { controller: RepositoryController }) {
  const gitFlow = controller.view!.gitFlow
  if (!gitFlow) {
    return (
      <Section title="Gitflow">
        <div className="sidebar-empty">
          <button className="secondary" onClick={() => askInitGitFlow(controller)}>
            Initialize Gitflow
          </button>
        </div>
      </Section>
    )
  }
  const typeLabels: Record<GitFlowBranchType, string> = { feature: 'Feature', release: 'Release', hotfix: 'Hotfix' }
  return (
    <Section title="Gitflow">
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
          <Section key={type} title={`${typeLabels[type]}s`} nested>
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
          </Section>
        )
      })}
    </Section>
  )
}

interface SectionProps {
  title: string
  count?: number
  nested?: boolean
  initiallyOpen?: boolean
  children: ReactNode
}

function Section({ title, count, nested, initiallyOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <section className={nested ? 'sidebar-section nested' : 'sidebar-section'}>
      <button className="section-header" onClick={() => setOpen(!open)}>
        <span className="chevron">{open ? '▾' : '▸'}</span>
        <span className="section-title">{title}</span>
        {count !== undefined && <span className="section-count">{count}</span>}
      </button>
      {open && <div className="section-body">{children}</div>}
    </section>
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
