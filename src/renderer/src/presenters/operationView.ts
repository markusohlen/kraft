/**
 * What every presenter can ask of the window. The React side implements it; presenters never touch
 * React, the DOM or the main-process API directly, so they can be tested with a fake view.
 */
export interface OperationView {
  /**
   * Runs a repository operation behind the busy indicator. Failures are shown as errors, auto-stash
   * results get a notice, and the repository is refreshed afterwards either way.
   */
  run(label: string, operation: () => Promise<unknown>, successText?: string): Promise<void>
  notify(kind: 'info' | 'error', text: string): void
}
