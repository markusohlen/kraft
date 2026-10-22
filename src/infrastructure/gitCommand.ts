import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { delimiter, join } from 'node:path'

export interface GitCommandResult {
  stdout: string
  exitCode: number
}

export interface GitCommandOptions {
  /** Exit codes besides 0 that are an answer rather than a failure (e.g. 1 from `show-ref --verify`). */
  acceptedExitCodes?: number[]
}

const maxOutputMebibytes = 128
const maxOutputBytes = maxOutputMebibytes * 1024 * 1024

/**
 * A repository's own config can name commands that git runs during ordinary operations; `core.fsmonitor`,
 * for one, runs on every `status`. A repository from an untrusted source (a zip, a shared folder) would then
 * run code just by being opened. Command-line config overrides the repository's, so these switch that off
 * for every git call Kraft makes. Hooks are left alone: they only run on writes and users rely on them.
 */
const hardeningConfig = ['-c', 'core.fsmonitor=false', '-c', 'protocol.ext.allow=never']

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

/**
 * Git runs with `cwd` set to the (untrusted) repository. Invoking it by the bare name `git` would let
 * Windows' CreateProcess search that directory before PATH, so a `git.exe` planted in a malicious repo
 * would run instead of the real one. Resolving an absolute path from PATH up front removes that search.
 */
const gitExecutableNames = process.platform === 'win32' ? ['git.exe'] : ['git']
let resolvedGitPath: Promise<string> | null = null

function resolveGitPath(): Promise<string> {
  return (resolvedGitPath ??= (async () => {
    for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
      for (const name of gitExecutableNames) {
        const candidate = join(directory, name)
        try {
          await access(candidate, constants.X_OK)
          return candidate
        } catch {
          // Not in this directory; keep looking.
        }
      }
    }
    throw new Error('Could not find git on PATH. Is Git installed and on PATH?')
  })().catch((error) => {
    // Don't cache the failure: Git may be installed later in the session.
    resolvedGitPath = null
    throw error
  }))
}

export async function runGit(cwd: string, args: string[], options: GitCommandOptions = {}): Promise<GitCommandResult> {
  const gitPath = await resolveGitPath()
  return new Promise((resolve, reject) => {
    execFile(
      gitPath,
      [...hardeningConfig, ...args],
      { cwd, env: gitEnvironment, maxBuffer: maxOutputBytes, windowsHide: true },
      (error, stdout, stderr) => {
        if (error?.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
          reject(new Error(`git ${args[0]} produced more than ${maxOutputMebibytes} MiB of output, which is too much to show`))
          return
        }
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
