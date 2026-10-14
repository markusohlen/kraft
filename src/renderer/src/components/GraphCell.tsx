import type { GraphRow } from '../../../domain/commitGraph'
import { initials, laneColor } from '../format'

export const rowHeight = 34
const laneWidth = 20
const graphPadding = 8
const avatarRadius = 11
const mergeNodeRadius = 5
const middle = rowHeight / 2

export function graphWidth(laneCount: number): number {
  return graphPadding * 2 + Math.max(laneCount, 1) * laneWidth
}

function laneX(lane: number): number {
  return graphPadding + lane * laneWidth + laneWidth / 2
}

/** How the dashed line from the WIP row to the HEAD commit crosses this row. */
export type WipConnector = 'none' | 'through' | 'into-node'

interface GraphCellProps {
  row: GraphRow
  width: number
  wipConnector: WipConnector
  wipLane: number
}

export function GraphCell({ row, width, wipConnector, wipLane }: GraphCellProps) {
  const nodeX = laneX(row.lane)
  const isMerge = row.commit.parents.length > 1
  return (
    <svg className="graph-cell" width={width} height={rowHeight}>
      {wipConnector !== 'none' && (
        <line
          className="wip-line"
          x1={laneX(wipLane)}
          y1={0}
          x2={laneX(wipLane)}
          y2={wipConnector === 'through' ? rowHeight : middle}
          stroke={laneColor(wipLane)}
        />
      )}
      {row.passThroughLanes.map((lane) => (
        <line key={`p${lane}`} x1={laneX(lane)} y1={0} x2={laneX(lane)} y2={rowHeight} stroke={laneColor(lane)} strokeWidth={2} />
      ))}
      {row.incomingLanes.map((lane) => (
        <path key={`i${lane}`} d={edgePath(laneX(lane), 0, nodeX, middle)} stroke={laneColor(lane)} strokeWidth={2} fill="none" />
      ))}
      {row.outgoingLanes.map((lane) => (
        <path key={`o${lane}`} d={edgePath(nodeX, middle, laneX(lane), rowHeight)} stroke={laneColor(lane)} strokeWidth={2} fill="none" />
      ))}
      {isMerge ? (
        <circle cx={nodeX} cy={middle} r={mergeNodeRadius} fill={laneColor(row.lane)} />
      ) : (
        <g>
          <circle cx={nodeX} cy={middle} r={avatarRadius + 2} fill={laneColor(row.lane)} />
          <circle cx={nodeX} cy={middle} r={avatarRadius} fill="#2b303b" />
          <text x={nodeX} y={middle} className="avatar-text" fill={laneColor(row.lane)}>
            {initials(row.commit.authorName)}
          </text>
        </g>
      )}
    </svg>
  )
}

export function WipGraphCell({ width, lane }: { width: number; lane: number }) {
  const x = laneX(lane)
  return (
    <svg className="graph-cell" width={width} height={rowHeight}>
      <line className="wip-line" x1={x} y1={middle} x2={x} y2={rowHeight} stroke={laneColor(lane)} />
      <circle className="wip-node" cx={x} cy={middle} r={avatarRadius} stroke={laneColor(lane)} />
    </svg>
  )
}

/** Straight line within a lane; an S-curve when moving between lanes. */
function edgePath(fromX: number, fromY: number, toX: number, toY: number): string {
  if (fromX === toX) return `M ${fromX} ${fromY} L ${toX} ${toY}`
  const bend = (toY - fromY) / 2
  return `M ${fromX} ${fromY} C ${fromX} ${fromY + bend}, ${toX} ${toY - bend}, ${toX} ${toY}`
}
