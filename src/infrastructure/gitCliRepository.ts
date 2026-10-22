import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { DiffOptions } from '../domain/diff'
import type { Branch, Commit, FileChange, Stash, WorkingTreeStatus } from '../domain/entities'
import type { CommitAuthor, ConflictVersions, GitRepository, GitRepositoryFactory, MergeOptions } from '../application/ports'
import { runGit, type GitCommandOptions } from './gitCommand'
import {
  branchFormat,
  lines,
  logFormat,
  parseBranches,
  parseLog,
  parseNameStatus,
  parseStashes,
  parseStatus,
  stashFormat
} from './gitParsers'

/** Exit code git uses for "no" answers such as a missing ref or config key. */
const notFoundExitCode = 1

const maxReportedMergeConflicts = 127
const mergeFileConflictCounts = Array.from({ length: maxReportedMergeConflicts }, (_, index) => index + 1)

/**
 * `git` treats any argument starting with `-` as an option, so an attacker-controlled SHA or ref such as
 * `--output=<path>` or `--upload-pack=<cmd>` could write files or run commands. Two defences are applied:
 * SHAs (which only ever come from the commit graph) are checked to be hex, and `--end-of-options` is
 * placed before every ref/name/start-point so git reads them as data rather than options (git ≥ 2.24).
 */
const endOfOptions = '--end-of-options'

/**
 * `diff.external` and textconv drivers are commands taken from config, which a hostile repository can set.
 * Kraft parses git's own unified diff, so neither is wanted when producing a patch.
 */
const noDiffCommands = ['--no-ext-diff', '--no-textconv']

function assertSha(sha: string): string {
  if (!/^[0-9a-f]{4,64}$/i.test(sha)) throw new Error(`"${sha}" is not a valid commit id`)
  return sha
}

function assertIndex(index: number): number {
  if (!Number.isInteger(index) || index < 0) throw new Error(`"${index}" is not a valid stash index`)
  return index
}

/**
 * `git checkout` does not honour `--end-of-options`, so its ref arguments are guarded by rejecting a
 * leading dash. Git itself refuses to create a branch or ref whose name starts with `-`, so this never
 * rejects a legitimate ref while still stopping an option such as `--orphan` from being injected.
 */
function assertRef(ref: string): string {
  if (ref.length === 0 || ref.startsWith('-')) throw new Error(`"${ref}" is not a valid branch or ref name`)
  return ref
}

export class GitCliRepositoryFactory implements GitRepositoryFactory {
  async open(path: string): Promise<GitRepository> {
    const folder = await stat(path).catch(() => null)
    if (!folder?.isDirectory()) throw new Error(`"${path}" is not a folder`)
    const { stdout } = await runGit(path, ['rev-parse', '--show-toplevel']).catch(() => {
      throw new Error(`"${path}" is not inside a Git repository`)
    })
    return new GitCliRepository(stdout.trim())
  }
}

export class GitCliRepository implements GitRepository {
  constructor(readonly path: string) {}

  async log(limit: number): Promise<Commit[]> {
    const hasHead = await this.refExists('HEAD')
    const refs = ['--branches', '--remotes', '--tags', ...(hasHead ? ['HEAD'] : [])]
    if (!hasHead && !(await this.hasAnyRefs())) return []
    const output = await this.git(['log', '--date-order', `-n${limit}`, '--decorate=full', `--format=${logFormat}`, ...refs])
    return parseLog(output)
  }

  async firstParentLog(limit: number): Promise<Commit[]> {
    if (!(await this.refExists('HEAD'))) return []
    return parseLog(await this.git(['log', '--first-parent', `-n${limit}`, '--decorate=full', `--format=${logFormat}`, 'HEAD']))
  }

  async commitMessage(sha: string): Promise<string> {
    return (await this.git(['show', '-s', '--format=%B', endOfOptions, assertSha(sha)])).trim()
  }

  async commitParents(sha: string): Promise<string[]> {
    const [, ...parents] = (await this.git(['rev-list', '--parents', '-n1', endOfOptions, assertSha(sha)])).trim().split(' ')
    return parents
  }

