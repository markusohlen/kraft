import { describe, expect, it } from 'vitest'
import {
  defaultSidebarLayout,
  defaultSidebarSettings,
  deleteTemplate,
  layoutForRepository,
  moveSection,
  saveLayout,
  saveTemplate,
  setSectionExpanded,
  setSectionVisible,
  toSidebarLayout,
  toSidebarSettings,
  updateRepositoryLayout,
  type SidebarLayout
} from '../../src/domain/sidebarLayout'

const ids = (layout: SidebarLayout) => layout.map((setting) => setting.id)

describe('toSidebarLayout', () => {
  it('starts with every section shown and only the tags collapsed', () => {
    expect(toSidebarLayout(undefined)).toEqual(defaultSidebarLayout)
    expect(defaultSidebarLayout.filter((setting) => !setting.expanded).map((setting) => setting.id)).toEqual(['tags'])
  })

  it('keeps the saved order and drops unknown and repeated sections', () => {
    const layout = toSidebarLayout([
      { id: 'tags', visible: false, expanded: true },
      { id: 'unknown', visible: true, expanded: true },
      { id: 'local', visible: true, expanded: false },
      { id: 'tags', visible: true, expanded: true },
      'garbage'
    ])

    expect(layout.filter((setting) => setting.id === 'tags' || setting.id === 'local')).toEqual([
      { id: 'tags', visible: false, expanded: true },
      { id: 'local', visible: true, expanded: false }
    ])
    expect(layout).toHaveLength(defaultSidebarLayout.length)
  })

  it('puts sections missing from a saved layout after the section they follow by default', () => {
    const layout = toSidebarLayout([
      { id: 'gitflow', visible: true, expanded: true },
      { id: 'local', visible: true, expanded: true },
      { id: 'tags', visible: true, expanded: true }
    ])

    expect(ids(layout)).toEqual(['jira', 'gitflow', 'local', 'remote', 'stashes', 'tags'])
  })
})

describe('moveSection', () => {
  it('moves a section to a new position', () => {
    expect(ids(moveSection(defaultSidebarLayout, 'tags', 0))).toEqual(['tags', 'jira', 'local', 'remote', 'stashes', 'gitflow'])
    expect(ids(moveSection(defaultSidebarLayout, 'jira', 5))).toEqual(['local', 'remote', 'stashes', 'tags', 'gitflow', 'jira'])
  })

  it('keeps the section within the layout when the position is out of range', () => {
    expect(ids(moveSection(defaultSidebarLayout, 'local', 99)).at(-1)).toBe('local')
    expect(ids(moveSection(defaultSidebarLayout, 'local', -3))[0]).toBe('local')
  })
})

describe('section settings', () => {
  it('hides and collapses one section only', () => {
    const layout = setSectionExpanded(setSectionVisible(defaultSidebarLayout, 'jira', false), 'remote', false)

    expect(layout.find((setting) => setting.id === 'jira')).toEqual({ id: 'jira', visible: false, expanded: true })
    expect(layout.find((setting) => setting.id === 'remote')).toEqual({ id: 'remote', visible: true, expanded: false })
    expect(layout.filter((setting) => !setting.visible)).toHaveLength(1)
  })
})

describe('saving layouts', () => {
  const hiddenJira = setSectionVisible(defaultSidebarLayout, 'jira', false)
  const tagsFirst = moveSection(defaultSidebarLayout, 'tags', 0)

  it('uses the shared layout until a repository gets its own', () => {
    const settings = saveLayout(defaultSidebarSettings, 'C:/work/api', 'repository', hiddenJira)

    expect(layoutForRepository(settings, 'C:/work/api')).toEqual({ layout: hiddenJira, scope: 'repository' })
    expect(layoutForRepository(settings, 'C:/work/web')).toEqual({ layout: defaultSidebarLayout, scope: 'all' })
  })

  it('applies a layout saved for all repositories everywhere, replacing their own layouts', () => {
    const own = saveLayout(defaultSidebarSettings, 'C:/work/api', 'repository', hiddenJira)
    const settings = saveLayout(own, 'C:/work/web', 'all', tagsFirst)

    expect(layoutForRepository(settings, 'C:/work/api')).toEqual({ layout: tagsFirst, scope: 'all' })
    expect(layoutForRepository(settings, 'C:/work/web')).toEqual({ layout: tagsFirst, scope: 'all' })
  })

  it('changes the layout a repository shows where it is saved', () => {
    const own = saveLayout(defaultSidebarSettings, 'C:/work/api', 'repository', defaultSidebarLayout)
    const collapse = (layout: SidebarLayout) => setSectionExpanded(layout, 'local', false)

    const changedOwn = updateRepositoryLayout(own, 'C:/work/api', collapse)
    expect(changedOwn.repositoryLayouts['C:/work/api']).toEqual(collapse(defaultSidebarLayout))
    expect(changedOwn.sharedLayout).toEqual(defaultSidebarLayout)

    const changedShared = updateRepositoryLayout(own, 'C:/work/web', collapse)
    expect(changedShared.sharedLayout).toEqual(collapse(defaultSidebarLayout))
    expect(changedShared.repositoryLayouts['C:/work/web']).toBeUndefined()
  })
})

describe('templates', () => {
  const hiddenJira = setSectionVisible(defaultSidebarLayout, 'jira', false)

  it('saves templates sorted by name and replaces one with the same name', () => {
    let settings = saveTemplate(defaultSidebarSettings, ' Work ', hiddenJira)
    settings = saveTemplate(settings, 'Hobby', defaultSidebarLayout)
    settings = saveTemplate(settings, 'work', defaultSidebarLayout)

    expect(settings.templates).toEqual([
      { name: 'Hobby', layout: defaultSidebarLayout },
      { name: 'work', layout: defaultSidebarLayout }
    ])
  })

  it('refuses a template without a name', () => {
    expect(() => saveTemplate(defaultSidebarSettings, '  ', hiddenJira)).toThrow('Give the template a name')
  })

  it('deletes a template by name', () => {
    const settings = saveTemplate(defaultSidebarSettings, 'Work', hiddenJira)
    expect(deleteTemplate(settings, 'work').templates).toEqual([])
  })
})

describe('toSidebarSettings', () => {
  it('reads saved settings and ignores anything malformed', () => {
    const settings = toSidebarSettings({
      sharedLayout: [{ id: 'tags', visible: false, expanded: true }],
      repositoryLayouts: { 'C:/work/api': [] },
      templates: [{ name: 'Work', layout: [] }, { layout: [] }, 'nonsense']
    })

    expect(settings.sharedLayout.find((setting) => setting.id === 'tags')?.visible).toBe(false)
    expect(settings.repositoryLayouts['C:/work/api']).toEqual(defaultSidebarLayout)
    expect(settings.templates).toEqual([{ name: 'Work', layout: defaultSidebarLayout }])
  })

  it('falls back to the defaults for anything that is not saved settings', () => {
    expect(toSidebarSettings(null)).toEqual(defaultSidebarSettings)
    expect(toSidebarSettings([1, 2])).toEqual(defaultSidebarSettings)
  })
})
