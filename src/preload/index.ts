import { contextBridge, ipcRenderer } from 'electron'
import { jiraMethods } from '../application/jiraApi'
import { kraftMethods } from '../application/kraftApi'
import { repositoryLibraryMethods } from '../application/repositoryLibraryApi'
import { channelFor, type IpcResult } from '../ipc/ipcContract'

const api = Object.fromEntries(
  [...kraftMethods, ...jiraMethods, ...repositoryLibraryMethods].map((method) => [
    method,
    async (...args: unknown[]) => {
      const result: IpcResult<unknown> = await ipcRenderer.invoke(channelFor(method), ...args)
      if (!result.ok) throw new Error(result.error)
      return result.value
    }
  ])
)

contextBridge.exposeInMainWorld('kraft', api)
