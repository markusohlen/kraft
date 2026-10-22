import type { AutoStashResult } from '../../../application/autoStash'
import type { RepositoryView } from '../../../application/kraftApi'
import type { Commit } from '../../../domain/entities'
import { shortSha } from '../format'
import type { OperationView } from './operationView'

export interface CherryPickModel {
  cherryPick(sha: string): Promise<AutoStashResult>
}

/** Presents cherry-picking a commit from the graph onto the checked-out branch. */
export class CherryPickPresenter {
  constructor(
    private readonly model: CherryPickModel,
    private readonly view: OperationView
  ) {}

  /** The checked-out commit is left out: cherry-picking it onto itself would change nothing. */
  canCherryPick(commit: Commit): boolean {
    return !commit.refs.some((ref) => ref.kind === 'head')
  }

  cherryPick(repository: RepositoryView, commit: Commit): Promise<void> {
    const onto = repository.currentBranch ?? 'HEAD'
    return this.view.run('Cherry-picking', () => this.model.cherryPick(commit.sha), `Cherry-picked ${shortSha(commit.sha)} onto ${onto}`)
  }
}
