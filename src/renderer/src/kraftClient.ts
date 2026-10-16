import type { JiraApi } from '../../application/jiraApi'
import type { KraftApi } from '../../application/kraftApi'
import type { RepositoryLibraryApi } from '../../application/repositoryLibraryApi'

export type KraftClient = KraftApi & JiraApi & RepositoryLibraryApi

declare global {
  interface Window {
    kraft: KraftClient
  }
}

/** The main-process API exposed by the preload script. */
export const kraft: KraftClient = window.kraft
