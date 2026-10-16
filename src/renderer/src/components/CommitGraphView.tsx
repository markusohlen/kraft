import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { rowKey, type GraphRow } from '../../../domain/commitGraph'
import type { RefLabel } from '../../../domain/entities'
import { checkoutLocal, checkoutRemote, showCommitMenu, showLocalBranchMenu, showRemoteBranchMenu, showStashMenu } from '../actions'
import { formatFullDate, formatRelativeDate, laneColor, stashSummary } from '../format'
import type { RepositoryController, Selection } from '../useRepositoryController'
import { usePanelSize } from '../usePanelSize'
import { ResizeHandle } from './ResizeHandle'
import { IssueKeyText } from './JiraIssues'
import { GraphCell, graphWidth, rowHeight } from './GraphCell'
import { LocalIcon, RemoteIcon } from './Icons'

/** Rows rendered above and below the visible area so scrolling stays smooth. */
const overscanRows = 15
const maxGraphLanes = 14

export function CommitGraphView({ controller }: { controller: RepositoryController }) {
  const view = controller.view!
  const { rows, laneCount } = view.graph
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(800)
  const refsColumn = usePanelSize('kraft.refsColumnWidth', { initial: 200, min: 90, max: 480 })
  const authorColumn = usePanelSize('kraft.authorColumnWidth', { initial: 140, min: 60, max: 320 })
  const dateColumn = usePanelSize('kraft.dateColumnWidth', { initial: 120, min: 70, max: 260 })
  const columnWidths = {
    '--refs-width': `${refsColumn.size}px`,
    '--author-width': `${authorColumn.size}px`,
    '--date-width': `${dateColumn.size}px`
  } as CSSProperties

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewportHeight(element.clientHeight))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const width = graphWidth(Math.min(laneCount, maxGraphLanes))
  const first = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows)
  const last = Math.min(rows.length, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows)
  const visibleIndexes = Array.from({ length: Math.max(0, last - first) }, (_, index) => first + index)
  const selectedKey = selectionKey(controller.selection)

  return (
    <div className="graph" style={columnWidths}>
      <div className="graph-header">
        <div className="col-refs">
          Branch / Tag
          <ResizeHandle className="column-resize right" size={refsColumn.size} onResize={refsColumn.resize} direction={1} />
        </div>
        <div className="col-graph" style={{ width }}>
          Graph
        </div>
        <div className="col-message">Commit message</div>
        <div className="col-author">
          <ResizeHandle className="column-resize left" size={authorColumn.size} onResize={authorColumn.resize} direction={-1} />
          Author
        </div>
        <div className="col-date">
          <ResizeHandle className="column-resize left" size={dateColumn.size} onResize={dateColumn.resize} direction={-1} />
          Date
        </div>
      </div>
      <div className="graph-scroll" ref={scrollRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {rows.length === 0 && <div className="empty-state">This repository has no commits yet.</div>}
        <div style={{ height: rows.length * rowHeight, position: 'relative' }}>
          {visibleIndexes.map((index) => (
            <GraphRowView
              key={rowKey(rows[index])}
              controller={controller}
              row={rows[index]}
              top={index * rowHeight}
              width={width}
              selected={rowKey(rows[index]) === selectedKey}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface GraphRowViewProps {
  controller: RepositoryController
  row: GraphRow
  top: number
  width: number
  selected: boolean
}

/** One row: the lane color tints the graph band, the bar beside the message and the branch pills. */
function GraphRowView({ controller, row, top, width, selected }: GraphRowViewProps) {
  const color = laneColor(row.lane)
  const style = { top, '--lane-color': color } as CSSProperties
  const select = () => {
    controller.setDiff(null)
    controller.setSelection(selectionFor(row))
  }
  const className = `graph-row ${row.kind}-row ${selected ? 'selected' : ''}`

  if (row.kind === 'work-in-progress') {
    return (
      <div className={className} style={style} onClick={select}>
        <div className="col-refs" />
        <div className="col-graph" style={{ width }}>
          <GraphCell row={row} width={width} hasRefs={false} avatarStyle={controller.avatarStyle} />
        </div>
        <div className="col-message">
          <span className="wip-box">WIP</span>
          <span className="wip-count" title="Files with uncommitted changes">
            ✎ {changeCount(controller)}
          </span>
        </div>
        <div className="col-author" />
        <div className="col-date" />
      </div>
    )
  }

  if (row.kind === 'stash') {
    const { stash } = row
    return (
      <div className={className} style={style} onClick={select} onContextMenu={(event) => showStashMenu(controller, event, stash)}>
        <div className="col-refs" />
        <div className="col-graph" style={{ width }}>
          <GraphCell row={row} width={width} hasRefs={false} avatarStyle={controller.avatarStyle} />
        </div>
        <div className="col-message" title={stash.message}>
          {stashSummary(stash.message)}
        </div>
        <div className="col-author muted">stash@{`{${stash.index}}`}</div>
        <div className="col-date" title={formatFullDate(stash.date)}>
          {formatRelativeDate(stash.date)}
        </div>
      </div>
    )
  }

  const { commit } = row
  return (
    <div className={className} style={style} onClick={select} onContextMenu={(event) => showCommitMenu(controller, event, commit.sha)}>
      <div className="col-refs">
        <RefPills controller={controller} refs={commit.refs} color={color} />
      </div>
      <div className="col-graph" style={{ width }}>
        <GraphCell row={row} width={width} hasRefs={toPills(commit.refs).length > 0} avatarStyle={controller.avatarStyle} />
      </div>
      <div className="col-message" title={commit.subject}>
        <IssueKeyText controller={controller} text={commit.subject} />
      </div>
      <div className="col-author" title={commit.authorEmail}>
        {commit.authorName}
      </div>
      <div className="col-date" title={formatFullDate(commit.date)}>
        {formatRelativeDate(commit.date)}
      </div>
    </div>
  )
}

function selectionFor(row: GraphRow): Selection {
  if (row.kind === 'commit') return { kind: 'commit', sha: row.commit.sha }
  return row.kind === 'stash' ? { kind: 'stash', sha: row.stash.sha } : { kind: 'wip' }
}

/** The {@link rowKey} of the selected row. */
function selectionKey(selection: Selection): string | null {
  if (!selection) return null
  if (selection.kind === 'commit') return selection.sha
  return selection.kind === 'stash' ? `stash:${selection.sha}` : 'work-in-progress'
}

interface Pill {
  label: string
  kind: 'local' | 'remote' | 'tag'
  isHead: boolean
  hasRemote: boolean
  refName: string
}

/** Delays that keep the branch list from flickering open while the mouse merely crosses a row. */
const popoverOpenDelayMs = 250
const popoverCloseDelayMs = 200
const popoverMaxHeight = 320

function RefPills({ controller, refs, color }: { controller: RepositoryController; refs: RefLabel[]; color: string }) {
  const pills = toPills(refs)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const hoverTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  const close = useCallback(() => {
    window.clearTimeout(hoverTimer.current)
    setAnchor(null)
  }, [])
  if (pills.length === 0) return null
  const [primary, ...others] = pills

  const later = (action: () => void, delayMs: number) => {
    window.clearTimeout(hoverTimer.current)
    hoverTimer.current = window.setTimeout(action, delayMs)
  }
  const keepOpen = () => window.clearTimeout(hoverTimer.current)

  const checkout = (pill: Pill) => {
    close()
    if (pill.kind === 'local') checkoutLocal(controller, pill.refName)
    else if (pill.kind === 'remote') checkoutRemote(controller, pill.refName)
  }
  const menu = (event: MouseEvent, pill: Pill) => {
    event.stopPropagation()
    close()
    if (pill.kind === 'local') showLocalBranchMenu(controller, event, pill.refName)
    else if (pill.kind === 'remote') showRemoteBranchMenu(controller, event, pill.refName)
  }
  const hoverHandlers =
    others.length > 0
      ? {
          onMouseEnter: (event: MouseEvent<HTMLDivElement>) => {
            const rect = event.currentTarget.getBoundingClientRect()
            later(() => setAnchor(rect), anchor ? 0 : popoverOpenDelayMs)
          },
          onMouseLeave: () => later(() => setAnchor(null), popoverCloseDelayMs)
        }
      : {}

  return (
    <>
      <div className="ref-pills" {...hoverHandlers}>
        <span
          className={`ref-pill ${primary.isHead ? 'head' : ''} ${primary.kind}`}
          style={pillColors(color, primary.isHead)}
          title={others.length === 0 ? primary.label : undefined}
          onDoubleClick={(event) => {
            event.stopPropagation()
            checkout(primary)
          }}
          onContextMenu={(event) => menu(event, primary)}
        >
          <PillIcons pill={primary} position="before" />
          <span className="pill-label">{primary.label}</span>
          <PillIcons pill={primary} position="after" />
        </span>
        {others.length > 0 && (
          <span className="ref-more" style={pillColors(color, false)}>
            +{others.length}
          </span>
        )}
        <span className="ref-connector" />
      </div>
      {anchor &&
        createPortal(
          <RefPopover
            pills={pills}
            anchor={anchor}
            color={color}
            busy={controller.busyLabel !== null}
            onCheckout={checkout}
            onMenu={menu}
            onMouseEnter={keepOpen}
            onMouseLeave={() => later(() => setAnchor(null), popoverCloseDelayMs)}
            onClose={close}
          />,
          document.body
        )}
    </>
  )
}

interface RefPopoverProps {
  pills: Pill[]
  anchor: DOMRect
  color: string
  busy: boolean
  onCheckout: (pill: Pill) => void
  onMenu: (event: MouseEvent, pill: Pill) => void
  onMouseEnter: () => void
  onMouseLeave: () => void
  onClose: () => void
}

/** Lists every branch and tag on a commit so each one can be checked out on its own. */
function RefPopover({ pills, anchor, color, busy, onCheckout, onMenu, onMouseEnter, onMouseLeave, onClose }: RefPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // The anchor rectangle goes stale once the graph scrolls, so close instead of floating over another row.
    const closeOnOutsideScroll = (event: Event) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('scroll', closeOnOutsideScroll, true)
    return () => window.removeEventListener('scroll', closeOnOutsideScroll, true)
  }, [onClose])

  const opensUpward = anchor.bottom + popoverMaxHeight > window.innerHeight
  const position = opensUpward
    ? { left: anchor.left, bottom: window.innerHeight - anchor.top }
    : { left: anchor.left, top: anchor.bottom }

  return (
    <div
      ref={popoverRef}
      className="ref-popover"
      style={{ ...position, maxHeight: popoverMaxHeight, borderColor: color }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      // Portaled events still bubble through React to the graph row; keep them from selecting the commit.
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      {pills.map((pill) => {
        const canCheckout = pill.kind !== 'tag' && !pill.isHead
        return (
          <div
            key={`${pill.kind}:${pill.refName}`}
            className={`ref-popover-item ${pill.isHead ? 'current' : ''}`}
            title={canCheckout ? 'Double-click to check out' : undefined}
            onDoubleClick={() => canCheckout && !busy && onCheckout(pill)}
            onContextMenu={(event) => pill.kind !== 'tag' && onMenu(event, pill)}
          >
            <span className="item-icon">{refIcon(pill)}</span>
            <span className="item-name">{pill.label}</span>
            {pill.hasRemote && pill.kind === 'local' && <span className="pill-icon muted">☁</span>}
            {canCheckout && (
              <button className="item-action" disabled={busy} onClick={() => onCheckout(pill)}>
                Checkout
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function refIcon(pill: Pill): string {
  if (pill.isHead) return '✓'
  if (pill.kind === 'tag') return '⌂'
  if (pill.kind === 'remote') return '☁'
  return '⑂'
}

function PillIcons({ pill, position }: { pill: Pill; position: 'before' | 'after' }) {
  if (position === 'after') {
    return (
      <>
        {pill.kind === 'local' && <LocalIcon />}
        {pill.hasRemote && <RemoteIcon />}
      </>
    )
  }
  if (pill.isHead) return <span className="pill-icon">✓</span>
  if (pill.kind === 'tag') return <span className="pill-icon">⌂</span>
  return null
}

/** The checked-out branch is filled with its lane color; other pills get a tinted version of it. */
function pillColors(color: string, isHead: boolean): CSSProperties {
  return isHead ? { background: color, borderColor: color } : { background: `${color}40`, borderColor: `${color}99` }
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

function changeCount(controller: RepositoryController): number {
  const { staged, unstaged } = controller.view!.status
  return new Set([...staged, ...unstaged].map((change) => change.path)).size
}
