import type { RepositoryView } from '../../src/application/kraftApi'
import type { Branch, Commit } from '../../src/domain/entities'
import type { PullRequestView, TargetChoice } from '../../src/renderer/src/presenters/pullRequestPresenter'

/** Records what presenters show; `run` behaves like the window's: errors become error notices. */
export class FakeView implements PullRequestView {
  runs: { label: string; successText?: string }[] = []
  notices: { kind: 'info' | 'error'; text: string }[] = []
  opened: string[] = []
  choice: TargetChoice | null = null
  private onChoose: ((target: string) => void) | null = null
  private lastRun: Promise<void> = Promise.resolve()

  run(label: string, operation: () => Promise<unknown>, successText?: string): Promise<void> {
    this.runs.push({ label, successText })
    this.lastRun = (async () => {
      try {
        await operation()
        if (successText) this.notify('info', successText)
      } catch (error) {
        this.notify('error', error instanceof Error ? error.message : String(error))
      }
    })()
    return this.lastRun
  }

  notify(kind: 'info' | 'error', text: string): void {
    this.notices.push({ kind, text })
  }

  chooseTarget(choice: TargetChoice, onChoose: (target: string) => void): void {
    this.choice = choice
    this.onChoose = onChoose
  }

  openInBrowser(url: string): void {
    this.opened.push(url)
  }

  /** Answers the open target choice like the user would, and waits for what it starts. */
  async choose(target: string): Promise<void> {
    if (!this.onChoose) throw new Error('No target choice is open')
    this.onChoose(target)
    await this.lastRun
  }
}

export function repositoryView(overrides: Partial<RepositoryView> = {}): RepositoryView {
  return {
    path: '/repos/widgets',
    name: 'widgets',
    currentBranch: 'main',
    graph: { rows: [], laneCount: 0 },
    branches: [],
    remoteBranches: [],
    remotes: [],
    tags: [],
    stashes: [],
    status: { staged: [], unstaged: [] },
    gitFlow: null,
    ...overrides
  }
}

export function branch(name: string, upstream: string | null = null, ahead = 0): Branch {
  return { name, sha: 'abc', isCurrent: false, upstream, ahead, behind: 0 }
}

export function commit(sha: string, refs: Commit['refs'] = []): Commit {
  return { sha, parents: [], authorName: 'Ada', authorEmail: 'ada@example.com', date: '2026-10-16T08:00:00Z', subject: 'Fix bug', refs }
}
