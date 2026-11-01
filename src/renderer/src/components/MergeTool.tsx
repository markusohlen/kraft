import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from 'react'
import type { ConflictSide, MergeConflict } from '../../../application/conflictOperations'
import type { FileChange } from '../../../domain/entities'
import {
  emptyChoice,
  isChoiceEmpty,
  joinLines,
  resolvedLines,
  setPicked,
  setSidePicked,
  sideLines,
  sidePickState,
  withLineEndings,
  type ConflictChoice,
  type ConflictSegment,
  type MergeSide,
  type ResolvedLine
} from '../../../domain/mergeConflict'
import { kraft } from '../kraftClient'
import { mergeToolRows, type MergeToolRow } from '../mergeToolRows'
import { highlightLines, languageFor, type HighlightedLine } from '../syntaxHighlight'
import { usePanelSize } from '../usePanelSize'
import type { RepositoryController } from '../useRepositoryController'
import { useSharedScrollLeft } from '../useSharedScrollLeft'
import { HighlightedCode } from './HighlightedCode'
import { ResizeHandle } from './ResizeHandle'

type SharedScroll = ReturnType<typeof useSharedScrollLeft>

const sideLetters: Record<MergeSide, string> = { ours: 'A', theirs: 'B' }
const sides: readonly MergeSide[] = ['ours', 'theirs']
/** Matches the line height of the panes and the output editor, for scrolling to a line. */
const lineHeight = 19

/** Resolves a conflicted file by picking, line by line, what to keep from each side (like GitKraken's merge tool). */
export function MergeTool({ controller, change }: { controller: RepositoryController; change: FileChange }) {
  const [conflict, setConflict] = useState<MergeConflict | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    setConflict(null)
    setError(null)
    kraft.mergeConflict(change.path).then(
      (loaded) => current && setConflict(loaded),
      (failure: Error) => current && setError(failure.message)
    )
    return () => {
      current = false
    }
  }, [change.path])

  if (conflict?.kind === 'text') return <TextConflict controller={controller} conflict={conflict} />
  if (conflict?.kind === 'one-sided') return <OneSidedConflict controller={controller} conflict={conflict} />
  return (
    <div className="diff merge-tool">
      <MergeTitle controller={controller} path={change.path} detail="" />
      <div className="diff-body">
        {error ? <div className="empty-state error-text">{error}</div> : <div className="empty-state">Loading conflict…</div>}
      </div>
    </div>
  )
}

function MergeTitle({ controller, path, detail, children }: { controller: RepositoryController; path: string; detail: string; children?: ReactNode }) {
  return (
    <div className="diff-header merge-title">
      <div className="diff-title">
        <span className="merge-warning" aria-hidden>
          ⚠
        </span>
        <span className="diff-path">{path}</span>
        <span className="muted small"> {detail}</span>
      </div>
      <div className="diff-tools">
        {children}
        <button className="icon-button" title="Close merge tool" onClick={() => controller.setDiff(null)}>
          ✕
        </button>
      </div>
    </div>
  )
}

function SideName({ side, info }: { side: MergeSide; info: ConflictSide }) {
  return (
    <>
      <span className={`merge-badge ${side}`}>{sideLetters[side]}</span>
      <span>
        {info.sha ? `Commit ${info.sha.slice(0, 6)}` : side === 'ours' ? 'Current' : 'Incoming'}
        {info.branch && (
          <>
            {' on '}
            <em className={`merge-branch ${side}`}>{info.branch}</em>
          </>
        )}
      </span>
    </>
  )
}

