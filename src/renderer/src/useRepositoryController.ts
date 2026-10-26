import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AutoStashResult } from '../../application/autoStash'
import type { JiraSettingsView } from '../../application/jiraApi'
import type { RepositoryView } from '../../application/kraftApi'
import { hasUncommittedChanges, type FileChange } from '../../domain/entities'
import { emptyLibrary, findRepository, type RepositoryLibrary } from '../../domain/repositoryLibrary'
import { avatarStyles, type AvatarStyle } from './avatars'
import { openInBrowser } from './browser'
import { kraft } from './kraftClient'
import { CherryPickPresenter } from './presenters/cherryPickPresenter'
import { PullRequestPresenter } from './presenters/pullRequestPresenter'
import { RemoteBranchPresenter } from './presenters/remoteBranchPresenter'
import { SquashPresenter } from './presenters/squashPresenter'
import { useAppUpdate } from './useAppUpdate'
import { readStored, usePreference, writeStored } from './usePreference'

export type Selection =
  | { kind: 'wip' }
  | { kind: 'commit'; sha: string }
  /** Two or more commits picked with shift-click, newest first; `anchor` is where the range started. */
  | { kind: 'commits'; anchor: string; shas: string[] }
  | { kind: 'stash'; sha: string }
  | null

/** A file whose changes the diff view shows. */
export type FileDiffTarget = { kind: 'working'; change: FileChange; staged: boolean } | { kind: 'commit'; sha: string; change: FileChange }

/** What the center pane shows instead of the commit graph: a diff, or the merge tool for a conflicted file. */
export type DiffTarget = FileDiffTarget | { kind: 'conflict'; change: FileChange } | null

export interface Toast {
  id: number
  kind: 'info' | 'error'
  text: string
  action?: { label: string; run: () => void }
}

export interface DialogField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'password' | 'checkbox' | 'select'
  initial: string | boolean
  placeholder?: string
  /** Choices for a `select` field. */
  options?: { value: string; label: string }[]
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
/** The repository that was open when Kraft was closed, reopened on the next start. */
const lastRepositoryKey = 'kraft.lastRepository'

export function useRepositoryController() {
  const [view, setView] = useState<RepositoryView | null>(null)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection>(null)
  const [diff, setDiff] = useState<DiffTarget>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<DialogRequest | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuRequest | null>(null)
  const [jira, setJira] = useState<JiraSettingsView | null>(null)
  const [library, setLibrary] = useState<RepositoryLibrary>(emptyLibrary)
  const [settingsOpen, setSettingsOpen] = useState(false)
  /** The folder being scanned for repositories, while its dialog is open. */
  const [scanRoot, setScanRoot] = useState<string | null>(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  /** Hides the branch sidebar while a diff is open, to give the diff more width. */
  const [diffExpanded, setDiffExpanded] = usePreference<boolean>('kraft.diffExpanded', false, [true, false])
  /** Initials by default: profile pictures send a hash of every author's email to gravatar.com. */
  const [avatarStyle, setAvatarStyle] = usePreference<AvatarStyle>('kraft.avatarStyle', 'initials', avatarStyles)
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

  const appUpdate = useAppUpdate(notify)

  const loadLibrary = useCallback(async (): Promise<RepositoryLibrary | null> => {
    try {
      const loaded = await kraft.repositoryLibrary()
      setLibrary(loaded)
      return loaded
    } catch (error) {
      notify('error', `Could not load the saved repositories: ${messageOf(error)}`)
      return null
    }
  }, [notify])

  /** Applies a change to the saved repositories and shows the result; library edits don't need the busy indicator. */
  const changeLibrary = useCallback(
    async (change: () => Promise<RepositoryLibrary>) => {
      try {
        setLibrary(await change())
      } catch (error) {
        notify('error', messageOf(error))
      }
    },
    [notify]
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

  /** The presenters' views are this window: its busy indicator, toasts, dialogs and the browser. */
  const presenters = useMemo(
    () => ({
      cherryPick: new CherryPickPresenter(kraft, { run, notify }),
      remoteBranch: new RemoteBranchPresenter(kraft, { run, notify }),
      squash: new SquashPresenter(kraft, {
        run,
        notify,
        selectCommit: (sha) => setSelection({ kind: 'commit', sha }),
        askMessage: (request, onSubmit) =>
          setDialog({
            title: request.title,
            description: request.description,
            fields: [{ name: 'message', label: 'Commit message', type: 'textarea', initial: request.initialMessage }],
            confirmLabel: request.confirmLabel,
            danger: request.danger,
            onSubmit: ({ message }) => onSubmit(String(message))
          })
      }),
      pullRequest: new PullRequestPresenter(kraft, {
        run,
        notify,
        openInBrowser,
        chooseTarget: (choice, onChoose) =>
          setDialog({
            title: choice.title,
            description: choice.description,
            fields: [{ name: 'target', label: choice.label, type: 'select', initial: choice.initial, options: choice.options }],
            confirmLabel: choice.confirmLabel,
            onSubmit: ({ target }) => onChoose(String(target))
          })
      })
    }),
    [run, notify]
  )

  const openRepository = useCallback(
    async (path: string) => {
      setBusyLabel('Opening repository')
      try {
        const opened = await kraft.openRepository(path)
        setView(opened)
        writeStored(lastRepositoryKey, opened.path)
        // Opening saves the repository, which may have added a tab.
        void loadLibrary()
        setDiff(null)
        setSelection(hasUncommittedChanges(opened.status) ? { kind: 'wip' } : null)
      } catch (error) {
        notify('error', messageOf(error))
      } finally {
        setBusyLabel(null)
      }
    },
    [notify, loadLibrary]
  )

  const startedUp = useRef(false)
  useEffect(() => {
    // Guarded because StrictMode runs effects twice in development, which would open the repository twice.
    if (startedUp.current) return
    startedUp.current = true
    void (async () => {
      const loaded = await loadLibrary()
      const lastPath = readStored(lastRepositoryKey)
      // A repository removed from the tabs since then is not reopened.
      if (loaded && typeof lastPath === 'string' && findRepository(loaded, lastPath)) await openRepository(lastPath)
    })()
  }, [loadLibrary, openRepository])

  useEffect(() => {
    kraft.jiraSettings().then(setJira, (error) => notify('error', `Could not load the Jira settings: ${messageOf(error)}`))
  }, [notify])

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
    jira,
    setJira,
    library,
    changeLibrary,
    settingsOpen,
    openSettings: () => setSettingsOpen(true),
    closeSettings: () => setSettingsOpen(false),
    scanRoot,
    openScan: setScanRoot,
    closeScan: () => setScanRoot(null),
    cloneOpen,
    openClone: () => setCloneOpen(true),
    closeClone: () => setCloneOpen(false),
    diffExpanded,
    setDiffExpanded,
    avatarStyle,
    setAvatarStyle,
    appUpdate,
    run,
    refresh,
    openRepository,
    presenters
  }
}

export type RepositoryController = ReturnType<typeof useRepositoryController>

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
