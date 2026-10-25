import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { HostingAccountStore, StoredHostingAccount } from '../application/cloneService'
import { hostingProviders } from '../domain/hostingProvider'
import { ownerReadWrite, type SecretCipher } from './secretCipher'

type AccountRecord = Omit<StoredHostingAccount, 'token'> & { encryptedToken: string }

interface AccountsFile {
  accounts: AccountRecord[]
}

/** Keeps the hosting-service accounts in a JSON file with each access token encrypted. */
export class EncryptedHostingAccountStore implements HostingAccountStore {
  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher
  ) {}

  async load(): Promise<StoredHostingAccount[]> {
    let file: AccountsFile
    try {
      file = JSON.parse(await readFile(this.filePath, 'utf8')) as AccountsFile
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    // A provider a newer version of Kraft knows about is skipped rather than shown wrongly.
    return (file.accounts ?? [])
      .filter((record) => hostingProviders.includes(record.provider))
      .map(({ encryptedToken, ...account }) => ({ ...account, token: this.cipher.decrypt(encryptedToken) }))
  }

  async save(accounts: StoredHostingAccount[]): Promise<void> {
    const file: AccountsFile = {
      accounts: accounts.map(({ token, ...account }) => ({ ...account, encryptedToken: this.cipher.encrypt(token) }))
    }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(file, null, 2), { mode: ownerReadWrite })
  }
}
