import { useCallback, useEffect, useState } from 'react'

export interface PanelSizeLimits {
  initial: number
  min: number
  max: number
}

/** A pixel size the user can drag, remembered between sessions. */
export function usePanelSize(storageKey: string, { initial, min, max }: PanelSizeLimits) {
  const clamp = useCallback((size: number) => Math.round(Math.min(max, Math.max(min, size))), [min, max])
  const [size, setSize] = useState(() => clamp(readStoredSize(storageKey) ?? initial))

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(size))
    } catch {
      // Storage can be unavailable; the size then simply isn't remembered.
    }
  }, [storageKey, size])

  const resize = useCallback((next: number) => setSize(clamp(next)), [clamp])
  return { size, resize }
}

function readStoredSize(storageKey: string): number | null {
  try {
    const stored = Number(localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  } catch {
    return null
  }
}
