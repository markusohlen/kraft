import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseUnifiedDiff, toSplitRows, type DiffLine, type DiffOptions, type ParsedDiff } from '../../../domain/diff'
import { highlightDiff, withChangedText } from '../diffHighlight'
import { kraft } from '../kraftClient'
import { languageFor, type HighlightedLine } from '../syntaxHighlight'
import { usePreference } from '../usePreference'
import type { FileDiffTarget, RepositoryController } from '../useRepositoryController'

type DiffLayout = 'unified' | 'split'

/** The syntax tokens of each line of the diff; empty for files without a known language. */
type LineHighlights = Map<DiffLine, HighlightedLine>

const layouts: readonly DiffLayout[] = ['unified', 'split']
const fullFileChoices: readonly boolean[] = [true, false]

/** A table row, with the index of the change (run of changed lines) it belongs to, if any. */
type Row =
  | { kind: 'hunk'; header: string }
  | { kind: 'note'; text: string }
  | { kind: 'line'; line: DiffLine; change: number | null; startsChange: boolean }
  | { kind: 'pair'; left: DiffLine | null; right: DiffLine | null; change: number | null; startsChange: boolean }

export function DiffView({ controller, target }: { controller: RepositoryController; target: FileDiffTarget }) {
  const [layout, setLayout] = usePreference<DiffLayout>('kraft.diffLayout', 'split', layouts)
  const [fullFile, setFullFile] = usePreference<boolean>('kraft.diffFullFile', false, fullFileChoices)
  const [diffText, setDiffText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentChange, setCurrentChange] = useState(-1)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let current = true
    setDiffText(null)
    setError(null)
    setCurrentChange(-1)
    const request = requestDiff(target, { fullFile })
    request.then(
      (text) => current && setDiffText(text),
      (failure: Error) => current && setError(failure.message)
    )
    return () => {
      current = false
    }
  }, [target, fullFile])

  const parsed = useMemo(() => (diffText === null ? null : parseUnifiedDiff(diffText)), [diffText])
  // A whole-file diff is one big hunk, so its header says nothing useful.
  const { rows, changeCount } = useMemo(() => layoutRows(parsed, layout, !fullFile), [parsed, layout, fullFile])
  const language = languageFor(target.change.path)
  const highlights = useMemo(() => highlightDiff(parsed?.hunks ?? [], language), [parsed, language])

  const goToChange = useCallback((index: number) => {
    setCurrentChange(index)
    bodyRef.current?.querySelector(`[data-change-start="${index}"]`)?.scrollIntoView({ block: 'center' })
  }, [])

  // With the whole file shown, the first change may be far down; jump to it.
  useEffect(() => {
    if (fullFile && changeCount > 0) goToChange(0)
  }, [parsed, fullFile, changeCount, goToChange])

  const subtitle = diffSubtitle(controller, target)

  return (
    <div className={`diff ${language ? 'syntax' : ''}`}>
      <div className="diff-header">
        <div className="diff-title">
          <div className="diff-path">{target.change.path}</div>
          <div className="muted small">
            {subtitle}
            {target.change.oldPath ? ` · renamed from ${target.change.oldPath}` : ''}
          </div>
        </div>
        <div className="diff-tools">
          <span className="muted small change-counter">
            {changeCount === 0
              ? 'No changes'
              : currentChange >= 0
                ? `Change ${currentChange + 1} of ${changeCount}`
                : `${changeCount} change${changeCount === 1 ? '' : 's'}`}
          </span>
          <span className="button-group">
            <button className="secondary small" title="Previous change" disabled={currentChange <= 0} onClick={() => goToChange(currentChange - 1)}>
              ↑
            </button>
            <button
              className="secondary small"
              title="Next change"
              disabled={currentChange >= changeCount - 1}
              onClick={() => goToChange(currentChange + 1)}
            >
              ↓
            </button>
          </span>
          <span className="button-group">
            <button className={`secondary small ${layout === 'unified' ? 'active' : ''}`} title="Old and new lines in one column" onClick={() => setLayout('unified')}>
              Unified
            </button>
            <button className={`secondary small ${layout === 'split' ? 'active' : ''}`} title="Old version left, new version right" onClick={() => setLayout('split')}>
              Split
            </button>
          </span>
          <button
            className={`secondary small ${fullFile ? 'active' : ''}`}
            title={fullFile ? 'Show only the lines around each change' : 'Show the whole file'}
            onClick={() => setFullFile(!fullFile)}
          >
            Full file
          </button>
          <button
            className={`secondary small ${controller.diffExpanded ? 'active' : ''}`}
            title={controller.diffExpanded ? 'Show the branch sidebar again' : 'Hide the branch sidebar to give the diff more room'}
            onClick={() => controller.setDiffExpanded(!controller.diffExpanded)}
          >
            Expand
          </button>
          <button className="icon-button" title="Close diff" onClick={() => controller.setDiff(null)}>
            ✕
          </button>
        </div>
      </div>
      <div className="diff-body" ref={bodyRef}>
        {error && <div className="empty-state error-text">{error}</div>}
        {parsed === null && !error && <div className="empty-state">Loading diff…</div>}
        {parsed !== null && rows.length === 0 && <div className="empty-state">No textual changes.</div>}
        {layout === 'split' ? (
          <SplitTable rows={rows} highlights={highlights} currentChange={currentChange} />
        ) : (
          <UnifiedTable rows={rows} highlights={highlights} currentChange={currentChange} />
        )}
      </div>
    </div>
  )
}

function requestDiff(target: FileDiffTarget, options: DiffOptions): Promise<string> {
  if (target.kind === 'working') return kraft.workingFileDiff(target.change, target.staged, options)
  if (target.kind === 'stash') return kraft.stashFileDiff(target.sha, target.change, options)
  return kraft.commitFileDiff(target.sha, target.change.path, options)
}

