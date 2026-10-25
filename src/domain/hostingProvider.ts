/** The services repositories can be cloned from after signing in with an access token. */
export const hostingProviders = [
  'github',
  'github-enterprise',
  'gitlab',
  'gitlab-self-managed',
  'bitbucket',
  'bitbucket-data-center',
  'azure-devops'
] as const

export type HostingProvider = (typeof hostingProviders)[number]

export const hostingProviderNames: Record<HostingProvider, string> = {
  github: 'GitHub.com',
  'github-enterprise': 'GitHub Enterprise Server',
  gitlab: 'GitLab.com',
  'gitlab-self-managed': 'GitLab (Self-Managed)',
  bitbucket: 'Bitbucket.org',
  'bitbucket-data-center': 'Bitbucket Data Center',
  'azure-devops': 'Azure DevOps'
}

/** The cloud services always live at the same address; the others are run by the user's organisation. */
const cloudAddresses: Partial<Record<HostingProvider, string>> = {
  github: 'https://github.com',
  gitlab: 'https://gitlab.com',
  bitbucket: 'https://bitbucket.org'
}

const azureDevOpsOrigin = 'https://dev.azure.com'

/** A repository the signed-in user can clone from a hosting service. */
export interface RemoteRepository {
  /** The name with its owner, e.g. `acme/widgets` or `Project/widgets`. */
  fullName: string
  name: string
  description: string
  isPrivate: boolean
  httpsUrl: string
  /** Null when the service does not offer SSH for this repository. */
  sshUrl: string | null
  webUrl: string
  /** ISO 8601; null when the service does not say. */
  updatedAt: string | null
}

export interface CloneOptions {
  /** Only the latest commit (`--depth 1`). */
  shallow: boolean
  /** Checks out only the files at the top level (`--sparse`); folders are added later with `git sparse-checkout add`. */
  sparse: boolean
}

export function needsServerAddress(provider: HostingProvider): boolean {
  return cloudAddresses[provider] === undefined
}

/** Bitbucket Cloud signs in with a user name or email and a token; the others with a token alone. */
export function needsUsername(provider: HostingProvider): boolean {
  return provider === 'bitbucket'
}

/**
 * The address of the service the user signs in to, without a trailing slash. Azure DevOps accepts a bare
 * organisation name. Tokens are sent to this address on every request, so it must use https, except for a
 * server on this computer where nothing crosses the network.
 */
export function serverAddressFor(provider: HostingProvider, enteredAddress: string): string {
  const cloudAddress = cloudAddresses[provider]
  if (cloudAddress) return cloudAddress
  const text = enteredAddress.trim().replace(/\/+$/, '')
  if (!text) throw new Error('Enter the address of the server')
  const address = provider === 'azure-devops' && /^[\w.-]+$/.test(text) ? `${azureDevOpsOrigin}/${text}` : text
  let url: URL
  try {
    url = new URL(address)
  } catch {
    throw new Error(`"${text}" is not a valid address. Use e.g. https://git.example.com`)
  }
  if (url.protocol !== 'https:' && !isLocalHttp(url)) throw new Error('The address must start with https:// (http is only allowed for localhost)')
  return address
}

export function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
}

/** Repositories whose name or description contains every word of `text`, ignoring case. */
export function filterRepositories(repositories: readonly RemoteRepository[], text: string): RemoteRepository[] {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  return repositories.filter((repository) => {
    const haystack = `${repository.fullName} ${repository.description}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** Most recently changed first; repositories without a date follow, by name. */
export function sortByRecentActivity(repositories: readonly RemoteRepository[]): RemoteRepository[] {
  return [...repositories].sort((a, b) => {
    if (a.updatedAt && b.updatedAt && a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
    if (a.updatedAt && !b.updatedAt) return -1
    if (!a.updatedAt && b.updatedAt) return 1
    return a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' })
  })
}

/** The folder name `git clone` would pick: the URL's last path segment without `.git`. */
export function cloneFolderName(cloneUrl: string): string {
  const path = cloneUrl.trim().replace(/[?#].*$/, '').replace(/[\\/]+$/, '')
  const lastSegment = (path.split(/[\\/:]/).pop() ?? '').replace(/\.git$/i, '')
  // Azure DevOps puts names with spaces in its URLs as `My%20Repo`.
  try {
    return decodeURIComponent(lastSegment)
  } catch {
    return lastSegment
  }
}

/** Remote helpers such as `ext::` run arbitrary commands, so only plain URLs and paths are cloned. */
const remoteHelperSyntax = /^[a-z][a-z0-9+.-]*::/i

export function assertCloneUrl(cloneUrl: string): string {
  const url = cloneUrl.trim()
  if (!url) throw new Error('Enter the URL of the repository to clone')
  if (url.startsWith('-') || /\s/.test(url)) throw new Error(`"${url}" is not a valid repository URL`)
  if (remoteHelperSyntax.test(url)) throw new Error(`Cloning through a remote helper ("${url.split('::')[0]}::") is not supported`)
  return url
}

/** The clone goes into a new folder directly inside the chosen one, never somewhere else. */
export function assertCloneFolderName(folderName: string): string {
  const name = folderName.trim()
  if (!name) throw new Error('Enter a name for the new folder')
  if (name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name) || name.startsWith('-')) {
    throw new Error(`"${name}" cannot be used as a folder name`)
  }
  return name
}
