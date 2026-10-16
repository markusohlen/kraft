import type { Commit, Stash } from './entities'

/**
 * Where a row's lines run. A branch line keeps its lane until it reaches its parent and curves
 * into the parent's node there; a merge's extra parents curve out of the merge node into theirs.
 */
interface GraphRowLanes {
  /** Lane the row's node is drawn in. */
  lane: number
  /** Lanes whose line enters the node from the top half of the row (children of this node). */
  incomingLanes: number[]
  /** Lanes the node feeds into through the bottom half of the row (one per parent). */
  outgoingLanes: number[]
  /** Lanes unrelated to this row that pass straight through it. */
  passThroughLanes: number[]
  /** The incoming lanes that bring a dotted line from a stash or the uncommitted changes. */
  dottedIncomingLanes: number[]
  /** The pass-through lanes that carry such a dotted line. Outgoing lanes are dotted when the row is a stash or the changes. */
  dottedPassThroughLanes: number[]
}

export type GraphRow = GraphRowLanes &
  ({ kind: 'commit'; commit: Commit } | { kind: 'stash'; stash: Stash } | { kind: 'work-in-progress' })

export type CommitRow = GraphRow & { kind: 'commit' }

export interface CommitGraph {
  rows: GraphRow[]
  laneCount: number
}

export interface GraphExtras {
  /** Each stash is drawn above the commit it was made on, joined to it by a dotted line. */
  stashes?: readonly Stash[]
  /** Uncommitted changes, drawn as the first row and joined to the commit they are based on (HEAD). */
  workInProgress?: { baseSha: string | null }
}

type LinkKind = 'stash' | 'work-in-progress'

interface Entry {
  content: { kind: 'commit'; commit: Commit } | { kind: 'stash'; stash: Stash } | { kind: 'work-in-progress' }
  sha: string
  parents: string[]
  /** Milliseconds since 1970, for placing stashes among the commits. */
  date: number
  /** Set for rows whose line to their parent is dotted. */
  link: LinkKind | null
}

/** Never a real sha, so no commit can mistake the uncommitted changes for its parent. */
const workInProgressKey = 'work-in-progress'

/**
 * Lays out commits (children before parents, e.g. `git log --date-order`) into lanes,
 * together with stashes and uncommitted changes. Each lane holds the sha it is waiting for;
 * a node takes the leftmost lane that expects it.
 */
export function layoutCommitGraph(commits: Commit[], extras: GraphExtras = {}): CommitGraph {
  const lanes: (string | null)[] = []
  /** What kind of dotted line each lane carries, if any; only meaningful while the lane is in use. */
  const links: (LinkKind | null)[] = []
  const rows: GraphRow[] = []
  let laneCount = 0

  for (const entry of orderEntries(commits, extras)) {
    const incomingLanes = lanesExpecting(lanes, entry.sha)
    // A stash's dotted line never decides where its base commit sits; the branch (or the changes) does.
    const lane = incomingLanes.find((index) => links[index] !== 'stash') ?? incomingLanes[0] ?? claimFreeLane(lanes)
    const passThroughLanes = activeLanes(lanes).filter((index) => lanes[index] !== entry.sha)
    const dottedIncomingLanes = incomingLanes.filter((index) => links[index] !== null)
    const dottedPassThroughLanes = passThroughLanes.filter((index) => links[index] !== null)

    for (const index of incomingLanes) {
      lanes[index] = null
      links[index] = null
    }
    const outgoingLanes = assignParentLanes(lanes, links, lane, entry)

    rows.push({ ...entry.content, lane, incomingLanes, outgoingLanes, passThroughLanes, dottedIncomingLanes, dottedPassThroughLanes })
    laneCount = Math.max(laneCount, lanes.length)
    trimTrailingFreeLanes(lanes)
  }

  return { rows, laneCount }
}

/** A stable identity for a row, e.g. for React keys. */
export function rowKey(row: GraphRow): string {
  if (row.kind === 'commit') return row.commit.sha
  return row.kind === 'stash' ? `stash:${row.stash.sha}` : workInProgressKey
}

/** The commits in order, with each stash placed by its date but always above its base, and the changes on top. */
function orderEntries(commits: Commit[], extras: GraphExtras): Entry[] {
  const entries: Entry[] = commits.map((commit) => ({
    content: { kind: 'commit', commit },
    sha: commit.sha,
    parents: commit.parents,
    date: Date.parse(commit.date),
    link: null
  }))
  const isLoaded = (sha: string) => entries.some((entry) => entry.content.kind === 'commit' && entry.sha === sha)

  const newestFirst = [...(extras.stashes ?? [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  for (const stash of newestFirst) {
    // A stash whose base is older than the loaded history has nothing to attach to.
    if (!isLoaded(stash.baseSha)) continue
    const date = Date.parse(stash.date)
    const baseIndex = entries.findIndex((entry) => entry.content.kind === 'commit' && entry.sha === stash.baseSha)
    const firstOlder = entries.findIndex((entry) => entry.date < date)
    const position = firstOlder === -1 ? baseIndex : Math.min(firstOlder, baseIndex)
    entries.splice(position, 0, { content: { kind: 'stash', stash }, sha: stash.sha, parents: [stash.baseSha], date, link: 'stash' })
  }

  if (extras.workInProgress) {
    const { baseSha } = extras.workInProgress
    entries.unshift({
      content: { kind: 'work-in-progress' },
      sha: workInProgressKey,
      parents: baseSha && isLoaded(baseSha) ? [baseSha] : [],
      date: Number.POSITIVE_INFINITY,
      link: 'work-in-progress'
    })
  }
  return entries
}

function assignParentLanes(lanes: (string | null)[], links: (LinkKind | null)[], lane: number, entry: Entry): number[] {
  return entry.parents.map((parent, position) => {
    // The first parent continues in this lane. Other parents of a merge join a lane already
    // heading to them, so merges don't widen the graph; dotted lines are never joined.
    const existing = lanes.findIndex((expected, index) => expected === parent && links[index] === null)
    const target = position === 0 ? lane : existing !== -1 && entry.link === null ? existing : claimFreeLane(lanes)
    lanes[target] = parent
    links[target] = entry.link
    return target
  })
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
