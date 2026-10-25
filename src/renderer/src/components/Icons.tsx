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

/** A globe: cloning from any address. */
export function GlobeIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 8h13M8 1.5c-3.4 3.6-3.4 9.4 0 13M8 1.5c3.4 3.6 3.4 9.4 0 13" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

/** Simplified marks of the hosting services, drawn in the current text color like the other icons. */
export function GitHubIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M8 .5a7.5 7.5 0 1 0 0 15A7.5 7.5 0 0 0 8 .5zM4.6 7.4c0-.8.3-1.5.8-2l-.1-1.9 1.6.9a4 4 0 0 1 2.2 0l1.6-.9-.1 1.9c.5.5.8 1.2.8 2 0 2-1.4 2.7-2.6 2.9.3.3.5.7.5 1.3v3.6H6.7v-3.6c0-.6.2-1 .5-1.3-1.2-.2-2.6-.9-2.6-2.9z"
      />
    </svg>
  )
}

export function GitLabIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 14.6 1.2 9.6l1.4-7.4 1.8 4.7h7.2l1.8-4.7 1.4 7.4z" fill="currentColor" strokeLinejoin="round" />
    </svg>
  )
}

export function BitbucketIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M1.5 2h13l-1.9 11.4a.8.8 0 0 1-.8.6H4.2a.8.8 0 0 1-.8-.6zm4.8 4.2.6 3.6h2.2l.6-3.6z"
      />
    </svg>
  )
}

export function AzureDevOpsIcon() {
  return (
    <svg className="tab-icon" viewBox="0 0 16 16" aria-hidden="true">
      <path fill="currentColor" d="M15 3.5V12l-3.5 3-5.5-2v2L3 11l9 .7V4.2zM11.5 3.2 6.6.9v1.8L2 4 1 5.4v4.3l1.8.7V5.3z" />
    </svg>
  )
}
