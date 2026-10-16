import { useRef } from 'react'

interface ResizeHandleProps {
  size: number
  onResize: (size: number) => void
  /** 1 when dragging right grows the panel, -1 when dragging left does. */
  direction: 1 | -1
  className?: string
}

export function ResizeHandle({ size, onResize, direction, className = 'resize-handle' }: ResizeHandleProps) {
  const drag = useRef<{ startX: number; startSize: number } | null>(null)

  const stop = () => {
    drag.current = null
    document.body.classList.remove('resizing')
  }

  return (
    <div
      className={className}
      role="separator"
      aria-orientation="vertical"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { startX: event.clientX, startSize: size }
        document.body.classList.add('resizing')
      }}
      onPointerMove={(event) => {
        if (drag.current) onResize(drag.current.startSize + (event.clientX - drag.current.startX) * direction)
      }}
      onPointerUp={stop}
      onLostPointerCapture={stop}
    />
  )
}
