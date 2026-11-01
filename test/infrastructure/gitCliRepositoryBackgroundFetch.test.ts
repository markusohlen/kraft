import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runGit } from '../../src/infrastructure/gitCommand'
import { createTestRepository, type TestRepository } from '../application/gitTestRepository'

describe('fetching without anyone there to answer', () => {
  let test: TestRepository
  let server: Server
  let credentialChallenges = 0

  beforeEach(async () => {
    test = await createTestRepository()
    credentialChallenges = 0
    server = createServer((_request, response) => {
      credentialChallenges++
      response.writeHead(401, { 'WWW-Authenticate': 'Basic realm="kraft-test"' }).end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    await test.git('remote', 'add', 'origin', `http://127.0.0.1:${port}/repository.git`)
    // No helper may answer, whatever this computer has set up.
    await test.git('config', '--local', 'credential.helper', '')
  })

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
    await test.dispose()
  })

  it('fails on a remote that wants credentials instead of waiting for them', async () => {
    await expect(test.repository.fetchInBackground()).rejects.toThrow()

    expect(credentialChallenges).toBeGreaterThan(0)
  })

  it('gives up after the time limit with a clear reason', async () => {
    // A command that outlives its limit; the same path a hung fetch takes.
    await expect(runGit(test.path, ['hash-object', '--stdin'], { timeoutMs: 50 })).rejects.toThrow('did not finish within 0.05 seconds')
  })
})
