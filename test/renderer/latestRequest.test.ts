import { describe, expect, it } from 'vitest'
import { LatestRequest } from '../../src/renderer/src/latestRequest'

describe('LatestRequest', () => {
  it('wants the answer of the only request', () => {
    expect(new LatestRequest().begin()()).toBe(true)
  })

  it('no longer wants an answer once a newer request started', () => {
    const requests = new LatestRequest()
    const first = requests.begin()
    const second = requests.begin()

    expect(first()).toBe(false)
    expect(second()).toBe(true)
  })

  it('wants no answers after being invalidated', () => {
    const requests = new LatestRequest()
    const running = requests.begin()

    requests.invalidate()

    expect(running()).toBe(false)
    expect(requests.begin()()).toBe(true)
  })
})
