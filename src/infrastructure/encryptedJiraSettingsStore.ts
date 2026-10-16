import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { JiraSettingsStore, StoredJiraSettings } from '../application/jiraService'

/** Encrypts secrets at rest, e.g. with Electron's safeStorage (Windows DPAPI, macOS Keychain). */
export interface SecretCipher {
  encrypt(plainText: string): string
  decrypt(cipherText: string): string
}

type JiraSettingsFile = Omit<StoredJiraSettings, 'token'> & { encryptedToken: string }

/** Keeps the Jira connection in a JSON file with the API token encrypted. */
export class EncryptedJiraSettingsStore implements JiraSettingsStore {
  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher
  ) {}

  async load(): Promise<StoredJiraSettings | null> {
    let file: JiraSettingsFile
    try {
      file = JSON.parse(await readFile(this.filePath, 'utf8')) as JiraSettingsFile
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    const { encryptedToken, ...connection } = file
    return {
      ...connection,
      projectKeys: connection.projectKeys ?? [],
      columnFilter: connection.columnFilter ?? null,
      token: this.cipher.decrypt(encryptedToken)
    }
  }

  async save({ token, ...connection }: StoredJiraSettings): Promise<void> {
    const file: JiraSettingsFile = { ...connection, encryptedToken: this.cipher.encrypt(token) }
    await mkdir(dirname(this.filePath), { recursive: true })
    await writeFile(this.filePath, JSON.stringify(file, null, 2))
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true })
  }
}
