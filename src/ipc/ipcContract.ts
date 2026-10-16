import type { JiraMethod } from '../application/jiraApi'
import type { KraftMethod } from '../application/kraftApi'
import type { RepositoryLibraryMethod } from '../application/repositoryLibraryApi'

/**
 * Errors are returned as values because Electron rewrites messages of errors thrown
 * across `ipcMain.handle` ("Error invoking remote method ..."), hiding git's own text.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function channelFor(method: KraftMethod | JiraMethod | RepositoryLibraryMethod): string {
  return `kraft:${method}`
}
