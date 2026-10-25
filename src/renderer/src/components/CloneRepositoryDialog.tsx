import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { HostingAccountView } from '../../../application/cloneApi'
import {
  cloneFolderName,
  filterRepositories,
  hostingProviderNames,
  hostingProviders,
  needsServerAddress,
  needsUsername,
  serverAddressFor,
  type CloneOptions,
  type HostingProvider,
  type RemoteRepository
} from '../../../domain/hostingProvider'
import { openInBrowser } from '../browser'
import { hostingProviderDisplay } from '../hostingProviderDisplay'
import { kraft } from '../kraftClient'
import { readStored, usePreference, writeStored } from '../usePreference'
import type { RepositoryController } from '../useRepositoryController'
import { GlobeIcon, RepositoryIcon } from './Icons'

type ClonePage = 'url' | HostingProvider

/** The folder the last clone went into, offered again next time. */
const cloneFolderKey = 'kraft.cloneFolder'

const pages: { id: ClonePage; label: string; icon: ReactNode }[] = [
  { id: 'url', label: 'Clone with URL', icon: <GlobeIcon /> },
  ...hostingProviders.map((provider) => ({ id: provider, label: hostingProviderNames[provider], icon: hostingProviderDisplay[provider].icon }))
]

interface CloneDestination {
  parentFolder: string
  setParentFolder: (folder: string) => void
  browse: () => void
  options: CloneOptions
  setOptions: (options: CloneOptions) => void
}

interface Cloner {
  clone: (url: string) => void
  cloning: boolean
  error: string | null
}

