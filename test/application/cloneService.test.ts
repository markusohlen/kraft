import { beforeEach, describe, expect, it } from 'vitest'
import {
  CloneService,
  type HostingAccountStore,
  type HostingCredentials,
  type RepositoryCloner,
  type RepositoryHost,
  type StoredHostingAccount
} from '../../src/application/cloneService'
import type { CloneOptions, RemoteRepository } from '../../src/domain/hostingProvider'

class MemoryAccounts implements HostingAccountStore {
  accounts: StoredHostingAccount[] = []
  async load() {
    return this.accounts
  }
  async save(accounts: StoredHostingAccount[]) {
    this.accounts = accounts
  }
}

function remote(fullName: string, updatedAt: string | null): RemoteRepository {
  return { fullName, name: fullName, description: '', isPrivate: true, httpsUrl: '', sshUrl: null, webUrl: '', updatedAt }
}

class FakeHost implements RepositoryHost {
  validToken = 'secret'
  checked: HostingCredentials[] = []
  async currentUserName(credentials: HostingCredentials) {
    this.checked.push(credentials)
    if (credentials.token !== this.validToken) throw new Error('rejected (401)')
    return 'Ada Lovelace'
  }
  async repositories() {
    return [remote('acme/old', '2025-01-01T00:00:00Z'), remote('acme/new', '2026-01-01T00:00:00Z')]
  }
}

class RecordingCloner implements RepositoryCloner {
  clones: { url: string; parentFolder: string; folderName: string; options: CloneOptions }[] = []
  async clone(url: string, parentFolder: string, folderName: string, options: CloneOptions) {
    this.clones.push({ url, parentFolder, folderName, options })
    return `${parentFolder}/${folderName}`
  }
}

const noOptions: CloneOptions = { shallow: false, sparse: false }

describe('CloneService', () => {
  let accounts: MemoryAccounts
  let host: FakeHost
  let cloner: RecordingCloner
  let service: CloneService

  beforeEach(() => {
    accounts = new MemoryAccounts()
    host = new FakeHost()
    cloner = new RecordingCloner()
    service = new CloneService(accounts, host, cloner)
  })

  it('verifies the token before saving the account, and never shows the token', async () => {
    const view = await service.connectHostingAccount({ provider: 'github', serverUrl: '', username: '', token: ' secret ' })

    expect(view).toEqual({ provider: 'github', serverUrl: 'https://github.com', username: '', userName: 'Ada Lovelace' })
    expect(accounts.accounts[0].token).toBe('secret')
    expect(await service.hostingAccounts()).toEqual([view])
  })

  it('does not save an account whose token is rejected', async () => {
    await expect(service.connectHostingAccount({ provider: 'gitlab', serverUrl: '', username: '', token: 'wrong' })).rejects.toThrow('401')
    expect(accounts.accounts).toEqual([])
  })

  it('keeps the saved token when it is left empty, and replaces the account of the same service', async () => {
    await service.connectHostingAccount({ provider: 'github-enterprise', serverUrl: 'https://old.example', username: '', token: 'secret' })
    await service.connectHostingAccount({ provider: 'github-enterprise', serverUrl: 'https://new.example/', username: '', token: '' })

    expect(accounts.accounts).toHaveLength(1)
    expect(accounts.accounts[0]).toMatchObject({ serverUrl: 'https://new.example', token: 'secret' })
  })

  it('needs a user name for Bitbucket Cloud and a token for every service', async () => {
    await expect(service.connectHostingAccount({ provider: 'bitbucket', serverUrl: '', username: ' ', token: 'secret' })).rejects.toThrow('user name')
    await expect(service.connectHostingAccount({ provider: 'github', serverUrl: '', username: '', token: '' })).rejects.toThrow('access token is required')
    expect(host.checked).toEqual([])
  })

  it('signs out of one service only', async () => {
    await service.connectHostingAccount({ provider: 'github', serverUrl: '', username: '', token: 'secret' })
    await service.connectHostingAccount({ provider: 'gitlab', serverUrl: '', username: '', token: 'secret' })

    await service.disconnectHostingAccount('github')

    expect(accounts.accounts.map((account) => account.provider)).toEqual(['gitlab'])
  })

  it('lists repositories most recently changed first', async () => {
    await service.connectHostingAccount({ provider: 'github', serverUrl: '', username: '', token: 'secret' })

    const repositories = await service.hostedRepositories('github')

    expect(repositories.map((repository) => repository.fullName)).toEqual(['acme/new', 'acme/old'])
  })

  it('asks to sign in before listing repositories of a service without an account', async () => {
    await expect(service.hostedRepositories('azure-devops')).rejects.toThrow('Sign in')
  })

  it('clones into a new folder inside the chosen one', async () => {
    const path = await service.cloneRepository(' https://github.com/acme/widgets.git ', 'C:/repos', 'widgets', { shallow: true, sparse: false })

    expect(path).toBe('C:/repos/widgets')
    expect(cloner.clones).toEqual([{ url: 'https://github.com/acme/widgets.git', parentFolder: 'C:/repos', folderName: 'widgets', options: { shallow: true, sparse: false } }])
  })

  it('refuses unsafe URLs and folder names before running git', async () => {
    await expect(service.cloneRepository('--upload-pack=evil', 'C:/repos', 'x', noOptions)).rejects.toThrow()
    await expect(service.cloneRepository('https://example.com/a.git', 'C:/repos', '../escape', noOptions)).rejects.toThrow()
    await expect(service.cloneRepository('https://example.com/a.git', ' ', 'a', noOptions)).rejects.toThrow('Choose where')
    expect(cloner.clones).toEqual([])
  })
})
