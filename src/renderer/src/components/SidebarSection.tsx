import { useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'

/** Hands a top-level section's open state and header menu to the sidebar, which saves them in its layout. */
export interface SectionControl {
  open: boolean
  onToggle: (open: boolean) => void
  onHeaderContextMenu: (event: MouseEvent) => void
}

interface SidebarSectionProps {
  title: string
  count?: number
  /** How far the section is indented; 0 for the top-level sections. */
  depth?: number
  initiallyOpen?: boolean
  /** Extra controls in the header, e.g. a refresh button; clicks on them don't toggle the section. */
  actions?: ReactNode
  /** Set for top-level sections; nested sections keep their open state themselves. */
  control?: SectionControl
  children: ReactNode
}

export function SidebarSection({ title, count, depth = 0, initiallyOpen = true, actions, control, children }: SidebarSectionProps) {
  const [ownOpen, setOwnOpen] = useState(initiallyOpen)
  const open = control ? control.open : ownOpen
  const toggle = () => (control ? control.onToggle(!open) : setOwnOpen(!open))
  return (
    <section className={depth > 0 ? 'sidebar-section nested' : 'sidebar-section'} style={{ '--depth': depth } as CSSProperties}>
      <div className="section-header-row" onContextMenu={control?.onHeaderContextMenu}>
        <button className="section-header" onClick={toggle}>
          <span className="chevron">{open ? '▾' : '▸'}</span>
          <span className="section-title">{title}</span>
          {count !== undefined && <span className="section-count">{count}</span>}
        </button>
        {actions && <span className="section-actions">{actions}</span>}
      </div>
      {open && <div className="section-body">{children}</div>}
    </section>
  )
}
