import { execFile } from 'node:child_process'

export interface GitCommandResult {
  stdout: string
  exitCode: number
}

export interface GitCommandOptions {
  /** Exit codes besides 0 that are an answer rather than a failure (e.g. 1 from `show-ref --verify`). */
  acceptedExitCodes?: number[]
}

const maxOutputBytes = 512 * 1024 * 1024

const gitEnvironment: NodeJS.ProcessEnv = {
  ...process.env,
  // Never block on a terminal prompt; credential helpers (e.g. Git Credential Manager) still work.
  GIT_TERMINAL_PROMPT: '0',
  // Read-only commands like `status` must not take index.lock while other commands run in parallel.
  GIT_OPTIONAL_LOCKS: '0',
  // Merges, rebases and tags get their messages from arguments; never open an editor.
  GIT_EDITOR: 'true',
  GIT_SEQUENCE_EDITOR: 'true'
}

export class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly exitCode: number,
    output: string
  ) {
    super(output || `git ${args[0]} failed with exit code ${exitCode}`)
    this.name = 'GitCommandError'
  }
}

export function runGit(cwd: string, args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      args,
      { cwd, env: gitEnvironment, maxBuffer: maxOutputBytes, windowsHide: true },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          // A string code means git could not be started at all (ENOENT when it is not on PATH).
          reject(new Error(`Could not run git: ${error.message}. Is Git installed and on PATH?`))
          return
        }
        const exitCode = typeof error?.code === 'number' ? error.code : 0
        if (exitCode === 0 || options.acceptedExitCodes?.includes(exitCode)) {
          resolve({ stdout, exitCode })
          return
        }
        // Merge conflicts are reported on stdout, most other failures on stderr.
        reject(new GitCommandError(args, exitCode, [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')))
      }
    )
  })
}
