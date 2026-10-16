import type { MouseEvent } from 'react'
import type { Commit, Stash } from '../../domain/entities'
import { defaultGitFlowConfig, parseGitFlowBranch, type GitFlowBranchType } from '../../domain/gitFlow'
import { shortSha } from './format'
import { kraft } from './kraftClient'
import type { MenuItem, RepositoryController } from './useRepositoryController'

export function checkoutLocal(controller: RepositoryController, branch: string): void {
  void controller.run(`Checking out ${branch}`, () => kraft.checkoutBranch(branch))
}

/** Fetches the remote branch first, so its local branch is checked out with the newest commits. */
export function checkoutRemote(controller: RepositoryController, remoteBranch: string): void {
  void controller.presenters.remoteBranch.checkout(remoteBranch)
}

export function askCreateBranch(controller: RepositoryController, startPoint: string, startLabel = startPoint): void {
  controller.ask({
    title: 'Create branch',
    description: `The new branch starts at ${startLabel} and is checked out.`,
    fields: [{ name: 'name', label: 'Branch name', type: 'text', initial: '', placeholder: 'my-branch' }],
    confirmLabel: 'Create branch',
    onSubmit: ({ name }) =>
      void controller.run('Creating branch', () => kraft.createBranch(String(name), startPoint), `Created ${name}`)
  })
}

export function askStash(controller: RepositoryController): void {
  controller.ask({
    title: 'Stash changes',
    description: 'Staged, unstaged and untracked changes are stashed.',
    fields: [{ name: 'message', label: 'Stash message', type: 'text', initial: '', placeholder: 'WIP' }],
    confirmLabel: 'Stash',
    onSubmit: ({ message }) =>
      void controller.run('Stashing', async () => {
        if (!(await kraft.stash(String(message)))) throw new Error('There are no changes to stash')
      })
  })
}

export function showLocalBranchMenu(controller: RepositoryController, event: MouseEvent, branch: string): void {
  const view = controller.view
  if (!view) return
  const isCurrent = view.currentBranch === branch
  const current = view.currentBranch ?? 'HEAD'
  const items: MenuItem[] = [
    ...(isCurrent ? [] : [{ label: `Checkout ${branch}`, onSelect: () => checkoutLocal(controller, branch) }]),
    { label: `Create branch here`, onSelect: () => askCreateBranch(controller, branch) },
    ...(isCurrent
      ? []
      : [
          {
            label: `Merge ${branch} into ${current}`,
            onSelect: () => void controller.run('Merging', () => kraft.mergeIntoCurrent(branch), `Merged ${branch}`)
          },
          {
            label: `Rebase ${current} onto ${branch}`,
            onSelect: () => void controller.run('Rebasing', () => kraft.rebaseCurrentOnto(branch), `Rebased onto ${branch}`)
          }
        ]),
    ...pullRequestItem(controller, branch),
    ...gitFlowFinishItem(controller, branch),
    ...(isCurrent ? [] : [{ label: `Delete ${branch}`, danger: true, onSelect: () => askDeleteBranch(controller, branch) }])
  ]
  openMenu(controller, event, items)
}

export function showRemoteBranchMenu(controller: RepositoryController, event: MouseEvent, remoteBranch: string): void {
  const current = controller.view?.currentBranch ?? 'HEAD'
  openMenu(controller, event, [
    { label: `Checkout ${remoteBranch}`, onSelect: () => checkoutRemote(controller, remoteBranch) },
    { label: 'Create branch here', onSelect: () => askCreateBranch(controller, remoteBranch) },
    {
      label: `Merge ${remoteBranch} into ${current}`,
      onSelect: () => void controller.run('Merging', () => kraft.mergeIntoCurrent(remoteBranch), `Merged ${remoteBranch}`)
    }
  ])
}

export function showCommitMenu(controller: RepositoryController, event: MouseEvent, commit: Commit): void {
  const view = controller.view
  const { cherryPick } = controller.presenters
  openMenu(controller, event, [
    { label: 'Create branch here', onSelect: () => askCreateBranch(controller, commit.sha, shortSha(commit.sha)) },
    ...(view && cherryPick.canCherryPick(commit)
      ? [{ label: 'Cherry pick commit', onSelect: () => void cherryPick.cherryPick(view, commit) }]
      : []),
    { label: 'Copy commit sha', onSelect: () => void navigator.clipboard.writeText(commit.sha) }
  ])
}

export function applyStash(controller: RepositoryController, stash: Stash): void {
  void controller.run('Applying stash', () => kraft.stashApply(stash.index), 'Stash applied')
}

export function popStash(controller: RepositoryController, stash: Stash): void {
  void controller.run(
    'Popping stash',
    async () => {
      await kraft.stashPop(stash.index)
      forgetStashSelection(controller, stash)
    },
    'Stash popped'
  )
}

export function askDropStash(controller: RepositoryController, stash: Stash): void {
  controller.ask({
    title: `Delete stash@{${stash.index}}?`,
    description: `"${stash.message}" is deleted and its changes are lost.`,
    fields: [],
    confirmLabel: 'Delete stash',
    danger: true,
    onSubmit: () =>
      void controller.run(
        'Deleting stash',
        async () => {
          await kraft.stashDrop(stash.index)
          forgetStashSelection(controller, stash)
        },
        'Stash deleted'
      )
  })
}

export function showStashMenu(controller: RepositoryController, event: MouseEvent, stash: Stash): void {
  event.stopPropagation()
  openMenu(controller, event, [
    { label: 'Apply stash', onSelect: () => applyStash(controller, stash) },
    { label: 'Pop stash (apply and delete)', onSelect: () => popStash(controller, stash) },
    { label: 'Delete stash…', danger: true, onSelect: () => askDropStash(controller, stash) }
  ])
}

