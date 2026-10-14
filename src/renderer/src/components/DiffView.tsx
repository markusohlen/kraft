import { useEffect, useState } from 'react'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'

interface DiffLine {
  kind: 'hunk' | 'added' | 'removed' | 'context' | 'note'
  text: string
  oldNumber: number | null
  newNumber: number | null
}

export function DiffView({ controller }: { controller: RepositoryController }) {
  const target = controller.diff!
  const [diffText, setDiffText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDiffText(null)
    setError(null)
    const request =
      target.kind === 'working'
        ? kraft.workingFileDiff(target.change, target.staged)
        : kraft.commitFileDiff(target.sha, target.change.path)
    request.then(setDiffText, (failure: Error) => setError(failure.message))
  }, [target])

  const lines = diffText === null ? [] : parseUnifiedDiff(diffText)
  const subtitle = target.kind === 'working' ? (target.staged ? 'Staged changes' : 'Unstaged changes') : `Commit ${target.sha.slice(0, 7)}`

  return (
    <div className="diff">
      <div className="diff-header">
        <div>
          <div className="diff-path">{target.change.path}</div>
          <div className="muted small">
            {subtitle}
            {target.change.oldPath ? ` · renamed from ${target.change.oldPath}` : ''}
          </div>
        </div>
        <button className="icon-button" title="Close diff" onClick={() => controller.setDiff(null)}>
          ✕
        </button>
      </div>
      <div className="diff-body">
        {error && <div className="empty-state error-text">{error}</div>}
        {diffText === null && !error && <div className="empty-state">Loading diff…</div>}
        {diffText !== null && lines.length === 0 && <div className="empty-state">No textual changes.</div>}
        <table className="diff-table">
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className={`diff-line ${line.kind}`}>
                <td className="line-number">{line.oldNumber ?? ''}</td>
                <td className="line-number">{line.newNumber ?? ''}</td>
                <td className="line-text">{line.text || ' '}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const hunkHeader = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

function parseUnifiedDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldNumber = 0
  let newNumber = 0
  let inHunk = false
  for (const raw of diff.split('\n')) {
    const header = hunkHeader.exec(raw)
    if (header) {
      oldNumber = Number(header[1])
      newNumber = Number(header[2])
      inHunk = true
      lines.push({ kind: 'hunk', text: raw, oldNumber: null, newNumber: null })
    } else if (raw.startsWith('Binary files') || raw.startsWith('Binary file')) {
      lines.push({ kind: 'note', text: raw, oldNumber: null, newNumber: null })
    } else if (!inHunk) {
      continue
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'added', text: raw.slice(1), oldNumber: null, newNumber: newNumber++ })
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'removed', text: raw.slice(1), oldNumber: oldNumber++, newNumber: null })
    } else if (raw.startsWith(' ')) {
      lines.push({ kind: 'context', text: raw.slice(1), oldNumber: oldNumber++, newNumber: newNumber++ })
    } else if (raw.startsWith('\\')) {
      lines.push({ kind: 'note', text: raw, oldNumber: null, newNumber: null })
    }
  }
  return lines
}
