import {
  assertCloneFolderName,
  assertCloneUrl,
  needsUsername,
  serverAddressFor,
  sortByRecentActivity,
  type CloneOptions,
  type HostingProvider,
  type RemoteRepository
} from '../domain/hostingProvider'
import type { CloneApi, HostingAccountConnection, HostingAccountInput, HostingAccountView } from './cloneApi'

export interface HostingCredentials extends HostingAccountConnection {
  token: string
}

export interface StoredHostingAccount extends HostingCredentials {
  userName: string
}

/** Keeps at most one account per hosting service. */
export interface HostingAccountStore {
  load(): Promise<StoredHostingAccount[]>
  save(accounts: StoredHostingAccount[]): Promise<void>
}

/** A hosting service's API, as seen by the use cases. */
export interface RepositoryHost {
  /** Returns the display name of the signed-in user; fails when the token is rejected. */
  currentUserName(credentials: HostingCredentials): Promise<string>
  repositories(credentials: HostingCredentials): Promise<RemoteRepository[]>
}

export interface RepositoryCloner {
  /** Runs `git clone` into `folderName` inside `parentFolder` and returns the new repository's path. */
  clone(url: string, parentFolder: string, folderName: string, options: CloneOptions): Promise<string>
}

export class CloneService implements CloneApi {
  constructor(
    private readonly store: HostingAccountStore,
    private readonly host: RepositoryHost,
    private readonly cloner: RepositoryCloner
  ) {}

  async hostingAccounts(): Promise<HostingAccountView[]> {
    return (await this.store.load()).map(toView)
  }

  async connectHostingAccount(input: HostingAccountInput): Promise<HostingAccountView> {
    const accounts = await this.store.load()
    const previous = accounts.find((account) => account.provider === input.provider)
    const credentials = validate({ ...input, token: input.token.trim() || previous?.token || '' })
    const userName = await this.host.currentUserName(credentials)
    const stored = { ...credentials, userName }
    await this.store.save([...accounts.filter((account) => account.provider !== input.provider), stored])
    return toView(stored)
  }

  async disconnectHostingAccount(provider: HostingProvider): Promise<void> {
    const accounts = await this.store.load()
    await this.store.save(accounts.filter((account) => account.provider !== provider))
  }

  async hostedRepositories(provider: HostingProvider): Promise<RemoteRepository[]> {
    const account = (await this.store.load()).find((candidate) => candidate.provider === provider)
    if (!account) throw new Error('Sign in to the service first')
    return sortByRecentActivity(await this.host.repositories(account))
  }

  async cloneRepository(url: string, parentFolder: string, folderName: string, options: CloneOptions): Promise<string> {
    if (!parentFolder.trim()) throw new Error('Choose where to clone to')
    return this.cloner.clone(assertCloneUrl(url), parentFolder.trim(), assertCloneFolderName(folderName), options)
  }
}

function validate(credentials: HostingCredentials): HostingCredentials {
  const username = credentials.username.trim()
  if (needsUsername(credentials.provider) && !username) throw new Error('Enter the user name or email you sign in with')
  if (!credentials.token) throw new Error('An access token is required')
  return { ...credentials, serverUrl: serverAddressFor(credentials.provider, credentials.serverUrl), username }
}

function toView({ provider, serverUrl, username, userName }: StoredHostingAccount): HostingAccountView {
  return { provider, serverUrl, username, userName }
}
