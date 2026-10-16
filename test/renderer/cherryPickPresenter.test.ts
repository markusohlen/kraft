import { beforeEach, describe, expect, it } from 'vitest'
import type { AutoStashResult } from '../../src/application/autoStash'
import { CherryPickPresenter, type CherryPickModel } from '../../src/renderer/src/presenters/cherryPickPresenter'
import { commit, FakeView, repositoryView } from './presenterFakes'

class FakeModel implements CherryPickModel {
  picked: string[] = []
  failure: Error | null = null

  async cherryPick(sha: string): Promise<AutoStashResult> {
    this.picked.push(sha)
    if (this.failure) throw this.failure
    return { stashMessage: null }
  }
}

describe('CherryPickPresenter', () => {
  let model: FakeModel
  let view: FakeView
  let presenter: CherryPickPresenter

  beforeEach(() => {
    model = new FakeModel()
    view = new FakeView()
    presenter = new CherryPickPresenter(model, view)
  })

  it('offers every commit except the checked-out one', () => {
    expect(presenter.canCherryPick(commit('1a2b3c4d5e', [{ name: 'other', kind: 'local' }]))).toBe(true)
    expect(presenter.canCherryPick(commit('1a2b3c4d5e', [{ name: 'main', kind: 'head' }]))).toBe(false)
    expect(presenter.canCherryPick(commit('1a2b3c4d5e', [{ name: 'HEAD', kind: 'head' }]))).toBe(false)
  })

  it('cherry-picks the commit onto the current branch', async () => {
    await presenter.cherryPick(repositoryView(), commit('1a2b3c4d5e'))

    expect(model.picked).toEqual(['1a2b3c4d5e'])
    expect(view.runs).toEqual([{ label: 'Cherry-picking', successText: 'Cherry-picked 1a2b3c4 onto main' }])
    expect(view.notices).toEqual([{ kind: 'info', text: 'Cherry-picked 1a2b3c4 onto main' }])
  })

  it('names HEAD when no branch is checked out', async () => {
    await presenter.cherryPick(repositoryView({ currentBranch: null }), commit('1a2b3c4d5e'))

    expect(view.runs[0].successText).toBe('Cherry-picked 1a2b3c4 onto HEAD')
  })

  it('shows why a cherry-pick failed', async () => {
    model.failure = new Error('The changes in 1a2b3c4 are already on main')

    await presenter.cherryPick(repositoryView(), commit('1a2b3c4d5e'))

    expect(view.notices).toEqual([{ kind: 'error', text: 'The changes in 1a2b3c4 are already on main' }])
  })
})
