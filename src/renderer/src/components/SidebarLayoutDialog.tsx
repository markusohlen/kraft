import { useState, type DragEvent } from 'react'
import {
  defaultSidebarLayout,
  deleteTemplate,
  layoutForRepository,
  moveSection,
  saveLayout,
  saveTemplate,
  setSectionVisible,
  sidebarSectionTitles,
  type SidebarLayout,
  type SidebarLayoutScope,
  type SidebarSectionId,
  type SidebarSettings
} from '../../../domain/sidebarLayout'

interface SidebarLayoutDialogProps {
  repositoryName: string
  repositoryPath: string
  settings: SidebarSettings
  onSettingsChange: (settings: SidebarSettings) => void
  onClose: () => void
}

/** Reorders and hides the sidebar's sections, for one repository or all, and saves layouts as templates. */
export function SidebarLayoutDialog({ repositoryName, repositoryPath, settings, onSettingsChange, onClose }: SidebarLayoutDialogProps) {
  const saved = layoutForRepository(settings, repositoryPath)
  const [layout, setLayout] = useState<SidebarLayout>(saved.layout)
  const [scope, setScope] = useState<SidebarLayoutScope>(saved.scope)
  const [dragged, setDragged] = useState<SidebarSectionId | null>(null)
  const [templateName, setTemplateName] = useState('')
  const repositoriesWithOwnLayout = Object.keys(settings.repositoryLayouts).filter((path) => path !== repositoryPath).length

  const dropOn = (event: DragEvent, index: number) => {
    event.preventDefault()
    if (dragged) setLayout(moveSection(layout, dragged, index))
    setDragged(null)
  }
  const addTemplate = () => {
    onSettingsChange(saveTemplate(settings, templateName, layout))
    setTemplateName('')
  }
  const save = () => {
    onSettingsChange(saveLayout(settings, repositoryPath, scope, layout))
    onClose()
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal sidebar-layout-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <h2>Customize sidebar</h2>
        <p className="muted">Drag the sections into the order you want and untick the ones you don't need.</p>

        <ol className="layout-sections">
          {layout.map((setting, index) => (
            <li
              key={setting.id}
              className={`layout-section ${dragged === setting.id ? 'dragging' : ''}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                setDragged(setting.id)
              }}
              onDragEnd={() => setDragged(null)}
              onDragOver={(event) => dragged && event.preventDefault()}
              onDrop={(event) => dropOn(event, index)}
            >
              <span className="drag-handle" aria-hidden>
                ⠿
              </span>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={setting.visible}
                  onChange={(event) => setLayout(setSectionVisible(layout, setting.id, event.target.checked))}
                />
                {sidebarSectionTitles[setting.id]}
              </label>
              <span className="button-group">
                <button
                  type="button"
                  className="secondary small"
                  title="Move up"
                  disabled={index === 0}
                  onClick={() => setLayout(moveSection(layout, setting.id, index - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="secondary small"
                  title="Move down"
                  disabled={index === layout.length - 1}
                  onClick={() => setLayout(moveSection(layout, setting.id, index + 1))}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ol>

        <div className="text-field">
          <span>Templates</span>
          {settings.templates.length === 0 ? (
            <span className="muted small">Save a layout as a template to use it in other repositories.</span>
          ) : (
            <ul className="layout-templates">
              {settings.templates.map((template) => (
                <li key={template.name}>
                  <span className="template-name">{template.name}</span>
                  <button type="button" className="secondary small" title="Use this template's layout" onClick={() => setLayout(template.layout)}>
                    Use
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title={`Delete the template "${template.name}"`}
                    onClick={() => onSettingsChange(deleteTemplate(settings, template.name))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="template-save">
            <input
              placeholder="Template name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && templateName.trim() && addTemplate()}
            />
            <button type="button" className="secondary" disabled={!templateName.trim()} onClick={addTemplate}>
              Save as template
            </button>
          </span>
        </div>

        <div className="text-field">
          <span>Use this layout for</span>
          <label className="checkbox-field">
            <input type="radio" name="layout-scope" checked={scope === 'repository'} onChange={() => setScope('repository')} />
            {repositoryName} only
          </label>
          <label className="checkbox-field">
            <input type="radio" name="layout-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
            All repositories
          </label>
          {scope === 'all' && repositoriesWithOwnLayout > 0 && (
            <span className="muted small">
              Also replaces the layout of {repositoriesWithOwnLayout} other {repositoriesWithOwnLayout === 1 ? 'repository' : 'repositories'} with
              a layout of its own.
            </span>
          )}
        </div>

        <div className="modal-buttons">
          <button type="button" className="secondary" onClick={() => setLayout(defaultSidebarLayout)}>
            Reset to default
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" autoFocus onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
