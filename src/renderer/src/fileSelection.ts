/** Files selected in one of the working tree's lists; `anchor` is where a shift-click range starts. */
export interface FileSelection {
  staged: boolean
  paths: string[]
  anchor: string
}

/** Ctrl/Cmd-click toggles one file, shift-click selects every file from the anchor to the clicked one. */
export type SelectionMode = 'toggle' | 'range'

export function selectFile(staged: boolean, path: string): FileSelection {
  return { staged, paths: [path], anchor: path }
}

/**
 * Extends the selection in the list of `listPaths` with a modifier-click on `path`. A selection in the
 * other list is replaced, since staging and unstaging only apply to one list at a time.
 */
export function extendFileSelection(
  selection: FileSelection | null,
  staged: boolean,
  listPaths: readonly string[],
  path: string,
  mode: SelectionMode
): FileSelection | null {
  const current = selection?.staged === staged ? selection : null
  if (!current) return selectFile(staged, path)

  if (mode === 'toggle') {
    const paths = current.paths.includes(path) ? current.paths.filter((selected) => selected !== path) : [...current.paths, path]
    return paths.length === 0 ? null : { staged, paths, anchor: path }
  }

  const anchorIndex = listPaths.indexOf(current.anchor)
  const clickedIndex = listPaths.indexOf(path)
  if (anchorIndex === -1 || clickedIndex === -1) return selectFile(staged, path)
  const paths = listPaths.slice(Math.min(anchorIndex, clickedIndex), Math.max(anchorIndex, clickedIndex) + 1)
  return { staged, paths, anchor: current.anchor }
}

/** The selected files still in the list, in list order; files staged or discarded since drop out. */
export function selectedPaths(selection: FileSelection | null, staged: boolean, listPaths: readonly string[]): string[] {
  if (selection?.staged !== staged) return []
  return listPaths.filter((path) => selection.paths.includes(path))
}
