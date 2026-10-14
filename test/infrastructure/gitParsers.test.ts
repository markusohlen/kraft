import { describe, expect, it } from 'vitest'
import { parseBranches, parseDecorations, parseNameStatus, parseStatus } from '../../src/infrastructure/gitParsers'

describe('git output parsers', () => {
  it('parses full-name decorations', () => {
    expect(
      parseDecorations('HEAD -> refs/heads/main, refs/remotes/origin/main, refs/remotes/origin/HEAD, tag: refs/tags/v1.0, refs/heads/develop')
    ).toEqual([
      { name: 'main', kind: 'head' },
      { name: 'origin/main', kind: 'remote' },
      { name: 'v1.0', kind: 'tag' },
      { name: 'develop', kind: 'local' }
    ])
  })

  it('splits porcelain status into staged and unstaged changes', () => {
    const output = ['M  staged.txt', ' M unstaged.txt', 'MM both.txt', 'R  new.txt', 'old.txt', '?? untracked.txt', 'UU conflict.txt', ''].join('\0')

    expect(parseStatus(output)).toEqual({
      staged: [
        { path: 'staged.txt', oldPath: null, status: 'modified' },
        { path: 'both.txt', oldPath: null, status: 'modified' },
        { path: 'new.txt', oldPath: 'old.txt', status: 'renamed' }
      ],
      unstaged: [
        { path: 'unstaged.txt', oldPath: null, status: 'modified' },
        { path: 'both.txt', oldPath: null, status: 'modified' },
        { path: 'untracked.txt', oldPath: null, status: 'untracked' },
        { path: 'conflict.txt', oldPath: null, status: 'conflicted' }
      ]
    })
  })

  it('parses name-status output including renames', () => {
    expect(parseNameStatus(['A', 'a.txt', 'R087', 'old.txt', 'new.txt', 'D', 'gone.txt', ''].join('\0'))).toEqual([
      { path: 'a.txt', oldPath: null, status: 'added' },
      { path: 'new.txt', oldPath: 'old.txt', status: 'renamed' },
      { path: 'gone.txt', oldPath: null, status: 'deleted' }
    ])
  })

  it('parses branches with upstream tracking counts', () => {
    const output = ['main\x1fabc\x1f*\x1forigin/main\x1fahead 2, behind 1', 'topic\x1fdef\x1f \x1f\x1f'].join('\n')

    expect(parseBranches(output)).toEqual([
      { name: 'main', sha: 'abc', isCurrent: true, upstream: 'origin/main', ahead: 2, behind: 1 },
      { name: 'topic', sha: 'def', isCurrent: false, upstream: null, ahead: 0, behind: 0 }
    ])
  })
})
