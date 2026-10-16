import { useState, type CSSProperties, type ReactNode } from 'react'

interface SidebarSectionProps {
  title: string
  count?: number
  /** How far the section is indented; 0 for the top-level sections. */
  depth?: number
  initiallyOpen?: boolean
  /** Extra controls in the header, e.g. a refresh button; clicks on them don't toggle the section. */
  actions?: ReactNode
  children: ReactNode
}

export function SidebarSection({ title, count, depth = 0, initiallyOpen = true, actions, children }: SidebarSectionProps) {
  const [open, setOpen] = useState(initiallyOpen)
  return (
    <section className={depth > 0 ? 'sidebar-section nested' : 'sidebar-section'} style={{ '--depth': depth } as CSSProperties}>
      <div className="section-header-row">
        <button className="section-header" onClick={() => setOpen(!open)}>
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
