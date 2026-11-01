import type { KraftApi } from '../../../application/kraftApi'
import type { LineAction } from '../../../application/lineOperations'
import { parseUnifiedDiff, type DiffLine, type DiffOptions } from '../../../domain/diff'
import type { FileChange } from '../../../domain/entities'
import { isEmptySelection, selectedLineCount, selectionOf, type LineSelection } from '../../../domain/lineChanges'

export type LineActionApi = Pick<KraftApi, 'changeLines'>

export interface LineMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

export interface LineActionView {
  /** Runs an operation with the busy indicator; a failure becomes an error notice, so this never rejects. */
  run(label: string, operation: () => Promise<unknown>): Promise<void>
  confirmDiscard(title: string, onConfirm: () => void): void
}

export interface LineActionTarget {
  change: FileChange
  staged: boolean
  shownDiff: string
  options: DiffOptions
  selection: LineSelection
  /** Called once the action is over, whether it worked or not, to show the diff as it now is. */
  onDone: () => void
}

const runningLabels: Record<LineAction, string> = { stage: 'Staging lines', unstage: 'Unstaging lines', discard: 'Discarding lines' }

/**
 * The rows a line action covers: those under the marked text when the right-clicked row is among them, so a
 * selection is acted on as a whole; otherwise just the right-clicked row. A row of a split diff can hold two lines.
 */
export function linesForAction(rows: readonly (readonly (DiffLine | null)[])[], clickedRow: number, markedRows: readonly number[]): LineSelection {
  const covered = markedRows.includes(clickedRow) ? markedRows : [clickedRow]
  return selectionOf(covered.flatMap((row) => rows[row] ?? []))
}

function lineCountText(shownDiff: string, selection: LineSelection): string {
  const count = selectedLineCount(parseUnifiedDiff(shownDiff), selection)
  return count === 1 ? 'line' : `${count} lines`
}

/** The right-click menu for lines picked in a working-tree diff. */
export class LineActionPresenter {
  constructor(
    private readonly api: LineActionApi,
    private readonly view: LineActionView
  ) {}

  menuItems(target: LineActionTarget): LineMenuItem[] {
    if (isEmptySelection(target.selection)) return []
    const lines = lineCountText(target.shownDiff, target.selection)
    if (target.staged) return [{ label: `Unstage ${lines}`, onSelect: () => this.act('unstage', target) }]
    return [
      { label: `Stage ${lines}`, onSelect: () => this.act('stage', target) },
      {
        label: `Discard ${lines}`,
        danger: true,
        onSelect: () => this.view.confirmDiscard(`Discard ${lines} in ${target.change.path}?`, () => this.act('discard', target))
      }
    ]
  }

  private act(action: LineAction, target: LineActionTarget): void {
    const { change, shownDiff, options, selection } = target
    void this.view.run(runningLabels[action], () => this.api.changeLines({ action, change, shownDiff, options, selection })).then(target.onDone)
  }
}
