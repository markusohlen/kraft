import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ContextMenuRequest } from '../useRepositoryController'

export function ContextMenu({ menu, onClose }: { menu: ContextMenuRequest; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: menu.x, top: menu.y })

  // Keep the menu on screen when opened near the window's right or bottom edge.
  useLayoutEffect(() => {
    const element = menuRef.current
    if (!element) return
    setPosition({
      left: Math.min(menu.x, window.innerWidth - element.offsetWidth - 4),
      top: Math.min(menu.y, window.innerHeight - element.offsetHeight - 4)
    })
  }, [menu])

  useEffect(() => {
    const close = () => onClose()
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  return (
    <div ref={menuRef} className="context-menu" style={position} onMouseDown={(event) => event.stopPropagation()}>
      {menu.items.map((item) => (
        <button
          key={item.label}
          className={`context-item ${item.danger ? 'danger' : ''}`}
          onClick={() => {
            onClose()
            item.onSelect()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
