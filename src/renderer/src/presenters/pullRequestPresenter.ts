import type { RepositoryView } from '../../../application/kraftApi'
import type { PullRequestPage } from '../../../application/pullRequestOperations'
import { defaultPullRequestTarget, pullRequestSource, pullRequestTargets, type PullRequestSource } from '../../../domain/pullRequest'
import type { OperationView } from './operationView'

export interface PullRequestModel {
  createPullRequest(branch: string, targetBranch: string): Promise<PullRequestPage>
}

/** The question the view asks before a pull request is created. */
export interface TargetChoice {
  title: string
  description: string
  label: string
  options: { value: string; label: string }[]
  initial: string
  confirmLabel: string
}

export interface PullRequestView extends OperationView {
  /** Asks which branch the pull request merges into; `onChoose` gets the answer unless the user cancels. */
  chooseTarget(choice: TargetChoice, onChoose: (target: string) => void): void
  openInBrowser(url: string): void
}

/**
 * Presents creating a pull request for a local branch: the user picks the branch to merge into, the
 * branch is pushed if the remote lacks some of it, and the hosting service's page opens in the browser.
 */
export class PullRequestPresenter {
  constructor(
    private readonly model: PullRequestModel,
    private readonly view: PullRequestView
  ) {}

  canCreate(repository: RepositoryView): boolean {
    return repository.remotes.length > 0
  }

  start(repository: RepositoryView, branchName: string): void {
    const branch = repository.branches.find((candidate) => candidate.name === branchName)
    if (!branch) return
    const source = pullRequestSource(branch, repository.remotes, repository.remoteBranches)
    if (!source) {
      this.view.notify('error', 'This repository has no remote to open a pull request on')
      return
    }
    const targets = pullRequestTargets(source, repository.remotes, repository.remoteBranches)
    if (targets.length === 0) {
      this.view.notify('error', `${source.remote} has no branch that ${branchName} could be merged into`)
      return
    }
    this.view.chooseTarget(
      {
        title: 'Create pull request',
        description:
          `Opens the page that creates a pull request for ${branchName} in your browser.` +
          (source.push ? ` ${branchName} is pushed to ${source.remote} first.` : ''),
        label: 'Merge into',
        options: targets.map((target) => ({ value: target, label: `${source.remote}/${target}` })),
        initial: defaultPullRequestTarget(branchName, targets, repository.gitFlow?.config ?? null) ?? targets[0],
        confirmLabel: 'Create pull request'
      },
      (target) => void this.create(branchName, target, source)
    )
  }

  private create(branchName: string, target: string, source: PullRequestSource): Promise<void> {
    return this.view.run(source.push ? `Pushing ${branchName}` : 'Opening pull request', async () => {
      const page = await this.model.createPullRequest(branchName, target)
      this.view.openInBrowser(page.url)
      this.view.notify('info', `${page.pushed ? `Pushed ${branchName} and opened` : 'Opened'} ${page.service} to finish the pull request`)
    })
  }
}
