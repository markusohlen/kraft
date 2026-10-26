import { useLayoutEffect, useState, type RefObject } from 'react'
import type { OverviewMark } from '../diffOverview'

/** Keeps a one-line change visible however long the file is. */
const minimumMarkHeight = 3

interface ScrollbarTrack {
  width: number
  height: number
}

/**
 * Draws where the changes are on top of the vertical scrollbar of `scrollRef`, which must sit at the
 * top right of this component's positioned parent. The marks let clicks and drags through to the scrollbar.
 */
export function ScrollbarChangeMarks({ scrollRef, marks }: { scrollRef: RefObject<HTMLElement | null>; marks: readonly OverviewMark[] }) {
  const track = useScrollbarTrack(scrollRef, marks)
  if (!track || marks.length === 0) return null
  return (
    <div className="scrollbar-change-marks" style={{ width: track.width, height: track.height }} aria-hidden>
      {marks.map((mark, index) => (
        <div
          key={index}
          className={`scrollbar-change-mark ${mark.kind}`}
          style={{ top: mark.start * track.height, height: Math.max(minimumMarkHeight, (mark.end - mark.start) * track.height) }}
        />
      ))}
    </div>
  )
}

/** The size of the element's vertical scrollbar, or null while it has none. */
function useScrollbarTrack(scrollRef: RefObject<HTMLElement | null>, content: unknown): ScrollbarTrack | null {
  const [track, setTrack] = useState<ScrollbarTrack | null>(null)

  useLayoutEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const measure = () => {
      const width = element.offsetWidth - element.clientWidth
      const scrolls = element.scrollHeight > element.clientHeight && width > 0
      setTrack((previous) => {
        if (!scrolls) return null
        if (previous?.width === width && previous.height === element.clientHeight) return previous
        return { width, height: element.clientHeight }
      })
    }
    measure()
    // The scrollbar appears and changes size when either the element or what it scrolls is resized.
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => observer.disconnect()
  }, [scrollRef, content])

  return track
}
