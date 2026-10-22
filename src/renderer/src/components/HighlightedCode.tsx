import type { HighlightedLine } from '../syntaxHighlight'

/** One line of syntax-highlighted code; each token kind becomes a `token-<kind>` class for the colour. */
export function HighlightedCode({ line }: { line: HighlightedLine | undefined }) {
  if (!line || line.length === 0) return <>{' '}</>
  return (
    <>
      {line.map((piece, index) => (
        <span key={index} className={piece.kinds.map((kind) => `token-${kind}`).join(' ') || undefined}>
          {piece.text}
        </span>
      ))}
    </>
  )
}
