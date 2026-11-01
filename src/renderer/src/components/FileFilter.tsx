import { useEffect, useRef } from 'react'
import { startsFileFilter } from '../fileFilter'

interface FileFilterProps {
  query: string
  onChange: (query: string) => void
}

/**
 * Filters the panel's file lists by name. Typing anywhere outside a text field or dialog starts filtering,
 * so pressing `s` shows the files whose names start with s; Escape clears it.
 */
export function FileFilter({ query, onChange }: FileFilterProps) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const startFiltering = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !startsFileFilter(event) || isTextField(event.target) || document.querySelector('.modal')) return
      event.preventDefault()
      onChange(`${input.current?.value ?? ''}${event.key}`)
      input.current?.focus()
    }
    window.addEventListener('keydown', startFiltering)
    return () => window.removeEventListener('keydown', startFiltering)
  }, [onChange])

  return (
    <input
      ref={input}
      className="file-filter"
      placeholder="Filter files (start typing)"
      value={query}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        onChange('')
        event.currentTarget.blur()
      }}
    />
  )
}

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}
