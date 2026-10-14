import type { KraftApi } from '../../application/kraftApi'

declare global {
  interface Window {
    kraft: KraftApi
  }
}

/** The main-process API exposed by the preload script. */
export const kraft: KraftApi = window.kraft
