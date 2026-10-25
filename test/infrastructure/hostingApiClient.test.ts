import { describe, expect, it } from 'vitest'
import type { HostingCredentials } from '../../src/application/cloneService'
import { HostingApiClient } from '../../src/infrastructure/hostingApiClient'

interface FakeResponse {
  body: unknown
  status?: number
  headers?: Record<string, string>
  contentType?: string
}

/** Answers each request with the response registered for its URL, and records the requests. */
function fakeFetch(responses: Record<string, FakeResponse>) {
  const requests: { url: string; headers: Record<string, string> }[] = []
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, headers: init?.headers as Record<string, string> })
    const response = responses[url]
    if (!response) return new Response('not found', { status: 404, statusText: 'Not Found' })
    return new Response(typeof response.body === 'string' ? response.body : JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { 'content-type': response.contentType ?? 'application/json; charset=utf-8', ...response.headers }
    })
  }
  return { requests, client: new HostingApiClient(fetchFn as typeof fetch) }
}

function credentials(overrides: Partial<HostingCredentials>): HostingCredentials {
  return { provider: 'github', serverUrl: 'https://github.com', username: '', token: 'secret', ...overrides }
}

const githubRepository = {
  full_name: 'acme/widgets',
  name: 'widgets',
  description: null,
  private: true,
  clone_url: 'https://github.com/acme/widgets.git',
  ssh_url: 'git@github.com:acme/widgets.git',
  html_url: 'https://github.com/acme/widgets',
  pushed_at: '2026-05-01T10:00:00Z'
}

