import type { HostingCredentials, RepositoryHost } from '../application/cloneService'
import { hostingProviderNames, type HostingProvider, type RemoteRepository } from '../domain/hostingProvider'

type Fetch = typeof fetch
type RequestHeaders = Record<string, string>

const requestTimeoutMs = 20000
/** Stops paging on accounts with very many repositories; the list is unusable beyond this anyway. */
const maxRepositories = 2000
const pageSize = 100
/** Accepted by Azure DevOps Services and by Azure DevOps Server 2020 and later. */
const azureDevOpsApiVersion = '6.0'

interface JsonResponse {
  body: unknown
  headers: Headers
}

/** One hosting service's REST API. */
interface ProviderApi {
  currentUserName(credentials: HostingCredentials): Promise<string>
  repositories(credentials: HostingCredentials): Promise<RemoteRepository[]>
}

/** Talks to the REST APIs of GitHub, GitLab, Bitbucket and Azure DevOps to list the repositories a token can read. */
export class HostingApiClient implements RepositoryHost {
  private readonly apis: Record<HostingProvider, ProviderApi>

  constructor(fetchFn: Fetch = (input, init) => fetch(input, init)) {
    const http = new JsonHttp(fetchFn)
    const github = new GitHubApi(http)
    const gitlab = new GitLabApi(http)
    this.apis = {
      github,
      'github-enterprise': github,
      gitlab,
      'gitlab-self-managed': gitlab,
      bitbucket: new BitbucketCloudApi(http),
      'bitbucket-data-center': new BitbucketDataCenterApi(http),
      'azure-devops': new AzureDevOpsApi(http)
    }
  }

  currentUserName(credentials: HostingCredentials): Promise<string> {
    return this.apis[credentials.provider].currentUserName(credentials)
  }

  repositories(credentials: HostingCredentials): Promise<RemoteRepository[]> {
    return this.apis[credentials.provider].repositories(credentials)
  }
}

class JsonHttp {
  constructor(private readonly fetchFn: Fetch) {}

  async get(provider: HostingProvider, url: string, headers: RequestHeaders): Promise<JsonResponse> {
    const service = hostingProviderNames[provider]
    let response: Response
    try {
      response = await this.fetchFn(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(requestTimeoutMs) })
    } catch (error) {
      throw new Error(`Could not reach ${service} at ${new URL(url).origin}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (response.status === 401) throw new Error(`${service} rejected the access token (401). Check that it is correct and has not expired.`)
    if (response.status === 403) throw new Error(`${service} denied access (403). The token may lack the permission to read repositories.`)
    if (!response.ok) throw new Error(`${service} request failed: ${response.status} ${response.statusText}`)
    // Azure DevOps answers a rejected token with a sign-in web page (203) instead of an error.
    if (!(response.headers.get('content-type') ?? '').includes('json')) {
      throw new Error(`${service} answered with a web page instead of data. Check the address and the access token.`)
    }
    return { body: await response.json(), headers: response.headers }
  }

  async getBody<Body>(provider: HostingProvider, url: string, headers: RequestHeaders): Promise<Body> {
    return (await this.get(provider, url, headers)).body as Body
  }

  /** Follows `Link: <…>; rel="next"` headers, as GitHub and GitLab page their lists. */
  async getLinkedPages<Item>(provider: HostingProvider, firstUrl: string, headers: RequestHeaders): Promise<Item[]> {
    const items: Item[] = []
    for (let url: string | null = firstUrl; url && items.length < maxRepositories; ) {
      const page = await this.get(provider, url, headers)
      items.push(...(page.body as Item[]))
      url = nextLink(page.headers.get('link'))
    }
    return items
  }
}

function nextLink(linkHeader: string | null): string | null {
  const next = linkHeader?.split(',').find((link) => /rel="?next"?/.test(link))
  return next ? (/<([^>]+)>/.exec(next)?.[1] ?? null) : null
}

function bearer(token: string): RequestHeaders {
  return { Authorization: `Bearer ${token}` }
}

function basic(username: string, password: string): RequestHeaders {
  return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` }
}

interface GitHubRepository {
  full_name: string
  name: string
  description: string | null
  private: boolean
  clone_url: string
  ssh_url: string
  html_url: string
  pushed_at: string | null
}

/** GitHub.com and GitHub Enterprise Server share one API, found under `/api/v3` on Enterprise Server. */
class GitHubApi implements ProviderApi {
  constructor(private readonly http: JsonHttp) {}

  async currentUserName(credentials: HostingCredentials): Promise<string> {
    const user = await this.http.getBody<{ login: string; name?: string | null }>(credentials.provider, `${githubRoot(credentials)}/user`, githubHeaders(credentials))
    return user.name || user.login
  }

