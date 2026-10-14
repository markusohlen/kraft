import type { Commit } from './entities'

/**
 * One row of the commit graph. Lanes never move sideways, so every edge is either a
 * straight vertical line or a diagonal into/out of this row's node.
 */
export interface GraphRow {
  commit: Commit
  /** Lane the commit's node is drawn in. */
  lane: number
  /** Lanes whose line enters the node from the top half of the row (children of this commit). */
  incomingLanes: number[]
  /** Lanes the node feeds into through the bottom half of the row (one per parent). */
  outgoingLanes: number[]
  /** Lanes unrelated to this commit that pass straight through the row. */
  passThroughLanes: number[]
}

export interface CommitGraph {
  rows: GraphRow[]
  laneCount: number
}

/**
 * Lays out commits (children before parents, e.g. `git log --date-order`) into lanes.
 * Each lane holds the sha it is waiting for; a commit takes the lane that expects it.
 */
export function layoutCommitGraph(commits: Commit[]): CommitGraph {
  const lanes: (string | null)[] = []
  const rows: GraphRow[] = []
  let laneCount = 0

  for (const commit of commits) {
    const incomingLanes = lanesExpecting(lanes, commit.sha)
    const lane = incomingLanes[0] ?? claimFreeLane(lanes)
    const passThroughLanes = activeLanes(lanes).filter((index) => lanes[index] !== commit.sha)

    for (const index of incomingLanes) lanes[index] = null
    const outgoingLanes = assignParentLanes(lanes, lane, commit.parents)

    rows.push({ commit, lane, incomingLanes, outgoingLanes, passThroughLanes })
    laneCount = Math.max(laneCount, lanes.length)
    trimTrailingFreeLanes(lanes)
  }

  return { rows, laneCount }
}

function assignParentLanes(lanes: (string | null)[], lane: number, parents: string[]): number[] {
  const outgoing: number[] = []
  parents.forEach((parent, position) => {
    const existing = lanes.indexOf(parent)
    // The first parent stays in this lane unless a lane further left already leads to it,
    // which keeps the mainline on the left instead of drifting right after every merge.
    const joinsExisting = existing !== -1 && (position > 0 || existing < lane)
    const target = joinsExisting ? existing : position === 0 ? lane : claimFreeLane(lanes)
    lanes[target] = parent
    outgoing.push(target)
  })
  return outgoing
}

function lanesExpecting(lanes: (string | null)[], sha: string): number[] {
  return activeLanes(lanes).filter((index) => lanes[index] === sha)
}

function activeLanes(lanes: (string | null)[]): number[] {
  return lanes.flatMap((value, index) => (value === null ? [] : [index]))
}

function claimFreeLane(lanes: (string | null)[]): number {
  const free = lanes.indexOf(null)
  if (free !== -1) return free
  lanes.push(null)
  return lanes.length - 1
}

function trimTrailingFreeLanes(lanes: (string | null)[]): void {
  while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
}
