import { describe, expect, it } from 'vitest'
import type { Branch } from '../../src/domain/entities'
import { defaultGitFlowConfig } from '../../src/domain/gitFlow'
import {
  defaultPullRequestTarget,
  hostedRepositoryFor,
  pullRequestSource,
  pullRequestTargets,
  pullRequestUrl,
  splitRemoteBranch
} from '../../src/domain/pullRequest'

function branch(name: string, upstream: string | null = null, ahead = 0): Branch {
  return { name, sha: 'abc', isCurrent: false, upstream, ahead, behind: 0 }
}

describe('hosted repositories from remote URLs', () => {
  it('reads GitHub remotes in https, scp-like and ssh form', () => {
    const github = { service: 'github', webUrl: 'https://github.com/acme/widgets' }
    expect(hostedRepositoryFor('https://github.com/acme/widgets.git')).toEqual(github)
    expect(hostedRepositoryFor('https://github.com/acme/widgets/')).toEqual(github)
    expect(hostedRepositoryFor('git@github.com:acme/widgets.git')).toEqual(github)
    expect(hostedRepositoryFor('ssh://git@github.com/acme/widgets.git')).toEqual(github)
  })

  it('maps SSH-over-443 hosts to their websites', () => {
    expect(hostedRepositoryFor('ssh://git@ssh.github.com:443/acme/widgets.git')).toEqual({ service: 'github', webUrl: 'https://github.com/acme/widgets' })
    expect(hostedRepositoryFor('ssh://git@altssh.gitlab.com:443/g/app.git')).toEqual({ service: 'gitlab', webUrl: 'https://gitlab.com/g/app' })
    expect(hostedRepositoryFor('ssh://git@altssh.bitbucket.org:443/t/app.git')).toEqual({ service: 'bitbucket', webUrl: 'https://bitbucket.org/t/app' })
  })

  it('never carries credentials from the remote URL into the web address', () => {
    expect(hostedRepositoryFor('https://x-access-token:secret@github.com/acme/widgets.git')?.webUrl).toBe('https://github.com/acme/widgets')
  })

  it('recognises self-hosted GitHub and GitLab, keeping https ports but not SSH ports', () => {
    expect(hostedRepositoryFor('git@github.example.com:team/app.git')).toEqual({ service: 'github', webUrl: 'https://github.example.com/team/app' })
    expect(hostedRepositoryFor('https://gitlab.example.com:8443/group/sub/app.git')).toEqual({
      service: 'gitlab',
      webUrl: 'https://gitlab.example.com:8443/group/sub/app'
    })
    expect(hostedRepositoryFor('ssh://git@gitlab.example.com:2222/group/app.git')?.webUrl).toBe('https://gitlab.example.com/group/app')
  })

  it('tells Bitbucket Cloud from Bitbucket Server', () => {
    expect(hostedRepositoryFor('git@bitbucket.org:team/app.git')).toEqual({ service: 'bitbucket', webUrl: 'https://bitbucket.org/team/app' })
    expect(hostedRepositoryFor('https://bitbucket.example.com/scm/KRA/app.git')).toEqual({
      service: 'bitbucket-server',
      webUrl: 'https://bitbucket.example.com/projects/KRA/repos/app'
    })
    expect(hostedRepositoryFor('https://bitbucket.example.com/git/scm/~jane/app.git')?.webUrl).toBe(
      'https://bitbucket.example.com/git/users/jane/repos/app'
    )
    expect(hostedRepositoryFor('ssh://git@bitbucket.example.com:7999/kra/app.git')?.webUrl).toBe('https://bitbucket.example.com/projects/kra/repos/app')
  })

  it('reads Azure DevOps remotes, including the SSH and visualstudio.com forms', () => {
    const azure = { service: 'azure-devops', webUrl: 'https://dev.azure.com/acme/Web%20Shop/_git/app' }
    expect(hostedRepositoryFor('https://acme@dev.azure.com/acme/Web%20Shop/_git/app')).toEqual(azure)
    expect(hostedRepositoryFor('git@ssh.dev.azure.com:v3/acme/Web%20Shop/app')).toEqual(azure)
    expect(hostedRepositoryFor('https://acme.visualstudio.com/Shop/_git/app')?.webUrl).toBe('https://acme.visualstudio.com/Shop/_git/app')
    expect(hostedRepositoryFor('acme@vs-ssh.visualstudio.com:v3/acme/Shop/app')?.webUrl).toBe('https://acme.visualstudio.com/Shop/_git/app')
  })

  it('returns null for local paths and unknown hosts', () => {
    expect(hostedRepositoryFor('/srv/git/app.git')).toBeNull()
    expect(hostedRepositoryFor('../app')).toBeNull()
    expect(hostedRepositoryFor('C:\\repos\\app')).toBeNull()
    expect(hostedRepositoryFor('file:///srv/git/app.git')).toBeNull()
    expect(hostedRepositoryFor('git@git.example.com:team/app.git')).toBeNull()
    expect(hostedRepositoryFor('https://github.com/')).toBeNull()
  })
})

