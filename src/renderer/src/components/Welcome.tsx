import { useEffect, useState } from 'react'
import { kraft } from '../kraftClient'
import type { RepositoryController } from '../useRepositoryController'

export function Welcome({ controller }: { controller: RepositoryController }) {
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    kraft.recentRepositories().then(setRecent, (error: Error) => controller.notify('error', error.message))
  }, [controller.notify])

  const chooseFolder = async () => {
    const folder = await kraft.chooseRepositoryFolder()
    if (folder) await controller.openRepository(folder)
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>
          <span className="logo-mark">◆</span> Kraft
        </h1>
        <p className="muted">A Git client with a commit graph, auto-stash and Gitflow.</p>
        <button className="primary large" onClick={() => void chooseFolder()}>
          Open a repository
        </button>
        {recent.length > 0 && (
          <div className="recent">
            <h2>Recent repositories</h2>
            {recent.map((path) => (
              <button key={path} className="recent-item" onClick={() => void controller.openRepository(path)}>
                <span className="recent-name">{path.split(/[\\/]/).pop()}</span>
                <span className="recent-path">{path}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
