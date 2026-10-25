import { describe, expect, it } from 'vitest'
import {
  assertCloneFolderName,
  assertCloneUrl,
  cloneFolderName,
  filterRepositories,
  serverAddressFor,
  sortByRecentActivity,
  type RemoteRepository
} from '../../src/domain/hostingProvider'

function repository(fullName: string, overrides: Partial<RemoteRepository> = {}): RemoteRepository {
  return {
    fullName,
    name: fullName.split('/').pop() ?? fullName,
    description: '',
    isPrivate: false,
    httpsUrl: `https://example.com/${fullName}.git`,
    sshUrl: null,
    webUrl: `https://example.com/${fullName}`,
    updatedAt: null,
    ...overrides
  }
}

describe('serverAddressFor', () => {
  it('always uses the cloud address for the cloud services', () => {
    expect(serverAddressFor('github', 'https://ignored.example')).toBe('https://github.com')
    expect(serverAddressFor('gitlab', '')).toBe('https://gitlab.com')
    expect(serverAddressFor('bitbucket', '')).toBe('https://bitbucket.org')
  })

  it('trims the entered address and its trailing slashes', () => {
    expect(serverAddressFor('github-enterprise', ' https://github.corp.example/ ')).toBe('https://github.corp.example')
  })

  it('turns a bare Azure DevOps organization name into its address', () => {
    expect(serverAddressFor('azure-devops', 'acme')).toBe('https://dev.azure.com/acme')
    expect(serverAddressFor('azure-devops', 'https://acme.visualstudio.com')).toBe('https://acme.visualstudio.com')
  })

  it('requires https, except on this computer', () => {
    expect(() => serverAddressFor('gitlab-self-managed', 'http://gitlab.corp.example')).toThrow('must start with https://')
    expect(serverAddressFor('gitlab-self-managed', 'http://localhost:8080')).toBe('http://localhost:8080')
  })

  it('rejects a missing or malformed address', () => {
    expect(() => serverAddressFor('bitbucket-data-center', '  ')).toThrow('Enter the address')
    expect(() => serverAddressFor('github-enterprise', 'not an address')).toThrow('is not a valid address')
  })
})

describe('cloneFolderName', () => {
  it.each([
    ['https://github.com/acme/widgets.git', 'widgets'],
    ['https://gitlab.com/group/sub/widgets', 'widgets'],
    ['git@github.com:acme/widgets.git', 'widgets'],
    ['git@host:widgets.git', 'widgets'],
    ['https://dev.azure.com/acme/Project/_git/My%20Repo', 'My Repo'],
    ['C:\\repos\\widgets\\', 'widgets'],
    ['https://example.com/widgets.git?ref=1', 'widgets']
  ])('%s → %s', (url, name) => {
    expect(cloneFolderName(url)).toBe(name)
  })
})

describe('assertCloneUrl', () => {
  it('accepts plain URLs and paths', () => {
    expect(assertCloneUrl(' https://github.com/acme/widgets.git ')).toBe('https://github.com/acme/widgets.git')
    expect(assertCloneUrl('git@github.com:acme/widgets.git')).toBe('git@github.com:acme/widgets.git')
  })

  it('rejects options, remote helpers and empty input', () => {
    expect(() => assertCloneUrl('--upload-pack=touch /tmp/x')).toThrow('not a valid repository URL')
    expect(() => assertCloneUrl('ext::sh -c touch% /tmp/x')).toThrow()
    expect(() => assertCloneUrl('fd::3')).toThrow('remote helper')
    expect(() => assertCloneUrl('')).toThrow('Enter the URL')
  })
})

describe('assertCloneFolderName', () => {
  it('accepts a plain name', () => {
    expect(assertCloneFolderName(' widgets ')).toBe('widgets')
  })

  it.each(['', '..', '.', 'a/b', 'a\\b', 'C:', '-x'])('rejects %j', (name) => {
    expect(() => assertCloneFolderName(name)).toThrow()
  })
})

describe('filterRepositories', () => {
  const repositories = [repository('acme/widgets', { description: 'Shiny gadgets' }), repository('acme/server'), repository('other/widgets-api')]

  it('matches every word against the name and description, ignoring case', () => {
    expect(filterRepositories(repositories, 'WIDGETS').map((found) => found.fullName)).toEqual(['acme/widgets', 'other/widgets-api'])
    expect(filterRepositories(repositories, 'acme shiny').map((found) => found.fullName)).toEqual(['acme/widgets'])
  })

  it('returns everything for an empty filter', () => {
    expect(filterRepositories(repositories, '  ')).toHaveLength(3)
  })
})

describe('sortByRecentActivity', () => {
  it('puts the most recently changed first and undated ones last by name', () => {
    const sorted = sortByRecentActivity([
      repository('b/undated'),
      repository('a/old', { updatedAt: '2025-01-01T00:00:00Z' }),
      repository('A/undated'),
      repository('c/new', { updatedAt: '2026-05-01T00:00:00Z' })
    ])
    expect(sorted.map((found) => found.fullName)).toEqual(['c/new', 'a/old', 'A/undated', 'b/undated'])
  })
})