/** Clones a repository by URL, or picked from GitHub, GitLab, Bitbucket or Azure DevOps after signing in. */
export function CloneRepositoryDialog({ controller, onClose }: { controller: RepositoryController; onClose: () => void }) {
  const [page, setPage] = useState<ClonePage>('url')
  const [accounts, setAccounts] = useState<HostingAccountView[]>([])
  const destination = useCloneDestination(controller)
  const cloner = useCloner(controller, destination, onClose)
  const close = () => !cloner.cloning && onClose()

  useEffect(() => {
    kraft.hostingAccounts().then(setAccounts, (error: Error) => controller.notify('error', `Could not load the signed-in services: ${error.message}`))
  }, [controller.notify])

  const changeAccount = (provider: HostingProvider, account: HostingAccountView | null) =>
    setAccounts((current) => [...current.filter((candidate) => candidate.provider !== provider), ...(account ? [account] : [])])

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal settings clone-dialog" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => event.key === 'Escape' && close()}>
        <div className="settings-header">
          <h2>Clone a repository</h2>
          <button className="icon-button" title="Close" disabled={cloner.cloning} onClick={close}>
            ✕
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav clone-nav">
            {pages.map((candidate) => (
              <button
                key={candidate.id}
                className={`settings-nav-item clone-nav-item ${candidate.id === page ? 'active' : ''}`}
                disabled={cloner.cloning}
                onClick={() => setPage(candidate.id)}
              >
                {candidate.icon}
                {candidate.label}
              </button>
            ))}
          </nav>
          <div className="settings-page">
            {page === 'url' ? (
              <UrlPage destination={destination} cloner={cloner} />
            ) : (
              <ProviderPage
                key={page}
                controller={controller}
                provider={page}
                account={accounts.find((account) => account.provider === page) ?? null}
                onAccountChange={(account) => changeAccount(page, account)}
                destination={destination}
                cloner={cloner}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function useCloneDestination(controller: RepositoryController): CloneDestination {
  const [parentFolder, setParentFolder] = useState(() => {
    const stored = readStored(cloneFolderKey)
    if (typeof stored === 'string' && stored) return stored
    return controller.view ? parentFolderOf(controller.view.path) : ''
  })
  const [options, setOptions] = useState<CloneOptions>({ shallow: false, sparse: false })
  const browse = async () => {
    const folder = await kraft.chooseRepositoryFolder('Choose where to clone to')
    if (folder) setParentFolder(folder)
  }
  return { parentFolder, setParentFolder, browse: () => void browse(), options, setOptions }
}

function useCloner(controller: RepositoryController, destination: CloneDestination, onClose: () => void): Cloner {
  const [cloning, setCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clone = async (url: string) => {
    setCloning(true)
    setError(null)
    try {
      const path = await kraft.cloneRepository(url, destination.parentFolder, cloneFolderName(url), destination.options)
      writeStored(cloneFolderKey, destination.parentFolder)
      onClose()
      controller.notify('info', `Cloned into ${path}`)
      await controller.openRepository(path)
    } catch (cloneError) {
      setError(cloneError instanceof Error ? cloneError.message : String(cloneError))
      setCloning(false)
    }
  }
  return { clone: (url) => void clone(url), cloning, error }
}

function UrlPage({ destination, cloner }: { destination: CloneDestination; cloner: Cloner }) {
  const [url, setUrl] = useState('')
  return (
    <>
      <h3 className="clone-title">Clone a repo</h3>
      <div className="clone-form">
        <FolderField destination={destination} />
        <label className="clone-label" htmlFor="clone-url">
          URL
        </label>
        <input
          id="clone-url"
          autoFocus
          value={url}
          placeholder="https://github.com/owner/repository.git"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && url.trim() && cloner.clone(url)}
        />
        <OptionFields destination={destination} />
      </div>
      <CloneFooter url={url.trim()} destination={destination} cloner={cloner} />
    </>
  )
}

function FolderField({ destination }: { destination: CloneDestination }) {
  return (
    <>
      <label className="clone-label" htmlFor="clone-folder">
        Where to clone to
      </label>
      <div className="clone-folder-row">
        <input id="clone-folder" value={destination.parentFolder} onChange={(event) => destination.setParentFolder(event.target.value)} />
        <button className="secondary" onClick={destination.browse}>
          Browse
        </button>
      </div>
    </>
  )
}

function OptionFields({ destination }: { destination: CloneDestination }) {
  const { options, setOptions } = destination
  return (
    <>
      <label className="clone-label" htmlFor="clone-shallow" title="Only the latest commit is downloaded (--depth 1)">
        Shallow clone
      </label>
      <input id="clone-shallow" type="checkbox" checked={options.shallow} onChange={(event) => setOptions({ ...options, shallow: event.target.checked })} />
      <label
        className="clone-label"
        htmlFor="clone-sparse"
        title="Only the files at the top level are checked out (--sparse); add folders later with git sparse-checkout add"
      >
        Sparse checkout
      </label>
      <input id="clone-sparse" type="checkbox" checked={options.sparse} onChange={(event) => setOptions({ ...options, sparse: event.target.checked })} />
    </>
  )
}

function CloneFooter({ url, destination, cloner }: { url: string; destination: CloneDestination; cloner: Cloner }) {
  const folderName = url ? cloneFolderName(url) : ''
  const fullPath = destination.parentFolder && folderName ? joinPath(destination.parentFolder, folderName) : ''
  return (
    <>
      {cloner.error && <div className="error-text clone-error">{cloner.error}</div>}
      <div className="clone-footer">
        <span className="muted small clone-full-path" title={fullPath}>
          {fullPath && `Full path: ${fullPath}`}
        </span>
        <button className="primary" disabled={!url || !destination.parentFolder.trim() || cloner.cloning} onClick={() => cloner.clone(url)}>
          {cloner.cloning ? 'Cloning…' : 'Clone the repo!'}
        </button>
      </div>
    </>
  )
}

interface ProviderPageProps {
  controller: RepositoryController
  provider: HostingProvider
  account: HostingAccountView | null
  onAccountChange: (account: HostingAccountView | null) => void
  destination: CloneDestination
  cloner: Cloner
}

function ProviderPage({ controller, provider, account, onAccountChange, destination, cloner }: ProviderPageProps) {
  const [editing, setEditing] = useState(false)
  if (!account || editing) {
    return (
      <ConnectForm
        provider={provider}
        account={account}
        onConnected={(connected) => {
          setEditing(false)
          onAccountChange(connected)
        }}
        onCancel={account ? () => setEditing(false) : null}
      />
    )
  }
  const signOut = () =>
    controller.ask({
      title: `Sign out of ${hostingProviderNames[provider]}?`,
      description: 'The saved access token is deleted from this computer. Repositories you already cloned are not affected.',
      fields: [],
      confirmLabel: 'Sign out',
      danger: true,
      onSubmit: () =>
        kraft.disconnectHostingAccount(provider).then(
          () => onAccountChange(null),
          (error: Error) => controller.notify('error', error.message)
        )
    })
  return <RepositoryPicker provider={provider} account={account} onEdit={() => setEditing(true)} onSignOut={signOut} destination={destination} cloner={cloner} />
}

interface ConnectFormProps {
  provider: HostingProvider
  account: HostingAccountView | null
  onConnected: (account: HostingAccountView) => void
  /** Null when there is no saved account to go back to. */
  onCancel: (() => void) | null
}

function ConnectForm({ provider, account, onConnected, onCancel }: ConnectFormProps) {
  const display = hostingProviderDisplay[provider]
  const [address, setAddress] = useState(account?.serverUrl ?? '')
  const [username, setUsername] = useState(account?.username ?? '')
  const [token, setToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const tokenPage = tokenPageFor(provider, address)

  const connect = async (event: FormEvent) => {
    event.preventDefault()
    setConnecting(true)
    setError(null)
    try {
      onConnected(await kraft.connectHostingAccount({ provider, serverUrl: address, username, token }))
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : String(connectError))
      setConnecting(false)
    }
  }

  return (
    <form className="clone-connect" onSubmit={(event) => void connect(event)}>
      <h3 className="clone-title">
        {display.icon} {hostingProviderNames[provider]}
      </h3>
      <p className="muted">
        Sign in with an access token to see your repositories. The token is stored encrypted on this computer and only used to list repositories;
        cloning uses your usual Git credentials.
      </p>
      <div className="clone-form">
        {needsServerAddress(provider) && (
          <>
            <label className="clone-label" htmlFor="clone-address">
              {display.addressLabel}
            </label>
            <input id="clone-address" autoFocus value={address} placeholder={display.addressPlaceholder} onChange={(event) => setAddress(event.target.value)} />
          </>
        )}
        {needsUsername(provider) && (
          <>
            <label className="clone-label" htmlFor="clone-username">
              {display.usernameLabel}
            </label>
            <input id="clone-username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </>
        )}
        <label className="clone-label" htmlFor="clone-token">
          Access token
        </label>
        <input
          id="clone-token"
          type="password"
          autoFocus={!needsServerAddress(provider) && !needsUsername(provider)}
          value={token}
          placeholder={account ? 'Leave empty to keep the saved token' : ''}
          onChange={(event) => setToken(event.target.value)}
        />
        <span />
        <span className="muted small">
          {display.tokenHelp}{' '}
          {tokenPage && (
            <button type="button" className="link-button" onClick={() => openInBrowser(tokenPage)}>
              Create a token
            </button>
          )}
        </span>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="modal-buttons">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary" disabled={connecting}>
          {connecting ? 'Signing in…' : `Sign in to ${hostingProviderNames[provider]}`}
        </button>
      </div>
    </form>
  )
}

type RepositoryList = { kind: 'loading' } | { kind: 'done'; repositories: RemoteRepository[] } | { kind: 'failed'; message: string }

interface RepositoryPickerProps {
  provider: HostingProvider
  account: HostingAccountView
  onEdit: () => void
  onSignOut: () => void
  destination: CloneDestination
  cloner: Cloner
}

function RepositoryPicker({ provider, account, onEdit, onSignOut, destination, cloner }: RepositoryPickerProps) {
  const [list, setList] = useState<RepositoryList>({ kind: 'loading' })
  const [loadCount, setLoadCount] = useState(0)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState<RemoteRepository | null>(null)
  const [protocol, setProtocol] = usePreference<'https' | 'ssh'>('kraft.cloneProtocol', 'https', ['https', 'ssh'])

  useEffect(() => {
    let current = true
    setList({ kind: 'loading' })
    kraft.hostedRepositories(provider).then(
      (repositories) => current && setList({ kind: 'done', repositories }),
      (error: Error) => current && setList({ kind: 'failed', message: error.message })
    )
    return () => {
      current = false
    }
  }, [provider, account, loadCount])

  const shown = useMemo(() => (list.kind === 'done' ? filterRepositories(list.repositories, filter) : []), [list, filter])
  const urlOf = (repository: RemoteRepository) => (protocol === 'ssh' && repository.sshUrl ? repository.sshUrl : repository.httpsUrl)

  return (
    <>
      <div className="clone-account">
        <span className="clone-title">
          {hostingProviderDisplay[provider].icon} {hostingProviderNames[provider]}
        </span>
        <span className="muted small clone-account-name" title={account.serverUrl}>
          Signed in as {account.userName}
          {needsServerAddress(provider) ? ` on ${account.serverUrl}` : ''}
        </span>
        <button className="link-button" onClick={() => setLoadCount((count) => count + 1)}>
          Refresh
        </button>
        <button className="link-button" onClick={onEdit}>
          Change token
        </button>
        <button className="link-button danger" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      <div className="clone-form">
        <FolderField destination={destination} />
        <label className="clone-label" htmlFor="clone-filter">
          Repository
        </label>
        <input id="clone-filter" autoFocus value={filter} placeholder="Filter repositories" onChange={(event) => setFilter(event.target.value)} />
      </div>
      <div className="clone-repositories">
        {list.kind === 'loading' && <div className="empty-state">Loading repositories…</div>}
        {list.kind === 'failed' && <div className="empty-state error-text">{list.message}</div>}
        {list.kind === 'done' && shown.length === 0 && (
          <div className="empty-state">{list.repositories.length === 0 ? 'This account has no repositories.' : 'No repositories match the filter.'}</div>
        )}
        {shown.map((repository) => (
          <button
            key={repository.fullName}
            className={`clone-repository ${selected?.fullName === repository.fullName ? 'selected' : ''}`}
            title={repository.webUrl}
            onClick={() => setSelected(repository)}
            onDoubleClick={() => cloner.clone(urlOf(repository))}
          >
            <span className="library-icon">
              <RepositoryIcon />
            </span>
            <span className="clone-repository-name">{repository.fullName}</span>
            {repository.isPrivate && <span className="clone-private">private</span>}
            <span className="muted small clone-repository-description">{repository.description}</span>
          </button>
        ))}
      </div>
      <div className="clone-form">
        <label className="clone-label" htmlFor="clone-protocol">
          Clone with
        </label>
        <select id="clone-protocol" className="clone-protocol" value={protocol} onChange={(event) => setProtocol(event.target.value as 'https' | 'ssh')}>
          <option value="https">HTTPS</option>
          <option value="ssh">SSH</option>
        </select>
        <OptionFields destination={destination} />
      </div>
      <CloneFooter url={selected ? urlOf(selected) : ''} destination={destination} cloner={cloner} />
    </>
  )
}

/** The token page needs the server's address, which for self-hosted services is only known once it is valid. */
function tokenPageFor(provider: HostingProvider, enteredAddress: string): string | null {
  const tokenPage = hostingProviderDisplay[provider].tokenPage
  if (!tokenPage) return null
  try {
    return tokenPage(serverAddressFor(provider, enteredAddress))
  } catch {
    return null
  }
}

function parentFolderOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '')
}

function joinPath(folder: string, name: string): string {
  const separator = folder.includes('\\') ? '\\' : '/'
  return `${folder.replace(/[\\/]+$/, '')}${separator}${name}`
}