function TextConflict({ controller, conflict }: { controller: RepositoryController; conflict: Extract<MergeConflict, { kind: 'text' }> }) {
  const { path, merged } = conflict
  const rows = useMemo(() => mergeToolRows(merged), [merged])
  const conflicts = useMemo(() => merged.segments.filter((segment): segment is ConflictSegment => segment.kind === 'conflict'), [merged])
  const [choices, setChoices] = useState<ConflictChoice[]>(() => conflicts.map(() => emptyChoice))
  const [editedOutput, setEditedOutput] = useState<string | null>(null)
  const [currentConflict, setCurrentConflict] = useState(-1)
  const outputPane = usePanelSize('kraft.mergeOutputHeight', { initial: 380, min: 80, max: 1200 })
  const bodyRef = useRef<HTMLDivElement>(null)
  const outputRef = useRef<OutputEditorHandle>(null)
  const sharedScroll = useSharedScrollLeft()
  const language = languageFor(path)
  const highlighted = useMemo(
    () => ({ ours: highlightLines(sideLines(merged, 'ours'), language), theirs: highlightLines(sideLines(merged, 'theirs'), language) }),
    [merged, language]
  )

  const lines = useMemo(() => resolvedLines(merged, choices), [merged, choices])
  const output = editedOutput ?? joinLines(lines.map((line) => line.text), merged)
  const unpickedCount = choices.filter(isChoiceEmpty).length

  // Picking regenerates the output, replacing any edits made to it by hand.
  const pick = (update: (choice: ConflictChoice, segment: ConflictSegment) => ConflictChoice, only?: number) => {
    setChoices((current) => current.map((choice, index) => (only === undefined || index === only ? update(choice, conflicts[index]) : choice)))
    setEditedOutput(null)
  }
  const pickLines = (conflictIndex: number, side: MergeSide, indexes: number[], picked: boolean) =>
    pick((choice) => setPicked(choice, side, indexes, picked), conflictIndex)
  const pickSide = (side: MergeSide, picked: boolean, only?: number) => pick((choice, segment) => setSidePicked(choice, segment, side, picked), only)

  const goToConflict = (index: number) => {
    setCurrentConflict(index)
    bodyRef.current?.querySelector(`[data-conflict="${index}"]`)?.scrollIntoView({ block: 'center' })
    outputRef.current?.scrollToConflict(index)
  }
  useEffect(() => {
    if (conflicts.length > 0) goToConflict(0)
  }, [conflicts])

  const save = () => {
    const write = () =>
      void controller.run(
        'Saving resolution',
        async () => {
          await kraft.resolveMergeConflict(path, withLineEndings(output, merged))
          controller.setDiff(null)
        },
        `Resolved ${path}`
      )
    if (unpickedCount === 0 || editedOutput !== null) return write()
    controller.ask({
      title: `Save ${path}?`,
      description: `${unpickedCount === 1 ? 'One conflict has' : `${unpickedCount} conflicts have`} nothing picked, so the lines from before either change are kept there.`,
      fields: [],
      confirmLabel: 'Save anyway',
      onSubmit: write
    })
  }

  return (
    <div className="diff merge-tool">
      <MergeTitle controller={controller} path={path} detail={`(${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'})`}>
        <button className="primary small" disabled={controller.busyLabel !== null} onClick={save}>
          Save
        </button>
      </MergeTitle>

      <div className="merge-sides">
        <div className="merge-pane-headers">
          {sides.map((side) => (
            <div key={side} className={`merge-pane-header ${side}`}>
              <PickBox
                label={`Keep all of ${sideLetters[side]}`}
                {...sidePickState(conflicts, choices, side)}
                disabled={conflicts.length === 0}
                onChange={(checked) => pickSide(side, checked)}
              />
              <SideName side={side} info={conflict.sides[side]} />
            </div>
          ))}
        </div>
        <div className="diff-body" ref={bodyRef}>
          <div className="split-panes">
            {sides.map((side) => (
              <MergePane
                key={side}
                side={side}
                rows={rows}
                highlighted={highlighted[side]}
                conflicts={conflicts}
                choices={choices}
                currentConflict={currentConflict}
                scroll={sharedScroll}
                onPickLines={pickLines}
                onPickSide={(conflictIndex, pickedSide, picked) => pickSide(pickedSide, picked, conflictIndex)}
              />
            ))}
          </div>
        </div>
      </div>

      <ResizeHandle className="row-resize" size={outputPane.size} onResize={outputPane.resize} direction={-1} axis="y" />
      <div className="merge-output" style={{ flexBasis: `${outputPane.size}px` }}>
        <div className="merge-output-header">
          <span className="merge-output-title">Output</span>
          <span className="merge-output-nav">
            {conflicts.length > 0 && (
              <>
                conflict {Math.max(currentConflict, 0) + 1} of {conflicts.length}
                <button className="merge-nav-button" title="Previous conflict" disabled={currentConflict <= 0} onClick={() => goToConflict(currentConflict - 1)}>
                  ▲
                </button>
                <button
                  className="merge-nav-button"
                  title="Next conflict"
                  disabled={currentConflict >= conflicts.length - 1}
                  onClick={() => goToConflict(currentConflict + 1)}
                >
                  ▼
                </button>
              </>
            )}
          </span>
          <span className="muted small merge-output-note">{editedOutput !== null && 'Edited by hand · picking lines again replaces your edits'}</span>
        </div>
        <OutputEditor
          ref={outputRef}
          text={output}
          lines={editedOutput === null ? lines : null}
          language={language}
          scroll={sharedScroll}
          onChange={setEditedOutput}
        />
      </div>
    </div>
  )
}

