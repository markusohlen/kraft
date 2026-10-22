import type { SquashPlan, SquashResult } from '../../../application/squashOperations'
import { shortSha } from '../format'
import type { OperationView } from './operationView'

export interface SquashModel {
  squashPlan(shas: string[]): Promise<SquashPlan>
  squashCommits(shas: string[], message: string): Promise<SquashResult>
}

export interface SquashMessageRequest {
  title: string
  description: string
  initialMessage: string
  confirmLabel: string
  /** Set when the squash rewrites commits that were already pushed. */
  danger: boolean
}

export interface SquashView extends OperationView {
  /** Shows the combined message for editing; `onSubmit` gets it once the user confirms. */
  askMessage(request: SquashMessageRequest, onSubmit: (message: string) => void): void
  selectCommit(sha: string): void
}

/** Presents squashing commits selected in the graph into one commit. */
export class SquashPresenter {
  constructor(
    private readonly model: SquashModel,
    private readonly view: SquashView
  ) {}

  canSquash(shas: readonly string[]): boolean {
    return shas.length >= 2
  }

  /** Checks the selection first, so a squash that cannot work is explained before any message is written. */
  async start(shas: string[]): Promise<void> {
    let plan: SquashPlan
    try {
      plan = await this.model.squashPlan(shas)
    } catch (error) {
      this.view.notify('error', error instanceof Error ? error.message : String(error))
      return
    }
    const label = `Squash ${plan.count} commits`
    this.view.askMessage(
      {
        title: label,
        description: plan.pushedTo
          ? `Some of these commits are already on ${plan.pushedTo}. Squashing rewrites them, so ${plan.branch} will need a force-push.`
          : `They become one commit on ${plan.branch}, keeping the oldest commit's author.`,
        initialMessage: plan.message,
        confirmLabel: label,
        danger: plan.pushedTo !== null
      },
      (message) => void this.squash(shas, plan.count, message)
    )
  }

  private squash(shas: string[], count: number, message: string): Promise<void> {
    return this.view.run(`Squashing ${count} commits`, async () => {
      const result = await this.model.squashCommits(shas, message)
      this.view.selectCommit(result.sha)
      this.view.notify('info', `Squashed ${count} commits into ${shortSha(result.sha)}`)
      return result
    })
  }
}
