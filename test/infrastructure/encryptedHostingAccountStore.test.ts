import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { StoredHostingAccount } from '../../src/application/cloneService'
import { EncryptedHostingAccountStore } from '../../src/infrastructure/encryptedHostingAccountStore'
import type { SecretCipher } from '../../src/infrastructure/secretCipher'

const reversingCipher: SecretCipher = {
  encrypt: (plainText) => `enc:${[...plainText].reverse().join('')}`,
  decrypt: (cipherText) => [...cipherText.replace(/^enc:/, '')].reverse().join('')
}

const account: StoredHostingAccount = { provider: 'github', serverUrl: 'https://github.com', username: '', token: 'ghp_secret', userName: 'Ada' }

describe('EncryptedHostingAccountStore', () => {
  let folder: string
  let filePath: string

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'kraft-accounts-'))
    filePath = join(folder, 'nested', 'hosting-accounts.json')
  })

  afterEach(() => rm(folder, { recursive: true, force: true }))

  it('has no accounts before anything is saved', async () => {
    expect(await new EncryptedHostingAccountStore(filePath, reversingCipher).load()).toEqual([])
  })

  it('saves tokens encrypted and reads them back', async () => {
    const store = new EncryptedHostingAccountStore(filePath, reversingCipher)
    await store.save([account])

    expect(await readFile(filePath, 'utf8')).not.toContain('ghp_secret')
    expect(await store.load()).toEqual([account])
  })

  it('skips services it does not know', async () => {
    const store = new EncryptedHostingAccountStore(filePath, reversingCipher)
    await store.save([account])
    const file = JSON.parse(await readFile(filePath, 'utf8'))
    file.accounts.push({ ...file.accounts[0], provider: 'gitea' })
    await writeFile(filePath, JSON.stringify(file))

    expect((await store.load()).map((loaded) => loaded.provider)).toEqual(['github'])
  })
})
