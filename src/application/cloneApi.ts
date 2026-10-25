import type { CloneOptions, HostingProvider, RemoteRepository } from '../domain/hostingProvider'

export interface HostingAccountConnection {
  provider: HostingProvider
  /** The service's address; for the cloud services it is always their own. */
  serverUrl: string
  /** Only used by Bitbucket Cloud. */
  username: string
}

/** What the user interface may see of an account; the token never leaves the main process. */
export interface HostingAccountView extends HostingAccountConnection {
  /** The name the service shows for the signed-in user. */
  userName: string
}

export interface HostingAccountInput extends HostingAccountConnection {
  /** Empty keeps the token that is already saved for this service. */
  token: string
}

/** Cloning repositories, by URL or picked from a hosting service the user signed in to. */
export interface CloneApi {
  hostingAccounts(): Promise<HostingAccountView[]>
  /** Verifies the token with the service before saving it, replacing any account saved for that service. */
  connectHostingAccount(input: HostingAccountInput): Promise<HostingAccountView>
  disconnectHostingAccount(provider: HostingProvider): Promise<void>
  /** The repositories the signed-in user can clone, most recently changed first. */
  hostedRepositories(provider: HostingProvider): Promise<RemoteRepository[]>
  /** Clones into a new folder `folderName` inside `parentFolder` and returns the clone's path. */
  cloneRepository(url: string, parentFolder: string, folderName: string, options: CloneOptions): Promise<string>
}

export type CloneMethod = keyof CloneApi

export const cloneMethods: readonly CloneMethod[] = [
  'hostingAccounts',
  'connectHostingAccount',
  'disconnectHostingAccount',
  'hostedRepositories',
  'cloneRepository'
]
