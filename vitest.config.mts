import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Integration tests create real repositories and run git, which is slow on Windows.
    testTimeout: 30000
  }
})
