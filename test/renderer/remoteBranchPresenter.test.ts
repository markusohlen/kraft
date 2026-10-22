import { beforeEach, describe, expect, it } from 'vitest'
import type { RemoteCheckoutResult } from '../../src/application/branchOperations'
import { RemoteBranchPresenter, type RemoteBranchModel } from '../../src/renderer/src/presenters/remoteBranchPresenter'
import { FakeView } from './presenterFakes'

const checkedOut: RemoteCheckoutResult = { branch: 'shared', stashMessage: null, fastForwarded: 0, diverged: null, fetchError: null }

class FakeModel implements RemoteBranchModel {
  requests: string[] = []
  result = checkedOut

  async checkoutRemoteBranch(remoteBranch: string): Promise<RemoteCheckoutResult> {
    this.requests.push(remoteBranch)
    return this.result
  }
}

describe('RemoteBranchPresenter', () => {
  let model: FakeModel
  let view: FakeView
  let presenter: RemoteBranchPresenter

  beforeEach(() => {
    model = new FakeModel()
    view = new FakeView()
    presenter = new RemoteBranchPresenter(model, view)
  })

  it('checks out quietly when there was nothing new', async () => {
    await presenter.checkout('origin/shared')

    expect(model.requests).toEqual(['origin/shared'])
    expect(view.runs.map((run) => run.label)).toEqual(['Checking out origin/shared'])
    expect(view.notices).toEqual([])
  })

  it('tells how many commits the local branch was updated with', async () => {
    model.result = { ...checkedOut, fastForwarded: 1 }
    await presenter.checkout('origin/shared')
    model.result = { ...checkedOut, fastForwarded: 3 }
    await presenter.checkout('origin/shared')

    expect(view.notices).toEqual([
      { kind: 'info', text: 'Updated shared with 1 commit from origin/shared' },
      { kind: 'info', text: 'Updated shared with 3 commits from origin/shared' }
    ])
  })

  it('explains why a diverged branch was not updated', async () => {
    model.result = { ...checkedOut, diverged: { local: 2, remote: 1 } }

    await presenter.checkout('origin/shared')

    expect(view.notices).toEqual([
      {
        kind: 'error',
        text: 'shared was not updated: it has 2 commits that origin/shared does not, and origin/shared has 1 commit it does not. Merge or rebase to combine them.'
      }
    ])
  })

  it('warns when fetching failed', async () => {
    model.result = { ...checkedOut, fetchError: 'fatal: Could not read from remote repository.' }

    await presenter.checkout('origin/shared')

    expect(view.notices).toEqual([
      {
        kind: 'error',
        text: 'Could not fetch origin/shared, so shared may be missing its newest commits: fatal: Could not read from remote repository.'
      }
    ])
  })
})
