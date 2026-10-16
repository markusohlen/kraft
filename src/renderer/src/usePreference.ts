import { useEffect, useState } from 'react'

/** A choice the user makes in the interface, such as a view mode, remembered between sessions. */
export function usePreference<T extends string | boolean>(storageKey: string, initial: T, allowed: readonly T[]) {
  const [value, setValue] = useState<T>(() => {
    const stored = readStored(storageKey)
    return allowed.includes(stored as T) ? (stored as T) : initial
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value))
    } catch {
      // Storage can be unavailable; the choice then simply isn't remembered.
    }
  }, [storageKey, value])

  return [value, setValue] as const
}

function readStored(storageKey: string): unknown {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === null ? undefined : JSON.parse(stored)
  } catch {
    return undefined
  }
}
