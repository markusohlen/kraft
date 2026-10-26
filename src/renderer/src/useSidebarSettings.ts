import { useCallback, useEffect, useState } from 'react'
import { layoutForRepository, toSidebarSettings, updateRepositoryLayout, type SidebarLayout, type SidebarSettings } from '../../domain/sidebarLayout'
import { readStored, writeStored } from './usePreference'

const storageKey = 'kraft.sidebarSettings'

/** The sidebar layouts and templates, remembered between sessions, and the layout of one repository. */
export function useSidebarSettings(repositoryPath: string) {
  const [settings, setSettings] = useState<SidebarSettings>(() => toSidebarSettings(readStored(storageKey)))

  useEffect(() => writeStored(storageKey, settings), [settings])

  const changeLayout = useCallback(
    (change: (layout: SidebarLayout) => SidebarLayout) => setSettings((current) => updateRepositoryLayout(current, repositoryPath, change)),
    [repositoryPath]
  )

  return { settings, setSettings, changeLayout, ...layoutForRepository(settings, repositoryPath) }
}
