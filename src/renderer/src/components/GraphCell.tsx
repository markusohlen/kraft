import { useId } from 'react'
import type { GraphRow } from '../../../domain/commitGraph'
import { useProfilePicture, type AvatarStyle } from '../avatars'
import { initials, laneColor } from '../format'

export const rowHeight = 30
const laneWidth = 18
const graphPadding = 10
const avatarRadius = 10
const mergeNodeRadius = 4.5
const stashNodeHalfSize = 9
/** How round the corner is where a line turns between a lane and a node. */
const cornerRadius = 8
const middle = rowHeight / 2

export function graphWidth(laneCount: number): number {
  return graphPadding * 2 + Math.max(laneCount, 1) * laneWidth
}

function laneX(lane: number): number {
  return graphPadding + lane * laneWidth + laneWidth / 2
}

interface GraphCellProps {
  row: GraphRow
  width: number
  /** Draws the thin line that links the row's branch pills to its node. */
  hasRefs: boolean
  avatarStyle: AvatarStyle
}

export function GraphCell({ row, width, hasRefs, avatarStyle }: GraphCellProps) {
  const nodeX = laneX(row.lane)
  const color = laneColor(row.lane)
  // Lines from a stash or the uncommitted changes to their commit are dotted.
  const outgoingDotted = row.kind !== 'commit'
  return (
    <svg className="graph-cell" width={width} height={rowHeight}>
      <rect className="row-band" x={nodeX} y={2} width={Math.max(0, width - nodeX)} height={rowHeight - 4} fill={color} />
      {hasRefs && <line className="ref-link" x1={0} y1={middle} x2={nodeX} y2={middle} stroke={color} />}
      {row.passThroughLanes.map((lane) => (
        <Edge key={`p${lane}`} d={`M ${laneX(lane)} 0 V ${rowHeight}`} color={laneColor(lane)} dotted={row.dottedPassThroughLanes.includes(lane)} />
      ))}
      {row.incomingLanes.map((lane) => (
        <Edge key={`i${lane}`} d={incomingPath(laneX(lane), nodeX)} color={laneColor(lane)} dotted={row.dottedIncomingLanes.includes(lane)} />
      ))}
      {row.outgoingLanes.map((lane) => (
        <Edge key={`o${lane}`} d={outgoingPath(nodeX, laneX(lane))} color={laneColor(lane)} dotted={outgoingDotted} />
      ))}
      <GraphNode row={row} x={nodeX} color={color} avatarStyle={avatarStyle} />
    </svg>
  )
}

function Edge({ d, color, dotted }: { d: string; color: string; dotted: boolean }) {
  return <path className={dotted ? 'edge dotted' : 'edge'} d={d} stroke={color} />
}

function GraphNode({ row, x, color, avatarStyle }: { row: GraphRow; x: number; color: string; avatarStyle: AvatarStyle }) {
  if (row.kind === 'work-in-progress') {
    return <circle className="wip-node" cx={x} cy={middle} r={avatarRadius} stroke={color} />
  }
  if (row.kind === 'stash') {
    const size = stashNodeHalfSize * 2
    return (
      <g className="stash-node" stroke={color}>
        <rect x={x - stashNodeHalfSize} y={middle - stashNodeHalfSize} width={size} height={size} rx={3} />
        {/* An inbox tray: stashed changes put aside. */}
        <path transform={`translate(${x} ${middle})`} d="M -5 0 H -2 L -1 2 H 1 L 2 0 H 5 V 4 H -5 Z M -3 -4.5 H 3 M -4 -2.2 H 4" />
      </g>
    )
  }
  if (row.commit.parents.length > 1) {
    return <circle cx={x} cy={middle} r={mergeNodeRadius} fill={color} />
  }
  return <AvatarNode x={x} color={color} name={row.commit.authorName} email={row.commit.authorEmail} avatarStyle={avatarStyle} />
}

interface AvatarNodeProps {
  x: number
  color: string
  name: string
  email: string
  avatarStyle: AvatarStyle
}

/** The author's picture (or initials) in a ring of the lane's color. */
function AvatarNode({ x, color, name, email, avatarStyle }: AvatarNodeProps) {
  const { url, onError } = useProfilePicture(email, avatarStyle)
  // Every row is its own <svg>, but clip-path ids are shared by the whole page, so each needs its own.
  const clipId = `avatar-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <g>
      <circle cx={x} cy={middle} r={avatarRadius + 2} fill={color} />
      <circle cx={x} cy={middle} r={avatarRadius} fill="#2b303b" />
      {url ? (
        <>
          <clipPath id={clipId}>
            <circle cx={x} cy={middle} r={avatarRadius} />
          </clipPath>
          <image
            href={url}
            x={x - avatarRadius}
            y={middle - avatarRadius}
            width={avatarRadius * 2}
            height={avatarRadius * 2}
            clipPath={`url(#${clipId})`}
            preserveAspectRatio="xMidYMid slice"
            onError={onError}
          />
        </>
      ) : (
        <text x={x} y={middle} className="avatar-text" fill={color}>
          {initials(name)}
        </text>
      )}
    </g>
  )
}

/** A child's line: straight down its own lane, then a rounded turn sideways into the node. */
function incomingPath(fromX: number, nodeX: number): string {
  if (fromX === nodeX) return `M ${fromX} 0 V ${middle}`
  const direction = Math.sign(nodeX - fromX)
  const radius = Math.min(cornerRadius, Math.abs(nodeX - fromX), middle)
  return `M ${fromX} 0 V ${middle - radius} Q ${fromX} ${middle} ${fromX + direction * radius} ${middle} H ${nodeX}`
}

/** A line to a parent in another lane: sideways out of the node, then a rounded turn down into that lane. */
function outgoingPath(nodeX: number, toX: number): string {
  if (nodeX === toX) return `M ${nodeX} ${middle} V ${rowHeight}`
  const direction = Math.sign(toX - nodeX)
  const radius = Math.min(cornerRadius, Math.abs(toX - nodeX), middle)
  return `M ${nodeX} ${middle} H ${toX - direction * radius} Q ${toX} ${middle} ${toX} ${middle + radius} V ${rowHeight}`
}
