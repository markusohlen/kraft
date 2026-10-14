import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { GraphRow } from '../../../domain/commitGraph'
import { hasUncommittedChanges, type RefLabel } from '../../../domain/entities'
import { checkoutLocal, checkoutRemote, showCommitMenu, showLocalBranchMenu, showRemoteBranchMenu } from '../actions'
import { formatFullDate, formatRelativeDate, laneColor } from '../format'
import type { RepositoryController } from '../useRepositoryController'
import { GraphCell, graphWidth, rowHeight, WipGraphCell, type WipConnector } from './GraphCell'

/** Rows rendered above and below the visible area so scrolling stays smooth. */
const overscanRows = 15
const maxGraphLanes = 14

export function CommitGraphView({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const { rows, laneCount } = view.graph
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const showWip = hasUncommittedChanges(view.status)
  const headIndex = rows.findIndex((row) => row.commit.refs.some((ref) => ref.kind === 'head'))
  const wipLane = headIndex === -1 ? 0 : rows[headIndex].lane
  const width = graphWidth(Math.min(laneCount, maxGraphLanes))
  const offset = showWip ? 1 : 0
  const totalRows = rows.length + offset

  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows)
  const last = Math.min(totalRows, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows)
  const visibleIndexes = Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index)

  const wipConnectorFor = (rowIndex: number, row: GraphRow): WipConnector => {
    if (!showWip || headIndex === -1 || rowIndex > headIndex) return 'none'
    if (rowIndex === headIndex) return 'into-node'
    return laneIsFree(row, wipLane) ? 'through' : 'none'
  }

  const selectCommit = (sha: string) => {
    controller.setDiff(null)
    controller.setSelection({ kind: 'commit', sha })
  }

  return (
    <div className="graph">
      <div className="graph-header">
        <div className="col-refs">Branch / Tag</div>
        <div className="col-graph" style={{ width }}>
          Graph
        </div>
        <div className="col-message">Commit message</div>
        <div className="col-author">Author</div>
        <div className="col-date">Date</div>
      </div>
      <div className="graph-scroll" ref={scrollRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {totalRows === 0 && <div className="empty-state">This repository has no commits yet.</div>}
        <div style={{ height: totalRows * rowHeight, position: 'relative' }}>
          {visibleIndexes.map((index) => {
            const top = index * rowHeight
            if (showWip && index === 0) {
              return (
                <div
                  key="wip"
                  className={`graph-row wip-row ${controller.selection?.kind === 'wip' ? 'selected' : ''}`}
                  style={{ top }}
                  onClick={() => {
                    controller.setDiff(null)
                    controller.setSelection({ kind: 'wip' })
                  }}
                >
                  <div className="col-refs" />
                  <div className="col-graph" style={{ width }}>
                    <WipGraphCell width={width} lane={wipLane} />
                  </div>
                  <div className="col-message wip-label">// WIP</div>
                  <div className="col-author" />
                  <div className="col-date">{changeCount(controller)} changes</div>
                </div>
              )
            }
            const rowIndex = index - offset
            const row = rows[rowIndex]
            const selected = controller.selection?.kind === 'commit' && controller.selection.sha === row.commit.sha
            return (
              <div
                key={row.commit.sha}
                className={`graph-row ${selected ? 'selected' : ''}`}
                style={{ top }}
                onClick={() => selectCommit(row.commit.sha)}
                onContextMenu={(event) => showCommitMenu(controller, event, row.commit.sha)}
              >
                <div className="col-refs">
                  <RefPills controller={controller} refs={row.commit.refs} color={laneColor(row.lane)} />
                </div>
                <div className="col-graph" style={{ width }}>
                  <GraphCell row={row} width={width} wipConnector={wipConnectorFor(rowIndex, row)} wipLane={wipLane} />
                </div>
                <div className="col-message" title={row.commit.subject}>
                  {row.commit.subject}
                </div>
                <div className="col-author" title={row.commit.authorEmail}>
                  {row.commit.authorName}
                </div>
                <div className="col-date" title={formatFullDate(row.commit.date)}>
                  {formatRelativeDate(row.commit.date)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface Pill {
  label: string
  kind: 'local' | 'remote' | 'tag'
  isHead: boolean
  hasRemote: boolean
  refName: string
}

function RefPills({ controller, refs, color }: { controller: RepositoryController; refs: RefLabel[]; color: string }) {
  const pills = toPills(refs)
  if (pills.length === 0) return null
  const [primary, ...others] = pills

  const checkout = (pill: Pill) => {
    if (pill.kind === 'local') checkoutLocal(controller, pill.refName)
    else if (pill.kind === 'remote') checkoutRemote(controller, pill.refName)
  }
  const menu = (event: MouseEvent, pill: Pill) => {
    event.stopPropagation()
    if (pill.kind === 'local') showLocalBranchMenu(controller, event, pill.refName)
    else if (pill.kind === 'remote') showRemoteBranchMenu(controller, event, pill.refName)
  }

  return (
    <div className="ref-pills">
      <span
        className={`ref-pill ${primary.isHead ? 'head' : ''} ${primary.kind}`}
        style={{ borderColor: color, background: primary.isHead ? color : undefined }}
        title={pills.map((pill) => pill.label).join('\n')}
        onDoubleClick={(event) => {
          event.stopPropagation()
          checkout(primary)
        }}
        onContextMenu={(event) => menu(event, primary)}
      >
        {primary.isHead && <span className="pill-icon">✓</span>}
        {primary.kind === 'tag' && <span className="pill-icon">⌂</span>}
        <span className="pill-label">{primary.label}</span>
        {primary.hasRemote && <span className="pill-icon">☁</span>}
      </span>
      {others.length > 0 && (
        <span className="ref-more" style={{ borderColor: color }} title={others.map((pill) => pill.label).join('\n')}>
          +{others.length}
        </span>
      )}
    </div>
  )
}

/** Merges a local branch with its same-named remote branch into one pill, as GitKraken does. */
function toPills(refs: RefLabel[]): Pill[] {
  const locals = refs.filter((ref) => ref.kind === 'head' || ref.kind === 'local')
  const localNames = new Set(locals.map((ref) => ref.name))
  const remoteNames = refs.filter((ref) => ref.kind === 'remote').map((ref) => ref.name)
  const hasRemote = (name: string) => remoteNames.some((remote) => remote.slice(remote.indexOf('/') + 1) === name)

  const pills: Pill[] = locals
    .filter((ref) => ref.name !== 'HEAD')
    .map((ref) => ({
      label: ref.name,
      kind: 'local',
      isHead: ref.kind === 'head',
      hasRemote: hasRemote(ref.name),
      refName: ref.name
    }))
  for (const remote of remoteNames) {
    if (!localNames.has(remote.slice(remote.indexOf('/') + 1))) {
      pills.push({ label: remote, kind: 'remote', isHead: false, hasRemote: true, refName: remote })
    }
  }
  for (const ref of refs.filter((candidate) => candidate.kind === 'tag')) {
    pills.push({ label: ref.name, kind: 'tag', isHead: false, hasRemote: false, refName: ref.name })
  }
  return pills.sort((a, b) => Number(b.isHead) - Number(a.isHead))
}

function laneIsFree(row: GraphRow, lane: number): boolean {
  return (
    row.lane !== lane &&
    !row.passThroughLanes.includes(lane) &&
    !row.incomingLanes.includes(lane) &&
    !row.outgoingLanes.includes(lane)
  )
}

function changeCount(controller: RepositoryController): number {
  const { staged, unstaged } = controller.view!.status
  return new Set([...staged, ...unstaged].map((change) => change.path)).size
}
