import { allRepositories } from '../../../domain/repositoryLibrary'
import { openOtherRepository, scanFolderForRepositories } from '../libraryActions'
import type { RepositoryController } from '../useRepositoryController'
import { FolderIcon, RepositoryIcon } from './Icons'

export function Welcome({ controller }: { controller: RepositoryController }) {
  const { library } = controller
  const repositories = allRepositories(library)
  const folderName = (folderId: string | null) =>
    library.entries.find((entry) => entry.kind === 'folder' && entry.id === folderId)?.name

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>
          <span className="logo-mark">◆</span> Kraft
        </h1>
        <p className="muted">A Git client with a commit graph, auto-stash and Gitflow.</p>
        <div className="welcome-actions">
          <button className="primary large" onClick={() => void openOtherRepository(controller)}>
            Open a repository
          </button>
          <button className="secondary large" onClick={() => void scanFolderForRepositories(controller)}>
            Scan a folder for repositories
          </button>
        </div>
        {repositories.length > 0 && (
          <div className="recent">
            <h2>Saved repositories</h2>
            {repositories.map((repository) => (
              <button key={repository.path} className="recent-item" onClick={() => void controller.openRepository(repository.path)}>
                <span className="recent-name">
                  {repository.folderId && (
                    <span className="recent-folder">
                      <FolderIcon />
                      {folderName(repository.folderId)} /
                    </span>
                  )}
                  <RepositoryIcon />
                  {repository.name}
                </span>
                <span className="recent-path">{repository.path}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
