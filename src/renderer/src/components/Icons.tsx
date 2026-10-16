/** Small line icons drawn in the current text color, so they follow each tab's color. */

export function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      {open ? (
        <>
          <path d="M1.5 12.5v-9a1 1 0 0 1 1-1h3.3l1.4 1.5h5.3a1 1 0 0 1 1 1V6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M1.5 12.5 3.6 6.5h11.2l-2.1 6z" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </>
      ) : (
        <path
          d="M1.5 3.5a1 1 0 0 1 1-1h3.3l1.4 1.5h6.3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"
          fill="currentColor"
          fillOpacity="0.35"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** A laptop: the branch exists on this computer. */
export function LocalIcon() {
  return (
    <svg className="pill-svg" viewBox="0 0 16 16" aria-label="Local branch">
      <path d="M3 4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v6H3z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M1.5 12h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

/** A cloud: the branch exists on a remote. */
export function RemoteIcon() {
  return (
    <svg className="pill-svg" viewBox="0 0 16 16" aria-label="On the remote">
      <path
        d="M4.5 12.5a3 3 0 0 1-.4-6 4 4 0 0 1 7.7-.9 3.4 3.4 0 0 1 .4 6.9z"
        fill="currentColor"
        fillOpacity="0.35"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** A book with a bookmark, the usual symbol for a repository. */
export function RepositoryIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 12.5V3a1 1 0 0 1 1-1h8v9.5h-8a1 1 0 0 0 0 2h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 2v4.5l1.25-.9 1.25.9V2z" fill="currentColor" />
    </svg>
  )
}