function diffSubtitle(controller: RepositoryController, target: FileDiffTarget): string {
  if (target.kind === 'working') return target.staged ? 'Staged changes' : 'Unstaged changes'
  if (target.kind === 'commit') return `Commit ${target.sha.slice(0, 7)}`
  const stash = controller.view?.stashes.find((candidate) => candidate.sha === target.sha)
  return stash ? `Stash stash@{${stash.index}}` : `Stash ${target.sha.slice(0, 7)}`
}

function UnifiedTable({ rows, highlights, currentChange }: { rows: Row[]; highlights: LineHighlights; currentChange: number }) {
  return (
    <table className="diff-table">
      <tbody>
        {rows.map((row, index) => {
          if (row.kind === 'hunk' || row.kind === 'note') return <BannerRow key={index} row={row} columns={3} />
          if (row.kind !== 'line') return null
          const { line } = row
          return (
            <tr key={index} className={`diff-line ${line.kind} ${row.change === currentChange ? 'current-change' : ''}`} {...changeStart(row)}>
              <td className="line-number">{line.oldNumber ?? ''}</td>
              <td className="line-number">{line.newNumber ?? ''}</td>
              <td className="line-text">
                <LineText line={line} highlights={highlights} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * Two panes that scroll sideways on their own but up and down together (they share the diff body's
 * scrollbar), so long lines never wrap and every row stays level with its counterpart.
 */
function SplitTable({ rows, highlights, currentChange }: { rows: Row[]; highlights: LineHighlights; currentChange: number }) {
  return (
    <div className="split-panes">
      <SplitPane rows={rows} highlights={highlights} currentChange={currentChange} side="old" />
      <SplitPane rows={rows} highlights={highlights} currentChange={currentChange} side="new" />
    </div>
  )
}

interface SplitPaneProps {
  rows: Row[]
  highlights: LineHighlights
  currentChange: number
  side: 'old' | 'new'
}

function SplitPane({ rows, highlights, currentChange, side }: SplitPaneProps) {
  return (
    <div className={`split-pane ${side}`}>
      <table className="diff-table">
        <tbody>
          {rows.map((row, index) => {
            if (row.kind === 'hunk' || row.kind === 'note') {
              // The hunk header is shown once, on the old side; the new side keeps an empty row level with it.
              const blank = row.kind === 'hunk' && side === 'new'
              return blank ? <BannerRow key={index} row={{ kind: 'hunk', header: ' ' }} columns={2} /> : <BannerRow key={index} row={row} columns={2} />
            }
            if (row.kind !== 'pair') return null
            const line = side === 'old' ? row.left : row.right
            const kind = line ? line.kind : 'empty'
            return (
              <tr
                key={index}
                className={`split-row ${kind} ${row.change === currentChange ? 'current-change' : ''}`}
                {...(side === 'old' ? changeStart(row) : {})}
              >
                <td className="line-number">{(side === 'old' ? line?.oldNumber : line?.newNumber) ?? ''}</td>
                <td className="line-text">{line ? <LineText line={line} highlights={highlights} /> : null}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function BannerRow({ row, columns }: { row: { kind: 'hunk'; header: string } | { kind: 'note'; text: string }; columns: number }) {
  return (
    <tr className={`diff-line ${row.kind}`}>
      <td className="line-text" colSpan={columns}>
        {row.kind === 'hunk' ? row.header : row.text}
      </td>
    </tr>
  )
}

/** A line's text, with syntax colours and the exact characters that changed marked. */
function LineText({ line, highlights }: { line: DiffLine; highlights: LineHighlights }) {
  if (line.text === '') return <>{' '}</>
  const tokens = highlights.get(line) ?? [{ text: line.text, kinds: [] }]
  return (
    <>
      {withChangedText(tokens, line.segments).map((piece, index) => {
        const classes = [...piece.kinds.map((kind) => `token-${kind}`), ...(piece.changed ? ['changed-text'] : [])]
        return classes.length > 0 ? (
          <span key={index} className={classes.join(' ')}>
            {piece.text}
          </span>
        ) : (
          piece.text
        )
      })}
    </>
  )
}

function changeStart(row: { change: number | null; startsChange: boolean }) {
  return row.startsChange ? { 'data-change-start': row.change ?? undefined } : {}
}

/** Builds the table rows for a layout and numbers each run of changed rows, for the previous/next buttons. */
function layoutRows(parsed: ParsedDiff | null, layout: DiffLayout, showHunkHeaders: boolean): { rows: Row[]; changeCount: number } {
  if (!parsed) return { rows: [], changeCount: 0 }
  const rows: Row[] = parsed.notes.map((text) => ({ kind: 'note', text }))
  let changeCount = 0
  let inChange = false
  const numberChange = (changed: boolean) => {
    const startsChange = changed && !inChange
    if (startsChange) changeCount++
    inChange = changed
    return { change: changed ? changeCount - 1 : null, startsChange }
  }

  for (const hunk of parsed.hunks) {
    if (showHunkHeaders) rows.push({ kind: 'hunk', header: hunk.header })
    inChange = false
    if (layout === 'unified') {
      for (const line of hunk.lines) {
        if (line.kind === 'note') rows.push({ kind: 'note', text: line.text })
        else rows.push({ kind: 'line', line, ...numberChange(line.kind !== 'context') })
      }
    } else {
      for (const row of toSplitRows(hunk)) {
        if (row.kind === 'note') rows.push(row)
        else rows.push({ ...row, ...numberChange(row.left?.kind !== 'context') })
      }
    }
  }
  return { rows, changeCount }
}
