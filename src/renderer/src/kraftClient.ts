import type { CloneApi } from '../../application/cloneApi'
import type { JiraApi } from '../../application/jiraApi'
import type { KraftApi } from '../../application/kraftApi'
import type { RepositoryLibraryApi } from '../../application/repositoryLibraryApi'

export type KraftClient = KraftApi & JiraApi & RepositoryLibraryApi & CloneApi

declare global {
  interface Window {
    kraft: KraftClient
  }
}

/** The main-process API exposed by the preload script. */
export const kraft: KraftClient = window.kraft
