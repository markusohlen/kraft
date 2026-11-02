import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { searchHistory } from '../../src/application/historySearch'
import { createTestRepository, type TestRepository } from './gitTestRepository'

describe('searching the history', () => {
  let test: TestRepository

  beforeEach(async () => {
    test = await createTestRepository()
    await test.commitFile('login.txt', 'one\n', 'Add the login page\n\nIt remembers the session.')
    await test.git('checkout', '-q', '-b', 'other')
    await test.commitFile('other.txt', 'two\n', 'Work on another branch (v2.*)')
    await test.git('checkout', '-q', 'main')
  })

  afterEach(() => test.dispose())

  const subjects = async (query: string) => (await searchHistory(test.repository, query)).matches.map((commit) => commit.subject)

  it('finds a word in a subject, ignoring case', async () => {
    expect(await subjects('LOGIN')).toEqual(['Add the login page'])
  })

  it('finds a word in the body of a message', async () => {
    expect(await subjects('remembers')).toEqual(['Add the login page'])
  })

  it('finds commits on branches that are not checked out', async () => {
    expect(await subjects('another branch')).toEqual(['Work on another branch (v2.*)'])
  })

  it('takes the query literally rather than as a pattern', async () => {
    expect(await subjects('(v2.*)')).toEqual(['Work on another branch (v2.*)'])
    expect(await subjects('l.gin')).toEqual([])
  })

  it('finds commits by author name and email, once each', async () => {
    const all = 3
    expect(await subjects('Test User')).toHaveLength(all)
    expect(await subjects('test@example.com')).toHaveLength(all)
  })

  it('finds a commit by the start of its sha', async () => {
    const sha = await test.git('rev-parse', 'other')
    const { matches } = await searchHistory(test.repository, sha.slice(0, 10))
    expect(matches.map((commit) => commit.sha)).toEqual([sha])
  })

  it('finds nothing for a blank query, or text that matches nothing', async () => {
    expect(await searchHistory(test.repository, '   ')).toEqual({ matches: [], truncated: false })
    expect(await subjects('no such words anywhere')).toEqual([])
  })

  it('does not treat a query as an option or a ref', async () => {
    expect(await subjects('--all')).toEqual([])
    expect(await subjects('deadbeef')).toEqual([])
  })
})