  async commitFiles(sha: string): Promise<FileChange[]> {
    const parent = await this.firstParent(sha)
    const args = parent
      ? ['diff', '--name-status', '-z', '-M', endOfOptions, parent, assertSha(sha)]
      : ['diff-tree', '--root', '--no-commit-id', '-r', '--name-status', '-z', '-M', endOfOptions, assertSha(sha)]
    return parseNameStatus(await this.git(args))
  }

  async commitFileDiff(sha: string, path: string, options: DiffOptions): Promise<string> {
    const parent = await this.firstParent(sha)
    return parent
      ? this.git(['diff', '-M', ...noDiffCommands, ...contextArgs(options), endOfOptions, parent, assertSha(sha), '--', path])
      : this.git(['show', '--format=', ...noDiffCommands, ...contextArgs(options), endOfOptions, assertSha(sha), '--', path])
  }

  async status(): Promise<WorkingTreeStatus> {
    return parseStatus(await this.git(['status', '--porcelain=v1', '-z', '--untracked-files=all']))
  }

  async workingFileDiff(change: FileChange, staged: boolean, options: DiffOptions): Promise<string> {
    if (change.status === 'untracked') return this.untrackedFileDiff(change.path)
    const paths = change.oldPath ? [change.oldPath, change.path] : [change.path]
    return this.git(['diff', '-M', ...noDiffCommands, ...contextArgs(options), ...(staged ? ['--cached'] : []), '--', ...paths])
  }

  async stage(paths: string[]): Promise<void> {
    await this.git(['add', '-A', '--', ...paths])
  }

  async unstage(paths: string[]): Promise<void> {
    if (await this.refExists('HEAD')) await this.git(['reset', '-q', 'HEAD', '--', ...paths])
    else await this.git(['rm', '--cached', '-r', '-q', '--', ...paths])
  }

  async discard(changes: FileChange[]): Promise<void> {
    const untracked = changes.filter((change) => change.status === 'untracked').map((change) => change.path)
    const tracked = changes.filter((change) => change.status !== 'untracked').map((change) => change.path)
    if (untracked.length > 0) await this.git(['clean', '-f', '-q', '--', ...untracked])
    if (tracked.length > 0) await this.git(['checkout', '--', ...tracked])
  }

  async remove(paths: string[]): Promise<void> {
    await this.git(['rm', '-q', '--', ...paths])
  }

  async writeWorkingFile(path: string, content: string): Promise<void> {
    await writeFile(this.pathInside(path), content)
  }

  async conflictVersions(path: string): Promise<ConflictVersions> {
    const versions: ConflictVersions = { base: null, ours: null, theirs: null }
    const stageNames: Record<string, keyof ConflictVersions> = { '1': 'base', '2': 'ours', '3': 'theirs' }
    for (const entry of (await this.git(['ls-files', '-u', '-z', '--', path])).split('\0').filter(Boolean)) {
      // "<mode> <sha> <stage>\t<path>"
      const [, sha, stage] = entry.slice(0, entry.indexOf('\t')).split(' ')
      versions[stageNames[stage]] = await this.git(['cat-file', 'blob', assertSha(sha)])
    }
    return versions
  }

