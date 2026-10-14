import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutoStashResult } from '../../application/autoStash'
import type { RepositoryView } from '../../application/kraftApi'
import { hasUncommittedChanges, type FileChange } from '../../domain/entities'
import { kraft } from './kraftClient'

export type Selection = { kind: 'wip' } | { kind: 'commit'; sha: string } | null

export type DiffTarget =
  | { kind: 'working'; change: FileChange; staged: boolean }
  | { kind: 'commit'; sha: string; change: FileChange }
  | null

export interface Toast {
  id: number
  kind: 'info' | 'error'
  text: string
  action?: { label: string; run: () => void }
}

export interface DialogField {
  name: string
  label: string
  type: 'text' | 'checkbox'
  initial: string | boolean
  placeholder?: string
}

export interface DialogRequest {
  title: string
  description?: string
  fields: DialogField[]
  confirmLabel: string
  danger?: boolean
  onSubmit: (values: Record<string, string | boolean>) => void
}

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

export interface ContextMenuRequest {
  x: number
  y: number
  items: MenuItem[]
}

const toastDurationMs = 6000

export function useRepositoryController() {
  const [view, setView] = useState<RepositoryView | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [diff, setDiff] = useState<DiffTarget>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<DialogRequest | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuRequest | null>(null)
  const nextToastId = useRef(1)

  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])

  const notify = useCallback(
    (kind: Toast['kind'], text: string, action?: Toast['action']) => {
      const id = nextToastId.current++
      setToasts((current) => [...current, { id, kind, text, action }])
      if (kind === 'info') setTimeout(() => dismissToast(id), toastDurationMs)
    },
    [dismissToast]
  )

  const refresh = useCallback(async () => {
    try {
      setView(await kraft.refresh())
    } catch (error) {
      notify('error', messageOf(error))
    }
  }, [notify])

  const run = useCallback(
    async (label: string, action: () => Promise<unknown>, successText?: string) => {
      setBusyLabel(label)
      try {
        const result = await action()
        const stashMessage = (result as Partial<AutoStashResult> | undefined)?.stashMessage
        if (stashMessage) {
          notify('info', `Your changes were stashed: ${stashMessage}`, {
            label: 'Pop',
            run: () => void run('Popping stash', () => kraft.stashPop(0), 'Stash popped')
          })
        }
        if (successText) notify('info', successText)
      } catch (error) {
        notify('error', messageOf(error))
      } finally {
        // Refresh after failures too: a failed merge or pop can still leave conflicts behind.
        await refresh()
        setBusyLabel(null)
      }
    },
    [notify, refresh]
  )

  const openRepository = useCallback(
    async (path: string) => {
      setBusyLabel('Opening repository')
      try {
        const opened = await kraft.openRepository(path)
        setView(opened)
        setDiff(null)
        setSelection(hasUncommittedChanges(opened.status) ? { kind: 'wip' } : null)
      } catch (error) {
        notify('error', messageOf(error))
      } finally {
        setBusyLabel(null)
      }
    },
    [notify]
  )

  useEffect(() => {
    if (!view) return
    const refreshOnFocus = () => void refresh()
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [view, refresh])

  return {
    view,
    busyLabel,
    selection,
    setSelection,
    diff,
    setDiff,
    toasts,
    dismissToast,
    notify,
    dialog,
    ask: setDialog,
    closeDialog: () => setDialog(null),
    contextMenu,
    showMenu: setContextMenu,
    closeMenu: () => setContextMenu(null),
    run,
    refresh,
    openRepository
  }
}

export type RepositoryController = ReturnType<typeof useRepositoryController>

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
