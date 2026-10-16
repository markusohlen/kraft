import { useCallback, useEffect, useState } from 'react'

/** `gravatar` means profile pictures: Gravatar, or GitHub for GitHub no-reply addresses. Kept as the stored value. */
export type AvatarStyle = 'initials' | 'gravatar'

export const avatarStyles: readonly AvatarStyle[] = ['initials', 'gravatar']

/** One size for every avatar, large enough for the commit panel on high-DPI screens, so each image is fetched once. */
const avatarSize = 64

/**
 * GitHub's no-reply addresses: `12345+name@users.noreply.github.com`, or `name@users.noreply.github.com`
 * for accounts made before 2017. Commits made on github.com use them, and they never have a Gravatar.
 */
const githubNoReplyAddress = /^(?:(\d+)\+)?([a-z\d](?:[a-z\d-]*[a-z\d])?)@users\.noreply\.github\.com$/i

/** The GitHub account picture for a GitHub no-reply address, or null for any other address. */
export function githubAvatarUrl(email: string): string | null {
  const match = githubNoReplyAddress.exec(email.trim())
  if (!match) return null
  const [, userId, userName] = match
  return userId
    ? `https://avatars.githubusercontent.com/u/${userId}?s=${avatarSize}`
    : `https://github.com/${userName}.png?size=${avatarSize}`
}

/** The picture to try for an author: their GitHub account for no-reply addresses, otherwise their Gravatar. */
export async function profilePictureUrl(email: string): Promise<string> {
  return githubAvatarUrl(email) ?? gravatarUrl(email)
}

/**
 * The Gravatar image for an email, identified by the SHA-256 hash Gravatar expects rather than
 * the address itself. `d=404` makes unknown emails fail, so they keep their initials.
 */
export async function gravatarUrl(email: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `https://www.gravatar.com/avatar/${hash}?s=${avatarSize}&d=404`
}

/** Shared by every avatar on screen, so rows scrolling in and out don't hash or fetch again. */
const urlsByEmail = new Map<string, string>()
/** Images that failed (no picture for that email, or offline); they stay initials for this session. */
const failedUrls = new Set<string>()

/** The profile picture to show for an author, or null to show initials. */
export function useProfilePicture(email: string, style: AvatarStyle): { url: string | null; onError: () => void } {
  const key = email.trim().toLowerCase()
  const enabled = style === 'gravatar' && key !== ''
  const [url, setUrl] = useState<string | null>(() => (enabled ? usable(urlsByEmail.get(key)) : null))

  useEffect(() => {
    if (!enabled) {
      setUrl(null)
      return
    }
    const cached = urlsByEmail.get(key)
    if (cached) {
      setUrl(usable(cached))
      return
    }
    let current = true
    profilePictureUrl(key).then(
      (computed) => {
        urlsByEmail.set(key, computed)
        if (current) setUrl(usable(computed))
      },
      // Without Web Crypto there is no hash to look up; initials still work.
      () => current && setUrl(null)
    )
    return () => {
      current = false
    }
  }, [key, enabled])

  const onError = useCallback(() => {
    if (url) failedUrls.add(url)
    setUrl(null)
  }, [url])

  return { url, onError }
}

function usable(url: string | undefined): string | null {
  return url && !failedUrls.has(url) ? url : null
}
