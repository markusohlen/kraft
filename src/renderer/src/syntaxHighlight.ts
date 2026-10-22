import Prism from 'prismjs'
// Each language registers itself on Prism; the order follows their dependencies (e.g. tsx needs jsx and typescript).
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-scss'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-csharp'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-ruby'

/** A run of text and the token kinds it belongs to (e.g. `keyword`, or `string` inside `template-string`). */
export interface HighlightedPiece {
  text: string
  kinds: string[]
}

export type HighlightedLine = HighlightedPiece[]

const languagesByExtension: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'markup',
  htm: 'markup',
  xml: 'markup',
  svg: 'markup',
  md: 'markdown',
  py: 'python',
  cs: 'csharp',
  java: 'java',
  go: 'go',
  rs: 'rust',
  sh: 'bash',
  bash: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  sql: 'sql',
  rb: 'ruby'
}

/** The highlighting language for a file, from its extension; null for files shown as plain text. */
export function languageFor(path: string): string | null {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return path.includes('.') ? (languagesByExtension[extension] ?? null) : null
}

/**
 * Highlights a file's lines. The whole text is tokenized at once, so a comment or string that spans
 * several lines is coloured on each of them.
 */
export function highlightLines(lines: readonly string[], language: string | null): HighlightedLine[] {
  const grammar = language ? Prism.languages[language] : undefined
  if (!grammar) return lines.map((text) => [{ text, kinds: [] }])

  const result: HighlightedLine[] = [[]]
  const add = (text: string, kinds: string[]) => {
    text.split('\n').forEach((part, index) => {
      if (index > 0) result.push([])
      if (part) result[result.length - 1].push({ text: part, kinds })
    })
  }
  const walk = (stream: Prism.TokenStream, kinds: string[]) => {
    if (typeof stream === 'string') return add(stream, kinds)
    if (Array.isArray(stream)) return stream.forEach((token) => walk(token, kinds))
    walk(stream.content, [...kinds, stream.type, ...aliases(stream.alias)])
  }
  walk(Prism.tokenize(lines.join('\n'), grammar), [])
  return result
}

function aliases(alias: string | string[] | undefined): string[] {
  if (!alias) return []
  return Array.isArray(alias) ? alias : [alias]
}
