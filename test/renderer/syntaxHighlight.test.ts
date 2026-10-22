import { describe, expect, it } from 'vitest'
import { highlightLines, languageFor } from '../../src/renderer/src/syntaxHighlight'

describe('languageFor', () => {
  it('picks the language from the file extension', () => {
    expect(languageFor('src/components/Header.tsx')).toBe('tsx')
    expect(languageFor('README.MD')).toBe('markdown')
  })

  it('leaves unknown and extensionless files as plain text', () => {
    expect(languageFor('notes.unknown')).toBeNull()
    expect(languageFor('Makefile')).toBeNull()
  })
})

describe('highlightLines', () => {
  it('splits tokens into lines, colouring a comment on every line it spans', () => {
    const lines = highlightLines(['/* one', 'two */ const x = "y"'], 'typescript')

    expect(lines).toHaveLength(2)
    expect(lines[0]).toEqual([{ text: '/* one', kinds: ['comment'] }])
    expect(lines[1][0]).toEqual({ text: 'two */', kinds: ['comment'] })
    expect(lines[1]).toContainEqual({ text: 'const', kinds: ['keyword'] })
    expect(lines[1]).toContainEqual({ text: '"y"', kinds: ['string'] })
  })

  it('keeps empty lines and the text of every line intact', () => {
    const source = ['function f() {', '', '  return 1', '}']
    const lines = highlightLines(source, 'javascript')

    expect(lines.map((line) => line.map((piece) => piece.text).join(''))).toEqual(source)
  })

  it('returns plain pieces without a language', () => {
    expect(highlightLines(['const x'], null)).toEqual([[{ text: 'const x', kinds: [] }]])
  })
})
