import type { UpdateView } from '../domain/appUpdate'

/** Kraft updating itself from its GitHub releases. */
export interface UpdateApi {
  appUpdate(): Promise<UpdateView>
  /** Checks for a newer release and, if there is one, starts downloading it. */
  checkForUpdates(): Promise<UpdateView>
  /** Restarts Kraft into the downloaded update. */
  installUpdate(): Promise<void>
}

export type UpdateMethod = keyof UpdateApi

export const updateMethods: readonly UpdateMethod[] = ['appUpdate', 'checkForUpdates', 'installUpdate']

/** The channel on which the main process tells the page about every change of the update status. */
export const updateStatusChannel = 'kraft:appUpdateChanged'
