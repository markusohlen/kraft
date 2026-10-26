/** The top-level sections of the branch sidebar. */
export const sidebarSectionIds = ['jira', 'local', 'remote', 'stashes', 'tags', 'gitflow'] as const

export type SidebarSectionId = (typeof sidebarSectionIds)[number]

export const sidebarSectionTitles: Record<SidebarSectionId, string> = {
  jira: 'Jira',
  local: 'Local',
  remote: 'Remote',
  stashes: 'Stashes',
  tags: 'Tags',
  gitflow: 'Gitflow'
}

export interface SidebarSectionSetting {
  id: SidebarSectionId
  visible: boolean
  /** Whether the section is open, showing its contents, or collapsed to its header. */
  expanded: boolean
}

/** The sidebar's sections from top to bottom; every section appears exactly once. */
export type SidebarLayout = readonly SidebarSectionSetting[]

export interface SidebarLayoutTemplate {
  name: string
  layout: SidebarLayout
}

/** Which repositories a layout is saved for. */
export type SidebarLayoutScope = 'repository' | 'all'

export interface SidebarSettings {
  /** Used by every repository without a layout of its own. */
  sharedLayout: SidebarLayout
  /** Layouts saved for one repository only, by repository path. */
  repositoryLayouts: Readonly<Record<string, SidebarLayout>>
  /** Named layouts the user saved to apply to repositories later. */
  templates: readonly SidebarLayoutTemplate[]
}

/** Tags are usually many and rarely needed, so they start collapsed. */
export const defaultSidebarLayout: SidebarLayout = sidebarSectionIds.map((id) => ({ id, visible: true, expanded: id !== 'tags' }))

export const defaultSidebarSettings: SidebarSettings = { sharedLayout: defaultSidebarLayout, repositoryLayouts: {}, templates: [] }

/**
 * Reads a layout saved by this or an older version of Kraft: unknown and repeated sections are
 * dropped, and sections added since go right after the section they follow in the default layout.
 */
export function toSidebarLayout(saved: unknown): SidebarLayout {
  const layout: SidebarSectionSetting[] = []
  for (const entry of Array.isArray(saved) ? saved : []) {
    if (!isSectionSetting(entry) || layout.some((setting) => setting.id === entry.id)) continue
    layout.push({ id: entry.id, visible: entry.visible, expanded: entry.expanded })
  }
  defaultSidebarLayout.forEach((setting, defaultIndex) => {
    if (layout.some((existing) => existing.id === setting.id)) return
    const previousId = sidebarSectionIds[defaultIndex - 1]
    const previousIndex = layout.findIndex((existing) => existing.id === previousId)
    layout.splice(previousIndex + 1, 0, setting)
  })
  return layout
}

export function toSidebarSettings(saved: unknown): SidebarSettings {
  if (!isRecord(saved)) return defaultSidebarSettings
  const repositoryLayouts = isRecord(saved.repositoryLayouts)
    ? Object.fromEntries(Object.entries(saved.repositoryLayouts).map(([path, layout]) => [path, toSidebarLayout(layout)]))
    : {}
  const templates = Array.isArray(saved.templates)
    ? saved.templates
        .filter((template): template is { name: string; layout: unknown } => isRecord(template) && typeof template.name === 'string')
        .map((template) => ({ name: template.name, layout: toSidebarLayout(template.layout) }))
    : []
  return { sharedLayout: toSidebarLayout(saved.sharedLayout), repositoryLayouts, templates }
}

/** The layout a repository shows and whether it is its own or the one shared by all repositories. */
export function layoutForRepository(settings: SidebarSettings, repositoryPath: string): { layout: SidebarLayout; scope: SidebarLayoutScope } {
  const own = settings.repositoryLayouts[repositoryPath]
  return own ? { layout: own, scope: 'repository' } : { layout: settings.sharedLayout, scope: 'all' }
}

/**
 * Saves a layout for one repository, or for all of them. Saving for all repositories also drops
 * every repository's own layout, so the layout really applies everywhere.
 */
export function saveLayout(settings: SidebarSettings, repositoryPath: string, scope: SidebarLayoutScope, layout: SidebarLayout): SidebarSettings {
  if (scope === 'all') return { ...settings, sharedLayout: layout, repositoryLayouts: {} }
  return { ...settings, repositoryLayouts: { ...settings.repositoryLayouts, [repositoryPath]: layout } }
}

/** Changes the layout a repository currently shows, wherever that layout is saved. */
export function updateRepositoryLayout(
  settings: SidebarSettings,
  repositoryPath: string,
  change: (layout: SidebarLayout) => SidebarLayout
): SidebarSettings {
  const { layout, scope } = layoutForRepository(settings, repositoryPath)
  if (scope === 'repository') return saveLayout(settings, repositoryPath, scope, change(layout))
  return { ...settings, sharedLayout: change(layout) }
}

/** Saves a template, replacing one with the same name (ignoring case). */
export function saveTemplate(settings: SidebarSettings, name: string, layout: SidebarLayout): SidebarSettings {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Give the template a name')
  const others = settings.templates.filter((template) => !sameName(template.name, trimmed))
  return { ...settings, templates: [...others, { name: trimmed, layout }].sort((a, b) => a.name.localeCompare(b.name)) }
}

export function deleteTemplate(settings: SidebarSettings, name: string): SidebarSettings {
  return { ...settings, templates: settings.templates.filter((template) => !sameName(template.name, name)) }
}

/** Moves a section to `toIndex` in the layout, shifting the sections in between. */
export function moveSection(layout: SidebarLayout, id: SidebarSectionId, toIndex: number): SidebarLayout {
  const moving = layout.find((setting) => setting.id === id)
  if (!moving) return layout
  const rest = layout.filter((setting) => setting.id !== id)
  const index = Math.max(0, Math.min(toIndex, rest.length))
  return [...rest.slice(0, index), moving, ...rest.slice(index)]
}

export function setSectionVisible(layout: SidebarLayout, id: SidebarSectionId, visible: boolean): SidebarLayout {
  return layout.map((setting) => (setting.id === id ? { ...setting, visible } : setting))
}

export function setSectionExpanded(layout: SidebarLayout, id: SidebarSectionId, expanded: boolean): SidebarLayout {
  return layout.map((setting) => (setting.id === id ? { ...setting, expanded } : setting))
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function isSectionSetting(value: unknown): value is SidebarSectionSetting {
  return (
    isRecord(value) &&
    sidebarSectionIds.includes(value.id as SidebarSectionId) &&
    typeof value.visible === 'boolean' &&
    typeof value.expanded === 'boolean'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