  async mergeTexts(base: string, ours: string, theirs: string, markerSize: number): Promise<string> {
    const folder = await mkdtemp(join(tmpdir(), 'kraft-merge-'))
    try {
      const files = { ours: join(folder, 'ours'), base: join(folder, 'base'), theirs: join(folder, 'theirs') }
      await Promise.all([writeFile(files.ours, ours), writeFile(files.base, base), writeFile(files.theirs, theirs)])
      // merge-file exits with the number of conflicts (capped at 127); only higher codes are failures.
      const args = ['merge-file', '-p', '--diff3', `--marker-size=${markerSize}`, files.ours, files.base, files.theirs]
      const { stdout } = await this.run(args, {
        acceptedExitCodes: mergeFileConflictCounts
      })
      return stdout
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  }

  headCommit(): Promise<string | null> {
    return this.resolveRef('HEAD')
  }

  async incomingCommit(): Promise<string | null> {
    for (const ref of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD']) {
      const sha = await this.resolveRef(ref)
      if (sha) return sha
    }
    return null
  }

  async branchContaining(sha: string): Promise<string | null> {
    const name = (await this.git(['name-rev', '--name-only', '--refs=refs/heads/*', endOfOptions, assertSha(sha)])).trim()
    // name-rev answers "undefined" for no branch, and "branch~2" or "branch^2" for a commit below its tip.
    return name === 'undefined' || name === '' ? null : name.replace(/[~^].*$/, '')
  }

  async commit(message: string): Promise<void> {
    await this.git(['commit', '-m', message])
  }

  async commitTree(treeOf: string, parent: string | null, message: string, author: CommitAuthor): Promise<string> {
    const parents = parent === null ? [] : ['-p', assertSha(parent)]
    const env = { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email, GIT_AUTHOR_DATE: author.date }
    const { stdout } = await this.run(['commit-tree', ...parents, '-m', message, `${assertSha(treeOf)}^{tree}`], { env })
    return stdout.trim()
  }

  async currentBranch(): Promise<string | null> {
    const { stdout, exitCode } = await this.run(['symbolic-ref', '--short', '-q', 'HEAD'], {
      acceptedExitCodes: [notFoundExitCode]
    })
    return exitCode === 0 ? stdout.trim() : null
  }

  async branches(): Promise<Branch[]> {
    return parseBranches(await this.git(['for-each-ref', `--format=${branchFormat}`, 'refs/heads']))
  }

  async remoteBranches(): Promise<string[]> {
    const output = await this.git(['for-each-ref', '--format=%(refname)', 'refs/remotes'])
    return lines(output)
      .filter((ref) => !ref.endsWith('/HEAD'))
      .map((ref) => ref.slice('refs/remotes/'.length))
  }

  async remotes(): Promise<string[]> {
    return lines(await this.git(['remote']))
  }

  async tags(): Promise<string[]> {
    return lines(await this.git(['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)', 'refs/tags']))
  }

  branchExists(name: string): Promise<boolean> {
    return this.refExists(`refs/heads/${name}`)
  }

  async checkout(branch: string): Promise<void> {
    await this.git(['checkout', assertRef(branch), '--'])
  }

  async checkoutTracking(localName: string, remoteBranch: string): Promise<void> {
    await this.git(['checkout', '-b', assertRef(localName), '--track', assertRef(remoteBranch)])
  }

  async aheadBehind(branch: string, other: string): Promise<{ ahead: number; behind: number }> {
    const range = `${assertRef(branch)}...${assertRef(other)}`
    const [ahead, behind] = (await this.git(['rev-list', '--left-right', '--count', endOfOptions, range])).trim().split(/\s+/)
    return { ahead: Number(ahead), behind: Number(behind) }
  }

  async fastForward(target: string): Promise<void> {
    await this.git(['merge', '--ff-only', endOfOptions, target])
  }

  async createBranch(name: string, startPoint: string): Promise<void> {
    await this.git(['branch', endOfOptions, name, startPoint])
  }

  async deleteBranch(name: string, force: boolean): Promise<void> {
    await this.git(['branch', force ? '-D' : '-d', endOfOptions, name])
  }

  async merge(branch: string, options: MergeOptions): Promise<void> {
    const message = options.message ? ['-m', options.message] : []
    await this.git(['merge', options.noFastForward ? '--no-ff' : '--ff', '--no-edit', ...message, endOfOptions, branch])
  }

  async rebase(onto: string): Promise<void> {
    await this.git(['rebase', endOfOptions, onto])
  }

  async rebaseOnto(newBase: string, upstream: string): Promise<void> {
    await this.git(['rebase', '--onto', assertSha(newBase), endOfOptions, assertSha(upstream)])
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    const { exitCode } = await this.run(['merge-base', '--is-ancestor', endOfOptions, ancestor, descendant], {
      acceptedExitCodes: [notFoundExitCode]
    })
    return exitCode === 0
  }

  async cherryPick(sha: string, mainline: number | null): Promise<void> {
    await this.git(['cherry-pick', ...(mainline === null ? [] : ['-m', String(mainline)]), endOfOptions, assertSha(sha)])
  }

  isCherryPickInProgress(): Promise<boolean> {
    return this.refExists('CHERRY_PICK_HEAD')
  }

  async abortCherryPick(): Promise<void> {
    await this.git(['cherry-pick', '--abort'])
  }

  async createTag(name: string, message: string): Promise<void> {
    await this.git(['tag', '-a', '-m', message, endOfOptions, name])
  }

  async stashes(): Promise<Stash[]> {
    return parseStashes(await this.git(['stash', 'list', `--format=${stashFormat}`]))
  }

  async stashPush(message: string): Promise<boolean> {
    // Compare the stash ref rather than parsing git's (localized) "No local changes to save".
    const before = await this.resolveRef('refs/stash')
    await this.git(['stash', 'push', '--include-untracked', '-m', message])
    return (await this.resolveRef('refs/stash')) !== before
  }

  async stashPop(index: number): Promise<void> {
    await this.git(['stash', 'pop', `stash@{${assertIndex(index)}}`])
  }

  async stashApply(index: number): Promise<void> {
    await this.git(['stash', 'apply', `stash@{${assertIndex(index)}}`])
  }

  async stashDrop(index: number): Promise<void> {
    await this.git(['stash', 'drop', `stash@{${assertIndex(index)}}`])
  }

  async fetch(): Promise<void> {
    await this.git(['fetch', '--all', '--prune'])
  }

  async fetchBranch(remote: string, branch: string): Promise<void> {
    // Without a destination, git still updates the remote-tracking branch from the remote's fetch refspec.
    await this.git(['fetch', endOfOptions, remote, `refs/heads/${branch}`])
  }

  async pull(): Promise<void> {
    await this.git(['pull'])
  }

  async push(branch: string, setUpstreamRemote: string | null): Promise<void> {
    await this.git(setUpstreamRemote ? ['push', '-u', endOfOptions, setUpstreamRemote, branch] : ['push'])
  }

  async pushBranch(branch: string, remote: string, remoteBranch: string): Promise<void> {
    await this.git(['push', endOfOptions, remote, `refs/heads/${branch}:refs/heads/${remoteBranch}`])
  }

  async remoteUrl(remote: string): Promise<string> {
    return (await this.git(['remote', 'get-url', endOfOptions, remote])).trim()
  }

  async getConfig(key: string): Promise<string | null> {
    const { stdout, exitCode } = await this.run(['config', '--get', endOfOptions, key], { acceptedExitCodes: [notFoundExitCode] })
    return exitCode === 0 ? stdout.trim() : null
  }

  async setConfig(key: string, value: string): Promise<void> {
    await this.git(['config', '--local', endOfOptions, key, value])
  }

  private async untrackedFileDiff(path: string): Promise<string> {
    const content = await readFile(join(this.path, path))
    if (content.includes(0)) return `Binary file ${path} added`
    const fileLines = content.toString('utf8').replace(/\r?\n$/, '').split(/\r?\n/)
    const body = fileLines.map((line) => `+${line}`).join('\n')
    return `--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${fileLines.length} @@\n${body}\n`
  }

  /** The absolute path of a file in the working tree, refusing anything that resolves outside it. */
  private pathInside(path: string): string {
    const target = resolve(this.path, path)
    const fromRoot = relative(this.path, target)
    if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) throw new Error(`"${path}" is not inside the repository`)
    return target
  }

  private async firstParent(sha: string): Promise<string | null> {
    const [parent] = await this.commitParents(sha)
    return parent ?? null
  }

  private async refExists(ref: string): Promise<boolean> {
    return (await this.resolveRef(ref)) !== null
  }

  private async resolveRef(ref: string): Promise<string | null> {
    const { stdout, exitCode } = await this.run(['rev-parse', '-q', '--verify', ref], {
      acceptedExitCodes: [notFoundExitCode]
    })
    return exitCode === 0 ? stdout.trim() : null
  }

  private async hasAnyRefs(): Promise<boolean> {
    const output = await this.git(['for-each-ref', '--count=1', 'refs/heads', 'refs/remotes', 'refs/tags'])
    return output.trim().length > 0
  }

  private async git(args: string[]): Promise<string> {
    return (await this.run(args)).stdout
  }

  private run(args: string[], options?: GitCommandOptions) {
    return runGit(this.path, args, options)
  }
}

/**
 * Git has no "whole file" switch for diffs; context larger than any source file has the same effect.
 */
const fullFileContextLines = 1_000_000

function contextArgs(options: DiffOptions): string[] {
  return options.fullFile ? [`--unified=${fullFileContextLines}`] : []
}
