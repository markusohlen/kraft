/** Where Kraft is in updating itself to the newest release. */
export type UpdateStatus =
  /** This copy of Kraft cannot update itself, e.g. while developing or on an unsigned macOS build. */
  | { kind: 'unsupported'; reason: string }
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'downloading'; version: string; percent: number }
  /** Downloaded; installed when Kraft restarts or quits. */
  | { kind: 'ready'; version: string }
  | { kind: 'failed'; message: string }

export interface UpdateView {
  currentVersion: string
  status: UpdateStatus
}

/** While an update is on its way or waiting to be installed, checking again would only start over. */
export function isUpdateUnderway(status: UpdateStatus): boolean {
  return status.kind === 'checking' || status.kind === 'downloading' || status.kind === 'ready'
}
