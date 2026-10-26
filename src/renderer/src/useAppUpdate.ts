import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateView } from '../../domain/appUpdate'
import { kraft } from './kraftClient'
import type { Toast } from './useRepositoryController'

type Notify = (kind: Toast['kind'], text: string, action?: Toast['action']) => void

/** Kraft's own updates: the current status, kept up to date by the main process, and what can be done about it. */
export function useAppUpdate(notify: Notify) {
  const [update, setUpdate] = useState<UpdateView | null>(null)
  const announcedVersion = useRef<string | null>(null)

  const install = useCallback(() => {
    kraft.installUpdate().catch((error: Error) => notify('error', `Could not install the update: ${error.message}`))
  }, [notify])

  const check = useCallback(() => {
    kraft.checkForUpdates().then(setUpdate, (error: Error) => notify('error', `Could not check for updates: ${error.message}`))
  }, [notify])

  useEffect(() => {
    let current = true
    kraft.appUpdate().then(
      (view) => current && setUpdate(view),
      (error: Error) => notify('error', `Could not read the update status: ${error.message}`)
    )
    const stopListening = kraft.onAppUpdateChanged(setUpdate)
    return () => {
      current = false
      stopListening()
    }
  }, [notify])

  // Tell the user once per release that it is ready, without interrupting what they are doing.
  const status = update?.status
  useEffect(() => {
    if (status?.kind !== 'ready' || announcedVersion.current === status.version) return
    announcedVersion.current = status.version
    notify('info', `Kraft ${status.version} has been downloaded. It is installed when you restart Kraft.`, { label: 'Restart now', run: install })
  }, [status, notify, install])

  return { update, check, install }
}
