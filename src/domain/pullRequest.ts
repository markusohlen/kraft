import type { Branch } from './entities'
import { mergeTargetsFor, parseGitFlowBranch, type GitFlowConfig } from './gitFlow'
import { splitRemoteBranch, type RemoteBranchName } from './remoteBranch'

export type HostingService = 'github' | 'gitlab' | 'bitbucket' | 'bitbucket-server' | 'azure-devops'

export const hostingServiceNames: Record<HostingService, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  bitbucket: 'Bitbucket',
  'bitbucket-server': 'Bitbucket',
  'azure-devops': 'Azure DevOps'
}

/** A repository on a hosting service, found from the URL of the remote that points to it. */
export interface HostedRepository {
  service: HostingService
  /** The repository's web page, e.g. `https://github.com/acme/widgets`. */
  webUrl: string
}

/** Hosts that serve SSH on port 443 for networks that block port 22, and the sites they belong to. */
const sshOver443Sites: Record<string, string> = {
  'ssh.github.com': 'github.com',
  'altssh.gitlab.com': 'gitlab.com',
  'altssh.bitbucket.org': 'bitbucket.org'
}

interface RemoteLocation {
  /** Where the web pages are; SSH remotes are served over https on the same host. */
  webOrigin: string
  hostname: string
  /** The repository path without slashes around it or a `.git` suffix. */
  path: string
}

/**
 * Finds the hosted repository behind a remote URL in any form git accepts for these services:
 * `https://…`, `ssh://…` or `git@host:owner/repo.git`. Credentials in the URL are left out.
 * Returns null for local paths and hosts that are not GitHub, GitLab, Bitbucket or Azure DevOps.
 */
export function hostedRepositoryFor(remoteUrl: string): HostedRepository | null {
  const location = parseRemoteLocation(remoteUrl)
  if (!location?.path) return null
  const { path } = location
  const sshOver443Site = sshOver443Sites[location.hostname.toLowerCase()]
  const hostname = sshOver443Site ?? location.hostname.toLowerCase()
  const webOrigin = sshOver443Site ? `https://${sshOver443Site}` : location.webOrigin
  const segments = path.split('/')

  if (hostname === 'ssh.dev.azure.com' || hostname === 'vs-ssh.visualstudio.com') {
    // SSH paths are `v3/<organization>/<project>/<repository>`.
    const [version, organization, project, repository] = segments
    if (version !== 'v3' || segments.length !== 4) return null
    const site = hostname === 'ssh.dev.azure.com' ? `https://dev.azure.com/${organization}` : `https://${organization}.visualstudio.com`
    return { service: 'azure-devops', webUrl: `${site}/${project}/_git/${repository}` }
  }
  if (hostname === 'dev.azure.com' || hostname.endsWith('.visualstudio.com')) {
    return segments.includes('_git') ? { service: 'azure-devops', webUrl: `${webOrigin}/${path}` } : null
  }
  if (hostname === 'bitbucket.org') return { service: 'bitbucket', webUrl: `${webOrigin}/${path}` }
  if (hostname.includes('bitbucket')) return bitbucketServerRepository(webOrigin, segments)
  if (hostname.includes('github')) return { service: 'github', webUrl: `${webOrigin}/${path}` }
  if (hostname.includes('gitlab')) return { service: 'gitlab', webUrl: `${webOrigin}/${path}` }
  return null
}

/** The page that creates a pull request from `source` into `target`, both branch names on the hosting service. */
export function pullRequestUrl(repository: HostedRepository, source: string, target: string): string {
  const { webUrl } = repository
  switch (repository.service) {
    case 'github':
      return `${webUrl}/compare/${branchPath(target)}...${branchPath(source)}?expand=1`
    case 'gitlab':
      return `${webUrl}/-/merge_requests/new?${query({ 'merge_request[source_branch]': source, 'merge_request[target_branch]': target })}`
    case 'bitbucket':
      return `${webUrl}/pull-requests/new?${query({ source, dest: target })}`
    case 'bitbucket-server':
      return `${webUrl}/pull-requests?create&${query({ sourceBranch: `refs/heads/${source}`, targetBranch: `refs/heads/${target}` })}`
    case 'azure-devops':
      return `${webUrl}/pullrequestcreate?${query({ sourceRef: source, targetRef: target })}`
  }
}

/** Where a pull request for a local branch comes from, and what has to be pushed before it can be opened. */
export interface PullRequestSource extends RemoteBranchName {
  /**
   * `publish` pushes a branch that has no upstream yet and makes the pushed branch its upstream;
   * `update` pushes commits the upstream does not have (or recreates an upstream that was deleted).
   */
  push: 'publish' | 'update' | null
}

