import { beforeEach, describe, expect, it } from 'vitest'
import type { PullRequestPage } from '../../src/application/pullRequestOperations'
import { defaultGitFlowConfig } from '../../src/domain/gitFlow'
import { PullRequestPresenter, type PullRequestModel } from '../../src/renderer/src/presenters/pullRequestPresenter'
import { branch, FakeView, repositoryView } from './presenterFakes'

class FakeModel implements PullRequestModel {
  requests: [string, string][] = []
  page: PullRequestPage = { url: 'https://github.com/acme/widgets/compare/main...topic?expand=1', service: 'GitHub', pushed: false }
  failure: Error | null = null

  async createPullRequest(branchName: string, targetBranch: string): Promise<PullRequestPage> {
    this.requests.push([branchName, targetBranch])
    if (this.failure) throw this.failure
    return this.page
  }
}

describe('PullRequestPresenter', () => {
  let model: FakeModel
  let view: FakeView
  let presenter: PullRequestPresenter

  beforeEach(() => {
    model = new FakeModel()
    view = new FakeView()
    presenter = new PullRequestPresenter(model, view)
  })

  const published = repositoryView({
    branches: [branch('main', 'origin/main'), branch('topic', 'origin/topic')],
    remotes: ['origin'],
    remoteBranches: ['origin/main', 'origin/topic', 'origin/release/1.0']
  })

  it('offers pull requests only when the repository has a remote', () => {
    expect(presenter.canCreate(published)).toBe(true)
    expect(presenter.canCreate(repositoryView())).toBe(false)
  })

  it('asks which branch on the same remote to merge into', () => {
    presenter.start(published, 'topic')

    expect(view.choice).toEqual({
      title: 'Create pull request',
      description: 'Opens the page that creates a pull request for topic in your browser.',
      label: 'Merge into',
      options: [
        { value: 'main', label: 'origin/main' },
        { value: 'release/1.0', label: 'origin/release/1.0' }
      ],
      initial: 'main',
      confirmLabel: 'Create pull request'
    })
  })

  it('says when the branch is pushed first, and suggests the git-flow target', () => {
    const repository = repositoryView({
      branches: [branch('feature/login')],
      remotes: ['origin'],
      remoteBranches: ['origin/main', 'origin/develop'],
      gitFlow: { config: defaultGitFlowConfig, branches: [] }
    })

    presenter.start(repository, 'feature/login')

    expect(view.choice?.description).toContain('feature/login is pushed to origin first.')
    expect(view.choice?.initial).toBe('develop')
  })

  it('creates the pull request for the chosen target and opens its page', async () => {
    model.page = { ...model.page, pushed: true }
    presenter.start(repositoryView({ ...published, branches: [branch('topic', 'origin/topic', 2)] }), 'topic')

    await view.choose('release/1.0')

    expect(model.requests).toEqual([['topic', 'release/1.0']])
    expect(view.runs.map((run) => run.label)).toEqual(['Pushing topic'])
    expect(view.opened).toEqual([model.page.url])
    expect(view.notices).toEqual([{ kind: 'info', text: 'Pushed topic and opened GitHub to finish the pull request' }])
  })

  it('does not open anything when creating the pull request fails', async () => {
    model.failure = new Error('rejected: non-fast-forward')
    presenter.start(published, 'topic')

    await view.choose('main')

    expect(view.runs.map((run) => run.label)).toEqual(['Opening pull request'])
    expect(view.opened).toEqual([])
    expect(view.notices).toEqual([{ kind: 'error', text: 'rejected: non-fast-forward' }])
  })

  it('explains instead of asking when there is nothing to merge into', () => {
    presenter.start(repositoryView({ branches: [branch('main', 'origin/main')], remotes: ['origin'], remoteBranches: ['origin/main'] }), 'main')

    expect(view.choice).toBeNull()
    expect(view.notices).toEqual([{ kind: 'error', text: 'origin has no branch that main could be merged into' }])
  })

  it('explains instead of asking when there is no remote', () => {
    presenter.start(repositoryView({ branches: [branch('main')] }), 'main')

    expect(view.choice).toBeNull()
    expect(view.notices).toEqual([{ kind: 'error', text: 'This repository has no remote to open a pull request on' }])
  })
})
