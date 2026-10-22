import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Decides whether a URL is Kraft's own page: the dev server's origin in development, the bundled
 * renderer file otherwise. Used to refuse navigation away from the app and IPC from any other page.
 */
export function createAppUrlMatcher(devServerUrl: string | undefined, rendererFile: string): (url: string) => boolean {
  if (devServerUrl) {
    const devOrigin = new URL(devServerUrl).origin
    return (url) => parse(url)?.origin === devOrigin
  }
  const expectedPath = comparablePath(rendererFile)
  return (url) => {
    const parsed = parse(url)
    return parsed?.protocol === 'file:' && comparablePath(fileURLToPath(parsed)) === expectedPath
  }
}

function parse(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/** Windows paths are case-insensitive, and Electron may report the drive letter in either case. */
function comparablePath(path: string): string {
  const absolute = resolve(path)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}
