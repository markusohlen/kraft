export interface BranchLeaf {
  /** The last part of the name, e.g. `login` for `feature/login`. */
  label: string
  fullName: string
}

export interface BranchFolder {
  name: string
  /** The folder's path, e.g. `feature/auth`; unique within a tree. */
  path: string
  folders: BranchFolder[]
  branches: BranchLeaf[]
}

/** Groups `feature/auth/login`-style names into nested folders, with folders listed before branches. */
export function buildBranchTree(names: readonly string[], basePath = ''): BranchFolder {
  const root: BranchFolder = { name: '', path: basePath, folders: [], branches: [] }
  for (const fullName of names) {
    const relative = basePath && fullName.startsWith(`${basePath}/`) ? fullName.slice(basePath.length + 1) : fullName
    const parts = relative.split('/').filter(Boolean)
    const label = parts.pop() ?? relative
    let folder = root
    for (const part of parts) folder = childFolder(folder, part)
    folder.branches.push({ label, fullName })
  }
  sortFolders(root)
  return root
}

export function countBranches(folder: BranchFolder): number {
  return folder.branches.length + folder.folders.reduce((total, child) => total + countBranches(child), 0)
}

function childFolder(parent: BranchFolder, name: string): BranchFolder {
  let child = parent.folders.find((folder) => folder.name === name)
  if (!child) {
    child = { name, path: parent.path ? `${parent.path}/${name}` : name, folders: [], branches: [] }
    parent.folders.push(child)
  }
  return child
}

function sortFolders(folder: BranchFolder): void {
  folder.folders.sort((a, b) => a.name.localeCompare(b.name))
  folder.folders.forEach(sortFolders)
}
