import type { RemoteCheckoutResult } from '../../../application/branchOperations'
import type { OperationView } from './operationView'

export interface RemoteBranchModel {
  checkoutRemoteBranch(remoteBranch: string): Promise<RemoteCheckoutResult>
}

/** Presents checking out a remote branch, which fetches it first and brings the local branch up to date. */
export class RemoteBranchPresenter {
  constructor(
    private readonly model: RemoteBranchModel,
    private readonly view: OperationView
  ) {}

  checkout(remoteBranch: string): Promise<void> {
    return this.view.run(`Checking out ${remoteBranch}`, async () => {
      const result = await this.model.checkoutRemoteBranch(remoteBranch)
      const { branch, diverged, fastForwarded, fetchError } = result
      if (fetchError) {
        this.view.notify('error', `Could not fetch ${remoteBranch}, so ${branch} may be missing its newest commits: ${fetchError}`)
      }
      if (diverged) {
        this.view.notify(
          'error',
          `${branch} was not updated: it has ${commits(diverged.local)} that ${remoteBranch} does not, and ${remoteBranch} has ${commits(diverged.remote)} it does not. Merge or rebase to combine them.`
        )
      } else if (fastForwarded > 0) {
        this.view.notify('info', `Updated ${branch} with ${commits(fastForwarded)} from ${remoteBranch}`)
      }
      // Returned so the window can offer to pop an auto-stash.
      return result
    })
  }
}

function commits(count: number): string {
  return `${count} commit${count === 1 ? '' : 's'}`
}