/**
 * A branch with an upstream opens its pull request from the upstream. Other branches are published
 * under their own name to the first remote, the same place Push publishes them.
 */
export function pullRequestSource(branch: Branch, remotes: readonly string[], remoteBranches: readonly string[]): PullRequestSource | null {
  const upstream = branch.upstream ? splitRemoteBranch(branch.upstream, remotes) : null
  if (upstream) {
    const isPushed = branch.ahead === 0 && remoteBranches.includes(`${upstream.remote}/${upstream.branch}`)
    return { ...upstream, push: isPushed ? null : 'update' }
  }
  const [remote] = remotes
  return remote ? { remote, branch: branch.name, push: 'publish' } : null
}

/** The branches on the source's remote that the pull request can merge into. */
export function pullRequestTargets(source: RemoteBranchName, remotes: readonly string[], remoteBranches: readonly string[]): string[] {
  return remoteBranches.flatMap((remoteBranch) => {
    const target = splitRemoteBranch(remoteBranch, remotes)
    return target && target.remote === source.remote && target.branch !== source.branch ? [target.branch] : []
  })
}

const conventionalTargets = ['main', 'master', 'develop', 'trunk']

/**
 * With git-flow, a branch goes where finishing it would merge it first: features into develop, releases
 * and hotfixes into main, and any other branch into develop. Otherwise the usual main branch names are tried.
 */
export function defaultPullRequestTarget(branchName: string, targets: readonly string[], gitFlow: GitFlowConfig | null): string | null {
  const gitFlowBranch = gitFlow ? parseGitFlowBranch(branchName, gitFlow) : null
  const gitFlowTarget = gitFlow && (gitFlowBranch ? mergeTargetsFor(gitFlowBranch.type, gitFlow)[0] : gitFlow.developBranch)
  const preferred = gitFlowTarget ? [gitFlowTarget, ...conventionalTargets] : conventionalTargets
  return preferred.find((name) => targets.includes(name)) ?? targets[0] ?? null
}

function parseRemoteLocation(remoteUrl: string): RemoteLocation | null {
  const text = remoteUrl.trim()
  // scp-like syntax, `[user@]host:path`; a one-letter host would be a Windows drive such as `C:\repos`.
  const scpLike = /^(?:[^@/]+@)?([^@/:]{2,}):(?!\/\/)(.+)$/.exec(text)
  if (scpLike && !text.includes('://')) {
    return { webOrigin: `https://${scpLike[1]}`, hostname: scpLike[1], path: trimRepositoryPath(scpLike[2]) }
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  // Built from the host alone, so a user name or token in the URL never ends up in the browser.
  if (url.protocol === 'https:' || url.protocol === 'http:') {
    return { webOrigin: `${url.protocol}//${url.host}`, hostname: url.hostname, path: trimRepositoryPath(url.pathname) }
  }
  if (['ssh:', 'git+ssh:', 'ssh+git:', 'git:'].includes(url.protocol) && url.hostname) {
    // The port belongs to the SSH or git daemon, not to the website.
    return { webOrigin: `https://${url.hostname}`, hostname: url.hostname, path: trimRepositoryPath(url.pathname) }
  }
  return null
}

function trimRepositoryPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '')
}

/**
 * Bitbucket Server and Data Center clone over `[/context]/scm/<project>/<repository>.git` (https) or
 * `<project>/<repository>.git` (SSH); the web pages live at `/projects/<project>/repos/<repository>`,
 * or `/users/<user>/repos/<repository>` for personal repositories (project `~user`).
 */
function bitbucketServerRepository(webOrigin: string, segments: string[]): HostedRepository | null {
  const scm = segments.indexOf('scm')
  const context = scm === -1 ? [] : segments.slice(0, scm)
  const repositorySegments = scm === -1 ? segments : segments.slice(scm + 1)
  if (repositorySegments.length !== 2) return null
  const [project, repository] = repositorySegments
  const owner = project.startsWith('~') ? `users/${project.slice(1)}` : `projects/${project}`
  return { service: 'bitbucket-server', webUrl: [webOrigin, ...context, owner, 'repos', repository].join('/') }
}

/** Branch names go into GitHub's URL path as they are, slashes included. */
function branchPath(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/')
}

function query(parameters: Record<string, string>): string {
  return new URLSearchParams(parameters).toString()
}
