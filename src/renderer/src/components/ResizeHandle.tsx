import { useRef, type PointerEvent } from 'react'

interface ResizeHandleProps {
  size: number
  onResize: (size: number) => void
  /** 1 when dragging right (or down) grows the panel, -1 when dragging left (or up) does. */
  direction: 1 | -1
  /** 'x' resizes a width, 'y' a height. */
  axis?: 'x' | 'y'
  className?: string
}

export function ResizeHandle({ size, onResize, direction, axis = 'x', className = 'resize-handle' }: ResizeHandleProps) {
  const drag = useRef<{ startPosition: number; startSize: number } | null>(null)
  const resizingClass = axis === 'x' ? 'resizing' : 'resizing-rows'
  const pointerPosition = (event: PointerEvent) => (axis === 'x' ? event.clientX : event.clientY)

  const stop = () => {
    drag.current = null
    document.body.classList.remove(resizingClass)
  }

  return (
    <div
      className={className}
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { startPosition: pointerPosition(event), startSize: size }
        document.body.classList.add(resizingClass)
      }}
      onPointerMove={(event) => {
        if (drag.current) onResize(drag.current.startSize + (pointerPosition(event) - drag.current.startPosition) * direction)
      }}
      onPointerUp={stop}
      onLostPointerCapture={stop}
    />
  )
}
