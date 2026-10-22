import { beforeEach, describe, expect, it } from 'vitest'
import type { SquashPlan, SquashResult } from '../../src/application/squashOperations'
import {
  SquashPresenter,
  type SquashMessageRequest,
  type SquashModel,
  type SquashView
} from '../../src/renderer/src/presenters/squashPresenter'
import { FakeView } from './presenterFakes'

class FakeModel implements SquashModel {
  plan: SquashPlan = { branch: 'feature/login', count: 2, message: 'Add form\n\nValidate', pushedTo: null }
  planFailure: Error | null = null
  squashed: { shas: string[]; message: string }[] = []

  async squashPlan(): Promise<SquashPlan> {
    if (this.planFailure) throw this.planFailure
    return this.plan
  }

  async squashCommits(shas: string[], message: string): Promise<SquashResult> {
    this.squashed.push({ shas, message })
    return { sha: '9f8e7d6c5b', stashMessage: null }
  }
}

class FakeSquashView extends FakeView implements SquashView {
  request: SquashMessageRequest | null = null
  selected: string[] = []
  private onSubmit: ((message: string) => void) | null = null

  askMessage(request: SquashMessageRequest, onSubmit: (message: string) => void): void {
    this.request = request
    this.onSubmit = onSubmit
  }

  selectCommit(sha: string): void {
    this.selected.push(sha)
  }

  /** Confirms the open message dialog like the user would, and waits for the squash it starts. */
  async confirm(message: string): Promise<void> {
    if (!this.onSubmit) throw new Error('No message dialog is open')
    this.onSubmit(message)
    await new Promise((resolve) => setTimeout(resolve))
  }
}

describe('SquashPresenter', () => {
  let model: FakeModel
  let view: FakeSquashView
  let presenter: SquashPresenter

  beforeEach(() => {
    model = new FakeModel()
    view = new FakeSquashView()
    presenter = new SquashPresenter(model, view)
  })

  it('offers squashing for two or more commits', () => {
    expect(presenter.canSquash(['a'])).toBe(false)
    expect(presenter.canSquash(['a', 'b'])).toBe(true)
  })

  it('asks for the message, starting from the combined messages', async () => {
    await presenter.start(['b', 'a'])

    expect(view.request).toEqual({
      title: 'Squash 2 commits',
      description: "They become one commit on feature/login, keeping the oldest commit's author.",
      initialMessage: 'Add form\n\nValidate',
      confirmLabel: 'Squash 2 commits',
      danger: false
    })
  })

  it('squashes with the edited message, selects the new commit and says so', async () => {
    await presenter.start(['b', 'a'])
    await view.confirm('Add login form')

    expect(model.squashed).toEqual([{ shas: ['b', 'a'], message: 'Add login form' }])
    expect(view.runs).toEqual([{ label: 'Squashing 2 commits', successText: undefined }])
    expect(view.selected).toEqual(['9f8e7d6c5b'])
    expect(view.notices).toEqual([{ kind: 'info', text: 'Squashed 2 commits into 9f8e7d6' }])
  })

  it('warns that pushed commits need a force-push', async () => {
    model.plan = { ...model.plan, pushedTo: 'origin/feature/login' }

    await presenter.start(['b', 'a'])

    expect(view.request?.danger).toBe(true)
    expect(view.request?.description).toBe(
      'Some of these commits are already on origin/feature/login. Squashing rewrites them, so feature/login will need a force-push.'
    )
  })

  it('explains a selection that cannot be squashed instead of asking for a message', async () => {
    model.planFailure = new Error('Only consecutive commits can be squashed; the selection skips commits on the branch')

    await presenter.start(['c', 'a'])

    expect(view.request).toBeNull()
    expect(view.notices).toEqual([
      { kind: 'error', text: 'Only consecutive commits can be squashed; the selection skips commits on the branch' }
    ])
  })
})
