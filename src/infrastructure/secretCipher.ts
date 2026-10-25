/** Encrypts secrets at rest, e.g. with Electron's safeStorage (Windows DPAPI, macOS Keychain). */
export interface SecretCipher {
  encrypt(plainText: string): string
  decrypt(cipherText: string): string
}

/** Applied when a file holding secrets is created; on Windows the per-user profile folder already restricts access. */
export const ownerReadWrite = 0o600
