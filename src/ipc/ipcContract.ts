import type { KraftMethod } from '../application/kraftApi'

/**
 * Errors are returned as values because Electron rewrites messages of errors thrown
 * across `ipcMain.handle` ("Error invoking remote method ..."), hiding git's own text.
 */
export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

export function channelFor(method: KraftMethod): string {
  return `kraft:${method}`
}
