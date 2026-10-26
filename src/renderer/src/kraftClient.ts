import type { CloneApi } from '../../application/cloneApi'
import type { JiraApi } from '../../application/jiraApi'
import type { KraftApi } from '../../application/kraftApi'
import type { RepositoryLibraryApi } from '../../application/repositoryLibraryApi'
import type { UpdateApi } from '../../application/updateApi'
import type { UpdateView } from '../../domain/appUpdate'

export type KraftClient = KraftApi &
  JiraApi &
  RepositoryLibraryApi &
  CloneApi &
  UpdateApi & {
    /** Calls `listener` with every change of the update status; returns a function that stops listening. */
    onAppUpdateChanged(listener: (view: UpdateView) => void): () => void
  }

declare global {
  interface Window {
    kraft: KraftClient
  }
}

/** The main-process API exposed by the preload script. */
export const kraft: KraftClient = window.kraft