  async repositories(credentials: HostingCredentials): Promise<RemoteRepository[]> {
    const query = new URLSearchParams({ per_page: String(pageSize), sort: 'pushed', affiliation: 'owner,collaborator,organization_member' })
    const url = `${githubRoot(credentials)}/user/repos?${query}`
    const repositories = await this.http.getLinkedPages<GitHubRepository>(credentials.provider, url, githubHeaders(credentials))
    return repositories.map((repository) => ({
      fullName: repository.full_name,
      name: repository.name,
      description: repository.description ?? '',
      isPrivate: repository.private,
      httpsUrl: repository.clone_url,
      sshUrl: repository.ssh_url,
      webUrl: repository.html_url,
      updatedAt: repository.pushed_at
    }))
  }
}

function githubRoot({ provider, serverUrl }: HostingCredentials): string {
  return provider === 'github' ? 'https://api.github.com' : `${serverUrl}/api/v3`
}

function githubHeaders({ token }: HostingCredentials): RequestHeaders {
  return { ...bearer(token), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
}

interface GitLabProject {
  path_with_namespace: string
  name: string
  description: string | null
  visibility?: string
  http_url_to_repo: string
  ssh_url_to_repo: string | null
  web_url: string
  last_activity_at: string | null
}

/** GitLab.com and self-managed GitLab share the v4 API. */
class GitLabApi implements ProviderApi {
  constructor(private readonly http: JsonHttp) {}

  async currentUserName(credentials: HostingCredentials): Promise<string> {
    const user = await this.http.getBody<{ username: string; name?: string }>(credentials.provider, `${credentials.serverUrl}/api/v4/user`, gitlabHeaders(credentials))
    return user.name || user.username
  }

  async repositories(credentials: HostingCredentials): Promise<RemoteRepository[]> {
    const query = new URLSearchParams({ membership: 'true', per_page: String(pageSize), order_by: 'last_activity_at' })
    const url = `${credentials.serverUrl}/api/v4/projects?${query}`
    const projects = await this.http.getLinkedPages<GitLabProject>(credentials.provider, url, gitlabHeaders(credentials))
    return projects.map((project) => ({
      fullName: project.path_with_namespace,
      name: project.name,
      description: project.description ?? '',
      // Without `simple=true` the visibility is included; internal projects are not public either.
      isPrivate: project.visibility !== 'public',
      httpsUrl: project.http_url_to_repo,
      sshUrl: project.ssh_url_to_repo,
      webUrl: project.web_url,
      updatedAt: project.last_activity_at
    }))
  }
}

function gitlabHeaders({ token }: HostingCredentials): RequestHeaders {
  return { 'PRIVATE-TOKEN': token }
}

interface BitbucketCloneLink {
  name: string
  href: string
}

interface BitbucketCloudRepository {
  full_name: string
  name: string
  description?: string
  is_private: boolean
  updated_on?: string
  links: { clone?: BitbucketCloneLink[]; html?: { href: string } }
}

/** Bitbucket Cloud's 2.0 API, signed in with a user name or email and an API token or app password. */
class BitbucketCloudApi implements ProviderApi {
  private readonly root = 'https://api.bitbucket.org/2.0'

  constructor(private readonly http: JsonHttp) {}

  async currentUserName(credentials: HostingCredentials): Promise<string> {
    const user = await this.http.getBody<{ display_name?: string; username?: string }>(credentials.provider, `${this.root}/user`, bitbucketHeaders(credentials))
    return user.display_name || user.username || credentials.username
  }

  async repositories(credentials: HostingCredentials): Promise<RemoteRepository[]> {
    const repositories: BitbucketCloudRepository[] = []
    const query = new URLSearchParams({ role: 'member', pagelen: String(pageSize), sort: '-updated_on' })
    for (let url: string | undefined = `${this.root}/repositories?${query}`; url && repositories.length < maxRepositories; ) {
      const page: { values?: BitbucketCloudRepository[]; next?: string } = await this.http.getBody(credentials.provider, url, bitbucketHeaders(credentials))
      repositories.push(...(page.values ?? []))
      url = page.next
    }
    return repositories.map((repository) => ({
      fullName: repository.full_name,
      name: repository.name,
      description: repository.description ?? '',
      isPrivate: repository.is_private,
      httpsUrl: cloneLink(repository.links.clone, 'https') ?? '',
      sshUrl: cloneLink(repository.links.clone, 'ssh'),
      webUrl: repository.links.html?.href ?? '',
      updatedAt: repository.updated_on ?? null
    }))
  }
}

function bitbucketHeaders({ username, token }: HostingCredentials): RequestHeaders {
  return basic(username, token)
}

function cloneLink(links: BitbucketCloneLink[] | undefined, name: string): string | null {
  return links?.find((link) => link.name === name)?.href ?? null
}

interface BitbucketServerRepository {
  slug: string
  name: string
  description?: string
  public?: boolean
  project: { key: string }
  links: { clone?: BitbucketCloneLink[]; self?: { href: string }[] }
}

interface BitbucketServerPage {
  values?: BitbucketServerRepository[]
  isLastPage?: boolean
  nextPageStart?: number
}

/** Bitbucket Data Center (and Server) 1.0 API, signed in with an HTTP access token. */
class BitbucketDataCenterApi implements ProviderApi {
  constructor(private readonly http: JsonHttp) {}

  /** There is no "who am I" resource; every response names the signed-in user in a header instead. */
  async currentUserName(credentials: HostingCredentials): Promise<string> {
    const response = await this.http.get(credentials.provider, `${this.reposUrl(credentials)}&limit=1`, bearer(credentials.token))
    return response.headers.get('x-ausername') ?? 'your account'
  }

  async repositories(credentials: HostingCredentials): Promise<RemoteRepository[]> {
    const repositories: BitbucketServerRepository[] = []
    for (let start: number | null = 0; start !== null && repositories.length < maxRepositories; ) {
      const url: string = `${this.reposUrl(credentials)}&limit=${pageSize}&start=${start}`
      const page: BitbucketServerPage = await this.http.getBody<BitbucketServerPage>(credentials.provider, url, bearer(credentials.token))
      repositories.push(...(page.values ?? []))
      start = page.isLastPage === false && page.nextPageStart !== undefined ? page.nextPageStart : null
    }
    return repositories.map((repository) => ({
      fullName: `${repository.project.key}/${repository.slug}`,
      name: repository.name,
      description: repository.description ?? '',
      isPrivate: !repository.public,
      // Data Center calls its https clone link "http", whichever scheme the server uses.
      httpsUrl: cloneLink(repository.links.clone, 'http') ?? '',
      sshUrl: cloneLink(repository.links.clone, 'ssh'),
      webUrl: repository.links.self?.[0]?.href ?? '',
      updatedAt: null
    }))
  }

  private reposUrl({ serverUrl }: HostingCredentials): string {
    return `${serverUrl}/rest/api/1.0/repos?permission=REPO_READ`
  }
}

interface AzureDevOpsRepository {
  name: string
  project: { name: string; visibility?: string }
  remoteUrl: string
  sshUrl?: string
  webUrl: string
  isDisabled?: boolean
}

/** Azure DevOps lists every repository of an organisation (or Server collection) in one response. */
class AzureDevOpsApi implements ProviderApi {
  constructor(private readonly http: JsonHttp) {}

  /**
   * The connection data names the user but also answers anonymous requests, so the token is checked by
   * listing repositories first, which needs exactly the Code (Read) permission cloning needs.
   */
  async currentUserName(credentials: HostingCredentials): Promise<string> {
    await this.listRepositories(credentials)
    const connection = await this.http.getBody<{ authenticatedUser?: { providerDisplayName?: string } }>(
      credentials.provider,
      `${credentials.serverUrl}/_apis/connectionData`,
      azureHeaders(credentials)
    )
    return connection.authenticatedUser?.providerDisplayName || 'your account'
  }

  async repositories(credentials: HostingCredentials): Promise<RemoteRepository[]> {
    const repositories = await this.listRepositories(credentials)
    return repositories
      .filter((repository) => !repository.isDisabled)
      .map((repository) => ({
        fullName: `${repository.project.name}/${repository.name}`,
        name: repository.name,
        description: '',
        isPrivate: repository.project.visibility !== 'public',
        httpsUrl: repository.remoteUrl,
        sshUrl: repository.sshUrl ?? null,
        webUrl: repository.webUrl,
        updatedAt: null
      }))
  }

  private async listRepositories(credentials: HostingCredentials): Promise<AzureDevOpsRepository[]> {
    const url = `${credentials.serverUrl}/_apis/git/repositories?api-version=${azureDevOpsApiVersion}`
    return (await this.http.getBody<{ value?: AzureDevOpsRepository[] }>(credentials.provider, url, azureHeaders(credentials))).value ?? []
  }
}

/** A personal access token goes in as the password, with an empty user name. */
function azureHeaders({ token }: HostingCredentials): RequestHeaders {
  return basic('', token)
}