describe('HostingApiClient', () => {
  it('follows GitHub pages and signs in with a bearer token', async () => {
    const first = 'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner%2Ccollaborator%2Corganization_member'
    const second = 'https://api.github.com/user/repos?page=2'
    const { requests, client } = fakeFetch({
      [first]: { body: [githubRepository], headers: { link: `<${second}>; rel="next", <${second}>; rel="last"` } },
      [second]: { body: [{ ...githubRepository, full_name: 'acme/gears', description: 'Gears' }] }
    })

    const repositories = await client.repositories(credentials({}))

    expect(requests.map((request) => request.url)).toEqual([first, second])
    expect(requests[0].headers.Authorization).toBe('Bearer secret')
    expect(repositories[0]).toEqual({
      fullName: 'acme/widgets',
      name: 'widgets',
      description: '',
      isPrivate: true,
      httpsUrl: 'https://github.com/acme/widgets.git',
      sshUrl: 'git@github.com:acme/widgets.git',
      webUrl: 'https://github.com/acme/widgets',
      updatedAt: '2026-05-01T10:00:00Z'
    })
    expect(repositories[1].description).toBe('Gears')
  })

  it('uses /api/v3 on GitHub Enterprise Server', async () => {
    const { client } = fakeFetch({ 'https://github.corp.example/api/v3/user': { body: { login: 'ada', name: null } } })

    expect(await client.currentUserName(credentials({ provider: 'github-enterprise', serverUrl: 'https://github.corp.example' }))).toBe('ada')
  })

  it('lists GitLab projects the user is a member of with a private token header', async () => {
    const url = 'https://gitlab.com/api/v4/projects?membership=true&per_page=100&order_by=last_activity_at'
    const { requests, client } = fakeFetch({
      [url]: {
        body: [
          {
            path_with_namespace: 'group/widgets',
            name: 'widgets',
            description: 'Widgets',
            visibility: 'internal',
            http_url_to_repo: 'https://gitlab.com/group/widgets.git',
            ssh_url_to_repo: 'git@gitlab.com:group/widgets.git',
            web_url: 'https://gitlab.com/group/widgets',
            last_activity_at: '2026-01-01T00:00:00Z'
          }
        ]
      }
    })

    const [project] = await client.repositories(credentials({ provider: 'gitlab', serverUrl: 'https://gitlab.com' }))

    expect(requests[0].headers['PRIVATE-TOKEN']).toBe('secret')
    expect(project).toMatchObject({ fullName: 'group/widgets', isPrivate: true, httpsUrl: 'https://gitlab.com/group/widgets.git' })
  })

  it('follows Bitbucket Cloud "next" links with basic auth', async () => {
    const first = 'https://api.bitbucket.org/2.0/repositories?role=member&pagelen=100&sort=-updated_on'
    const second = 'https://api.bitbucket.org/2.0/repositories?page=2'
    const repository = {
      full_name: 'team/widgets',
      name: 'widgets',
      is_private: false,
      updated_on: '2026-02-01T00:00:00Z',
      links: {
        clone: [
          { name: 'https', href: 'https://ada@bitbucket.org/team/widgets.git' },
          { name: 'ssh', href: 'git@bitbucket.org:team/widgets.git' }
        ],
        html: { href: 'https://bitbucket.org/team/widgets' }
      }
    }
    const { requests, client } = fakeFetch({
      [first]: { body: { values: [repository], next: second } },
      [second]: { body: { values: [{ ...repository, full_name: 'team/gears' }] } }
    })

    const repositories = await client.repositories(credentials({ provider: 'bitbucket', serverUrl: 'https://bitbucket.org', username: 'ada@example.com' }))

    expect(requests[0].headers.Authorization).toBe(`Basic ${Buffer.from('ada@example.com:secret').toString('base64')}`)
    expect(repositories.map((found) => found.fullName)).toEqual(['team/widgets', 'team/gears'])
    expect(repositories[0]).toMatchObject({ httpsUrl: 'https://ada@bitbucket.org/team/widgets.git', sshUrl: 'git@bitbucket.org:team/widgets.git' })
  })

  it('pages Bitbucket Data Center by start index and reads the user from the response header', async () => {
    const base = 'https://bitbucket.corp.example/rest/api/1.0/repos?permission=REPO_READ'
    const repository = {
      slug: 'widgets',
      name: 'Widgets',
      public: false,
      project: { key: 'ACME' },
      links: {
        clone: [
          { name: 'http', href: 'https://bitbucket.corp.example/scm/acme/widgets.git' },
          { name: 'ssh', href: 'ssh://git@bitbucket.corp.example:7999/acme/widgets.git' }
        ],
        self: [{ href: 'https://bitbucket.corp.example/projects/ACME/repos/widgets/browse' }]
      }
    }
    const { client } = fakeFetch({
      [`${base}&limit=1`]: { body: { values: [] }, headers: { 'X-AUSERNAME': 'ada' } },
      [`${base}&limit=100&start=0`]: { body: { values: [repository], isLastPage: false, nextPageStart: 1 } },
      [`${base}&limit=100&start=1`]: { body: { values: [{ ...repository, slug: 'gears' }], isLastPage: true } }
    })
    const account = credentials({ provider: 'bitbucket-data-center', serverUrl: 'https://bitbucket.corp.example' })

    expect(await client.currentUserName(account)).toBe('ada')
    const repositories = await client.repositories(account)
    expect(repositories.map((found) => found.fullName)).toEqual(['ACME/widgets', 'ACME/gears'])
    expect(repositories[0].httpsUrl).toBe('https://bitbucket.corp.example/scm/acme/widgets.git')
  })

  it('lists Azure DevOps repositories, leaving out disabled ones', async () => {
    const url = 'https://dev.azure.com/acme/_apis/git/repositories?api-version=6.0'
    const repository = {
      name: 'widgets',
      project: { name: 'Shop', visibility: 'private' },
      remoteUrl: 'https://acme@dev.azure.com/acme/Shop/_git/widgets',
      sshUrl: 'git@ssh.dev.azure.com:v3/acme/Shop/widgets',
      webUrl: 'https://dev.azure.com/acme/Shop/_git/widgets'
    }
    const { requests, client } = fakeFetch({ [url]: { body: { value: [repository, { ...repository, name: 'old', isDisabled: true }] } } })

    const repositories = await client.repositories(credentials({ provider: 'azure-devops', serverUrl: 'https://dev.azure.com/acme' }))

    expect(requests[0].headers.Authorization).toBe(`Basic ${Buffer.from(':secret').toString('base64')}`)
    expect(repositories).toEqual([
      {
        fullName: 'Shop/widgets',
        name: 'widgets',
        description: '',
        isPrivate: true,
        httpsUrl: 'https://acme@dev.azure.com/acme/Shop/_git/widgets',
        sshUrl: 'git@ssh.dev.azure.com:v3/acme/Shop/widgets',
        webUrl: 'https://dev.azure.com/acme/Shop/_git/widgets',
        updatedAt: null
      }
    ])
  })

  it('treats the sign-in page Azure DevOps shows for a bad token as a rejection', async () => {
    const url = 'https://dev.azure.com/acme/_apis/git/repositories?api-version=6.0'
    const { client } = fakeFetch({ [url]: { body: '<html>Sign in</html>', status: 203, contentType: 'text/html' } })

    await expect(client.currentUserName(credentials({ provider: 'azure-devops', serverUrl: 'https://dev.azure.com/acme' }))).rejects.toThrow(
      'web page instead of data'
    )
  })

  it('explains a rejected token', async () => {
    const { client } = fakeFetch({ 'https://api.github.com/user': { body: { message: 'Bad credentials' }, status: 401 } })

    await expect(client.currentUserName(credentials({}))).rejects.toThrow('GitHub.com rejected the access token (401)')
  })
})
