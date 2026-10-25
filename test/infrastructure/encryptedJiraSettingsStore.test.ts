import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EncryptedJiraSettingsStore } from '../../src/infrastructure/encryptedJiraSettingsStore'
import type { SecretCipher } from '../../src/infrastructure/secretCipher'

const reversingCipher: SecretCipher = {
  encrypt: (plainText) => `enc:${[...plainText].reverse().join('')}`,
  decrypt: (cipherText) => [...cipherText.replace(/^enc:/, '')].reverse().join('')
}

const settings = {
  deployment: 'cloud' as const,
  baseUrl: 'https://x.atlassian.net',
  email: 'ada@example.com',
  projectKeys: ['KRA'],
  columnFilter: { boardId: 7, boardName: 'KRA board', columns: ['In Progress'] },
  userName: 'Ada',
  token: 'secret-token'
}

describe('EncryptedJiraSettingsStore', () => {
  let directory: string
  let filePath: string

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'kraft-jira-'))
    filePath = join(directory, 'nested', 'jira.json')
  })

  afterEach(() => rm(directory, { recursive: true, force: true }))

  it('round-trips the settings and never writes the token in plain text', async () => {
    const store = new EncryptedJiraSettingsStore(filePath, reversingCipher)
    await store.save(settings)

    expect(await readFile(filePath, 'utf8')).not.toContain('secret-token')
    expect(await store.load()).toEqual(settings)
  })

  it('has no settings before saving and after clearing', async () => {
    const store = new EncryptedJiraSettingsStore(filePath, reversingCipher)
    expect(await store.load()).toBeNull()

    await store.save(settings)
    await store.clear()
    expect(await store.load()).toBeNull()
  })
})
