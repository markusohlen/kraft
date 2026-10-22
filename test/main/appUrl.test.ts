import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createAppUrlMatcher } from '../../src/main/appUrl'

describe('createAppUrlMatcher', () => {
  const rendererFile = join(process.cwd(), 'out', 'renderer', 'index.html')

  it('accepts only the bundled renderer page in a packaged build', () => {
    const isAppUrl = createAppUrlMatcher(undefined, rendererFile)

    expect(isAppUrl(pathToFileURL(rendererFile).href)).toBe(true)
    expect(isAppUrl(`${pathToFileURL(rendererFile).href}#settings`)).toBe(true)
    expect(isAppUrl(pathToFileURL(join(process.cwd(), 'evil.html')).href)).toBe(false)
    expect(isAppUrl('https://example.com/')).toBe(false)
    expect(isAppUrl('not a url')).toBe(false)
  })

  it('accepts only the dev server origin in development', () => {
    const isAppUrl = createAppUrlMatcher('http://localhost:5173/', rendererFile)

    expect(isAppUrl('http://localhost:5173/src/main.tsx')).toBe(true)
    expect(isAppUrl('http://localhost:5174/')).toBe(false)
    expect(isAppUrl('https://localhost:5173/')).toBe(false)
    expect(isAppUrl(pathToFileURL(rendererFile).href)).toBe(false)
  })
})
