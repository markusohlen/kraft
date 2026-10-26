import { contextBridge, ipcRenderer } from 'electron'
import { cloneMethods } from '../application/cloneApi'
import { jiraMethods } from '../application/jiraApi'
import { kraftMethods } from '../application/kraftApi'
import { repositoryLibraryMethods } from '../application/repositoryLibraryApi'
import { updateMethods, updateStatusChannel } from '../application/updateApi'
import type { UpdateView } from '../domain/appUpdate'
import { channelFor, type IpcResult } from '../ipc/ipcContract'

const api = Object.fromEntries(
  [...kraftMethods, ...jiraMethods, ...repositoryLibraryMethods, ...cloneMethods, ...updateMethods].map((method) => [
    method,
    async (...args: unknown[]) => {
      const result: IpcResult<unknown> = await ipcRenderer.invoke(channelFor(method), ...args)
      if (!result.ok) throw new Error(result.error)
      return result.value
    }
  ])
)

/** Calls `listener` with every change of the update status; returns a function that stops listening. */
function onAppUpdateChanged(listener: (view: UpdateView) => void): () => void {
  const forward = (_event: Electron.IpcRendererEvent, view: UpdateView) => listener(view)
  ipcRenderer.on(updateStatusChannel, forward)
  return () => void ipcRenderer.off(updateStatusChannel, forward)
}

contextBridge.exposeInMainWorld('kraft', { ...api, onAppUpdateChanged })