describe('pull request pages', () => {
  it('opens GitHub compare with the form expanded, keeping slashes in branch names', () => {
    const repository = { service: 'github', webUrl: 'https://github.com/acme/widgets' } as const
    expect(pullRequestUrl(repository, 'feature/KRA-12 #1', 'develop')).toBe(
      'https://github.com/acme/widgets/compare/develop...feature/KRA-12%20%231?expand=1'
    )
  })

  it('builds the new merge request and pull request pages of the other services', () => {
    expect(pullRequestUrl({ service: 'gitlab', webUrl: 'https://gitlab.com/g/app' }, 'feature/x', 'main')).toBe(
      'https://gitlab.com/g/app/-/merge_requests/new?merge_request%5Bsource_branch%5D=feature%2Fx&merge_request%5Btarget_branch%5D=main'
    )
    expect(pullRequestUrl({ service: 'bitbucket', webUrl: 'https://bitbucket.org/t/app' }, 'feature/x', 'main')).toBe(
      'https://bitbucket.org/t/app/pull-requests/new?source=feature%2Fx&dest=main'
    )
    expect(pullRequestUrl({ service: 'bitbucket-server', webUrl: 'https://bb.example.com/projects/K/repos/app' }, 'feature/x', 'main')).toBe(
      'https://bb.example.com/projects/K/repos/app/pull-requests?create&sourceBranch=refs%2Fheads%2Ffeature%2Fx&targetBranch=refs%2Fheads%2Fmain'
    )
    expect(pullRequestUrl({ service: 'azure-devops', webUrl: 'https://dev.azure.com/a/p/_git/app' }, 'feature/x', 'main')).toBe(
      'https://dev.azure.com/a/p/_git/app/pullrequestcreate?sourceRef=feature%2Fx&targetRef=main'
    )
  })
})

describe('pull request branches', () => {
  const remotes = ['origin', 'team/fork']

  it('splits remote branches on the longest matching remote name', () => {
    expect(splitRemoteBranch('origin/feature/x', remotes)).toEqual({ remote: 'origin', branch: 'feature/x' })
    expect(splitRemoteBranch('team/fork/main', remotes)).toEqual({ remote: 'team/fork', branch: 'main' })
    expect(splitRemoteBranch('elsewhere/main', remotes)).toBeNull()
  })

  it('opens from the upstream, pushing commits it does not have yet', () => {
    const remoteBranches = ['origin/main', 'origin/topic-on-server']
    expect(pullRequestSource(branch('topic', 'origin/topic-on-server'), remotes, remoteBranches)).toEqual({
      remote: 'origin',
      branch: 'topic-on-server',
      push: null
    })
    expect(pullRequestSource(branch('topic', 'origin/topic-on-server', 2), remotes, remoteBranches)?.push).toBe('update')
    // The upstream branch was deleted on the server.
    expect(pullRequestSource(branch('topic', 'origin/gone'), remotes, remoteBranches)).toEqual({ remote: 'origin', branch: 'gone', push: 'update' })
  })

  it('publishes a branch without an upstream to the first remote, as Push does', () => {
    expect(pullRequestSource(branch('topic'), remotes, [])).toEqual({ remote: 'origin', branch: 'topic', push: 'publish' })
    expect(pullRequestSource(branch('topic'), [], [])).toBeNull()
  })

  it('offers the other branches on the same remote as targets', () => {
    const remoteBranches = ['origin/main', 'origin/topic', 'origin/release/1.0', 'team/fork/develop']
    expect(pullRequestTargets({ remote: 'origin', branch: 'topic' }, remotes, remoteBranches)).toEqual(['main', 'release/1.0'])
  })

  it('targets where git-flow would merge the branch', () => {
    const targets = ['main', 'develop']
    expect(defaultPullRequestTarget('feature/login', targets, defaultGitFlowConfig)).toBe('develop')
    expect(defaultPullRequestTarget('hotfix/1.0.1', targets, defaultGitFlowConfig)).toBe('main')
    expect(defaultPullRequestTarget('release/1.1.0', targets, defaultGitFlowConfig)).toBe('main')
    expect(defaultPullRequestTarget('experiment', targets, defaultGitFlowConfig)).toBe('develop')
    expect(defaultPullRequestTarget('develop', ['main'], defaultGitFlowConfig)).toBe('main')
  })

  it('targets the usual main branch without git-flow', () => {
    expect(defaultPullRequestTarget('topic', ['develop', 'master'], null)).toBe('master')
    expect(defaultPullRequestTarget('topic', ['staging'], null)).toBe('staging')
    expect(defaultPullRequestTarget('topic', [], null)).toBeNull()
  })
})