interface MergePaneProps {
  side: MergeSide
  rows: MergeToolRow[]
  /** This side's lines, by line number minus one. */
  highlighted: HighlightedLine[]
  conflicts: ConflictSegment[]
  choices: ConflictChoice[]
  currentConflict: number
  scroll: SharedScroll
  onPickLines: (conflict: number, side: MergeSide, indexes: number[], picked: boolean) => void
  onPickSide: (conflict: number, side: MergeSide, picked: boolean) => void
}

function MergePane({ side, rows, highlighted, conflicts, choices, currentConflict, scroll, onPickLines, onPickSide }: MergePaneProps) {
  return (
    <div className={`split-pane merge-pane ${side}`} ref={scroll.register} onScroll={(event) => scroll.follow(event.currentTarget)}>
      <table className="diff-table">
        <tbody>
          {rows.map((row, index) => {
            if (row.kind === 'common') {
              return (
                <tr key={index} className="split-row">
                  <td className="pick-cell" />
                  <td className="line-number">{side === 'ours' ? row.oursNumber : row.theirsNumber}</td>
                  <td className="line-text">
                    <HighlightedCode line={highlighted[(side === 'ours' ? row.oursNumber : row.theirsNumber) - 1]} />
                  </td>
                </tr>
              )
            }
            const line = row[side]
            const current = row.conflict === currentConflict ? 'current-change' : ''
            const scrollTarget = row.startsConflict && side === 'ours' ? { 'data-conflict': row.conflict } : {}
            const segment = conflicts[row.conflict]
            const choice = choices[row.conflict]
            const sideBox = (
              <PickBox
                label={`Keep ${sideLetters[side]}'s side of conflict ${row.conflict + 1}`}
                {...sidePickState([segment], [choice], side)}
                onChange={(checked) => onPickSide(row.conflict, side, checked)}
              />
            )
            if (!line && row.startsConflict && segment[side].length === 0) {
              return (
                <tr
                  key={index}
                  className={`split-row merge-line ${side} ${choice.emptySidePicked ? 'picked' : ''} ${current}`}
                  title={choice.emptySidePicked ? 'Click to stop keeping this side' : 'Click to keep this side, which has no lines here'}
                  onClick={() => onPickSide(row.conflict, side, !choice.emptySidePicked)}
                  {...scrollTarget}
                >
                  <td className="pick-cell">{sideBox}</td>
                  <td className="line-number" />
                  <td className="line-text muted">No lines</td>
                </tr>
              )
            }
            if (!line) {
              return (
                <tr key={index} className={`split-row empty ${current}`} {...scrollTarget}>
                  <td className="pick-cell" />
                  <td className="line-number" />
                  <td className="line-text" />
                </tr>
              )
            }
            const picked = choice[side].includes(line.index)
            return (
              <tr
                key={index}
                className={`split-row merge-line ${side} ${picked ? 'picked' : ''} ${current}`}
                title={picked ? 'Click to leave this line out' : 'Click to keep this line'}
                onClick={() => onPickLines(row.conflict, side, [line.index], !picked)}
                {...scrollTarget}
              >
                <td className="pick-cell">{line.index === 0 && sideBox}</td>
                <td className="line-number">{line.number}</td>
                <td className="line-text">
                  <HighlightedCode line={highlighted[line.number - 1]} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface OutputEditorHandle {
  scrollToConflict: (conflict: number) => void
}

interface OutputEditorProps {
  text: string
  /** Where each line came from, for colouring; null once the text is edited by hand. */
  lines: ResolvedLine[] | null
  language: string | null
  scroll: SharedScroll
  onChange: (text: string) => void
  ref: Ref<OutputEditorHandle>
}

/**
 * A text box with line numbers, syntax colours, and each line tinted by the side it was picked from.
 * The colours are drawn on a layer behind the text box, whose own text is transparent; the layer and
 * the gutter follow its scroll position.
 */
function OutputEditor({ text, lines, language, scroll, onChange, ref }: OutputEditorProps) {
  const textRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const highlighted = useMemo(() => highlightLines(text.split('\n'), language), [text, language])

  const syncScroll = () => {
    const box = textRef.current
    if (!box) return
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-box.scrollTop}px)`
    if (backdropRef.current) backdropRef.current.style.transform = `translate(${-box.scrollLeft}px, ${-box.scrollTop}px)`
  }
  const registerText = (element: HTMLTextAreaElement | null) => {
    textRef.current = element
    return scroll.register(element)
  }

  useImperativeHandle(ref, () => ({
    scrollToConflict: (conflict) => {
      const box = textRef.current
      const lineIndex = lines?.findIndex((line) => line.conflict === conflict) ?? -1
      if (!box || lineIndex < 0) return
      box.scrollTop = lineIndex * lineHeight - box.clientHeight / 2
      syncScroll()
    }
  }))

  return (
    <div className="merge-output-editor">
      <div className="merge-output-gutter">
        <div ref={gutterRef}>
          {highlighted.map((_, index) => (
            <div key={index}>{index + 1}</div>
          ))}
        </div>
      </div>
      <div className="merge-output-code">
        <div className="merge-output-backdrop" ref={backdropRef} aria-hidden>
          {highlighted.map((line, index) => (
            <div key={index} className={`merge-output-line ${lines?.[index]?.origin ?? ''}`}>
              <HighlightedCode line={line} />
            </div>
          ))}
        </div>
        <textarea
          ref={registerText}
          className="merge-output-text"
          aria-label="Merged result"
          value={text}
          wrap="off"
          spellCheck={false}
          onScroll={(event) => {
            syncScroll()
            scroll.follow(event.currentTarget)
          }}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}

interface PickBoxProps {
  label: string
  checked: boolean
  indeterminate?: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}

function PickBox({ label, checked, indeterminate = false, disabled = false, onChange }: PickBoxProps) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      className="pick-box"
      aria-label={label}
      title={label}
      checked={checked}
      disabled={disabled}
      // The row's own click handler toggles a single line; the box picks the whole conflict instead.
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.checked)}
    />
  )
}

function OneSidedConflict({ controller, conflict }: { controller: RepositoryController; conflict: Extract<MergeConflict, { kind: 'one-sided' }> }) {
  const { path, presentIn, deletedOnOtherSide, content } = conflict
  const otherSide: MergeSide = presentIn === 'ours' ? 'theirs' : 'ours'
  const resolve = (keep: boolean) =>
    void controller.run(
      'Saving resolution',
      async () => {
        await kraft.resolveMergeConflict(path, keep ? content : null)
        controller.setDiff(null)
      },
      keep ? `Kept ${path}` : `Deleted ${path}`
    )

  return (
    <div className="diff merge-tool">
      <MergeTitle controller={controller} path={path} detail={deletedOnOtherSide ? '(deleted on one side)' : '(added on one side)'} />
      <div className="diff-body merge-one-sided">
        <p className="merge-one-sided-text">
          <SideName side={presentIn} info={conflict.sides[presentIn]} />
          {deletedOnOtherSide ? ' changed this file, but ' : ' has this file, but '}
          <SideName side={otherSide} info={conflict.sides[otherSide]} />
          {deletedOnOtherSide ? ' deleted it.' : " doesn't."}
        </p>
        <div className="merge-one-sided-buttons">
          <button className="primary small" disabled={controller.busyLabel !== null} onClick={() => resolve(true)}>
            Keep file
          </button>
          <button className="secondary small" disabled={controller.busyLabel !== null} onClick={() => resolve(false)}>
            Delete file
          </button>
        </div>
        <pre className="merge-preview">{content}</pre>
      </div>
    </div>
  )
}
