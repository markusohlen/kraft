import { useCallback, useRef } from 'react'

/**
 * Keeps the sideways scroll position of several elements the same: scrolling one scrolls the rest.
 * `register` is a ref callback for each element and `follow` goes in each one's scroll handler.
 */
export function useSharedScrollLeft() {
  const elements = useRef(new Set<HTMLElement>())
  // Elements scrolled by `follow` itself; their own scroll event must not be followed back, or a
  // narrower element that stops early would pull the others back to its limit.
  const adjusting = useRef(new Set<HTMLElement>())

  const register = useCallback((element: HTMLElement | null) => {
    if (!element) return
    elements.current.add(element)
    return () => {
      elements.current.delete(element)
      adjusting.current.delete(element)
    }
  }, [])

  const follow = useCallback((source: HTMLElement) => {
    if (adjusting.current.delete(source)) return
    for (const element of elements.current) {
      if (element === source) continue
      const before = element.scrollLeft
      element.scrollLeft = source.scrollLeft
      if (element.scrollLeft !== before) adjusting.current.add(element)
    }
  }, [])

  return { register, follow }
}