/** A popped or deleted stash can no longer be shown, so it stops being the selection. */
function forgetStashSelection(controller: RepositoryController, stash: Stash): void {
  controller.setSelection((current) => (current?.kind === 'stash' && current.sha === stash.sha ? null : current))
}

export function askInitGitFlow(controller: RepositoryController): void {
  const branches = controller.view?.branches.map((branch) => branch.name) ?? []
  const mainBranch = ['main', 'master'].find((name) => branches.includes(name)) ?? defaultGitFlowConfig.mainBranch
  const defaults = { ...defaultGitFlowConfig, mainBranch }
  controller.ask({
    title: 'Initialize Gitflow',
    description: 'Develop is created from main if it does not exist yet.',
    fields: [
      { name: 'mainBranch', label: 'Main/Master branch', type: 'text', initial: defaults.mainBranch },
      { name: 'developBranch', label: 'Develop branch', type: 'text', initial: defaults.developBranch },
      { name: 'featurePrefix', label: 'Feature prefix', type: 'text', initial: defaults.featurePrefix },
      { name: 'releasePrefix', label: 'Release prefix', type: 'text', initial: defaults.releasePrefix },
      { name: 'hotfixPrefix', label: 'Hotfix prefix', type: 'text', initial: defaults.hotfixPrefix },
      { name: 'versionTagPrefix', label: 'Version tag prefix', type: 'text', initial: defaults.versionTagPrefix }
    ],
    confirmLabel: 'Initialize Gitflow',
    onSubmit: (values) =>
      void controller.run(
        'Initializing Gitflow',
        () =>
          kraft.initGitFlow({
            mainBranch: String(values.mainBranch).trim(),
            developBranch: String(values.developBranch).trim(),
            featurePrefix: String(values.featurePrefix).trim(),
            releasePrefix: String(values.releasePrefix).trim(),
            hotfixPrefix: String(values.hotfixPrefix).trim(),
            versionTagPrefix: String(values.versionTagPrefix).trim()
          }),
        'Gitflow has been initialized'
      )
  })
}

export function askStartGitFlowBranch(controller: RepositoryController, type: GitFlowBranchType): void {
  const label = capitalize(type)
  controller.ask({
    title: `Start ${label}`,
    fields: [
      {
        name: 'name',
        label: type === 'feature' ? 'Feature name' : 'Version',
        type: 'text',
        initial: '',
        placeholder: type === 'feature' ? 'login-page' : '1.2.0'
      }
    ],
    confirmLabel: `Start ${label}`,
    onSubmit: ({ name }) =>
      void controller.run(`Starting ${type}`, () => kraft.startGitFlowBranch(type, String(name)), `Started ${type}: '${name}'`)
  })
}

export function askFinishGitFlowBranch(controller: RepositoryController, branchName: string): void {
  const config = controller.view?.gitFlow?.config
  const branch = config ? parseGitFlowBranch(branchName, config) : null
  if (!config || !branch) return
  const label = capitalize(branch.type)
  const targets = branch.type === 'feature' ? config.developBranch : `${config.mainBranch} and ${config.developBranch}`
  controller.ask({
    title: `Finish ${label}`,
    description: `Merges ${branchName} into ${targets}.`,
    fields: [
      { name: 'deleteBranch', label: 'Delete branch', type: 'checkbox', initial: true },
      ...(branch.type === 'feature'
        ? [{ name: 'rebaseOnDevelop', label: `Rebase on ${config.developBranch}`, type: 'checkbox' as const, initial: false }]
        : [
            {
              name: 'tagMessage',
              label: `Tag message for ${config.versionTagPrefix}${branch.name}`,
              type: 'text' as const,
              initial: '',
              placeholder: `${label} ${branch.name}`
            }
          ])
    ],
    confirmLabel: `Finish ${label}`,
    onSubmit: (values) =>
      void controller.run(
        `Finishing ${branch.type}`,
        () =>
          kraft.finishGitFlowBranch(branchName, {
            deleteBranch: values.deleteBranch === true,
            rebaseOnDevelop: values.rebaseOnDevelop === true,
            tagMessage: String(values.tagMessage ?? '')
          }),
        `Finished ${branch.type}: '${branch.name}'`
      )
  })
}

function gitFlowFinishItem(controller: RepositoryController, branchName: string): MenuItem[] {
  const config = controller.view?.gitFlow?.config
  const branch = config ? parseGitFlowBranch(branchName, config) : null
  return branch
    ? [{ label: `Gitflow: Finish ${branch.type} ${branch.name}`, onSelect: () => askFinishGitFlowBranch(controller, branchName) }]
    : []
}

function pullRequestItem(controller: RepositoryController, branch: string): MenuItem[] {
  const view = controller.view
  const { pullRequest } = controller.presenters
  return view && pullRequest.canCreate(view)
    ? [{ label: `Create pull request from ${branch}`, onSelect: () => pullRequest.start(view, branch) }]
    : []
}

function askDeleteBranch(controller: RepositoryController, branch: string): void {
  controller.ask({
    title: `Delete ${branch}?`,
    fields: [{ name: 'force', label: 'Force delete, even if not fully merged', type: 'checkbox', initial: false }],
    confirmLabel: 'Delete',
    danger: true,
    onSubmit: ({ force }) =>
      void controller.run('Deleting branch', () => kraft.deleteBranch(branch, force === true), `Deleted ${branch}`)
  })
}

function openMenu(controller: RepositoryController, event: MouseEvent, items: MenuItem[]): void {
  event.preventDefault()
  controller.showMenu({ x: event.clientX, y: event.clientY, items })
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
