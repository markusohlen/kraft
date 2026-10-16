export interface RemoteBranchName {
  remote: string
  branch: string
}

/** Splits `origin/feature/x` into remote and branch; matching against the remotes allows remote names with slashes. */
export function splitRemoteBranch(remoteBranch: string, remotes: readonly string[]): RemoteBranchName | null {
  const remote = [...remotes].sort((a, b) => b.length - a.length).find((name) => remoteBranch.startsWith(`${name}/`))
  return remote ? { remote, branch: remoteBranch.slice(remote.length + 1) } : null
}
