import { describe, expect, it, vi } from 'vitest'
import type { LineChangeRequest } from '../../src/application/lineOperations'
import { parseUnifiedDiff } from '../../src/domain/diff'
import type { LineSelection } from '../../src/domain/lineChanges'
import { LineActionPresenter, linesForAction, type LineActionTarget } from '../../src/renderer/src/presenters/lineActionPresenter'

const [context, removed, added, secondAdded] = parseUnifiedDiff(['@@ -1,2 +1,3 @@', ' a', '-b', '+B', '+C', ''].join('\n')).hunks[0].lines
const rows = [[context], [removed], [added], [secondAdded]]

describe('linesForAction', () => {
  it('takes the right-clicked row when nothing is marked', () => {
    expect(linesForAction(rows, 2, [])).toEqual({ removed: [], added: [2] })
  })

  it('takes every marked row when the right-clicked one is among them', () => {
    expect(linesForAction(rows, 2, [1, 2, 3])).toEqual({ removed: [2], added: [2, 3] })
  })

  it('takes only the right-clicked row when the marked text is elsewhere', () => {
    expect(linesForAction(rows, 3, [1, 2])).toEqual({ removed: [], added: [3] })
  })

  it('takes both sides of a split row', () => {
    expect(linesForAction([[removed, added]], 0, [])).toEqual({ removed: [2], added: [2] })
  })

  it('finds no lines on an unchanged row or a row that is not there', () => {
    expect(linesForAction(rows, 0, [])).toEqual({ removed: [], added: [] })
    expect(linesForAction(rows, 9, [])).toEqual({ removed: [], added: [] })
  })
})

describe('LineActionPresenter', () => {
  function setUp(failure: Error | null = null) {
    const requests: LineChangeRequest[] = []
    const labels: string[] = []
    const errors: string[] = []
    const confirmations: { title: string; confirm: () => void }[] = []
    const presenter = new LineActionPresenter(
      {
        changeLines: async (request) => {
          requests.push(request)
          if (failure) throw failure
        }
      },
      {
        run: async (label, operation) => {
          labels.push(label)
          await operation().catch((error: Error) => errors.push(error.message))
        },
        confirmDiscard: (title, confirm) => confirmations.push({ title, confirm })
      }
    )
    const onDone = vi.fn()
    const target = (selection: LineSelection, staged = false): LineActionTarget => ({
      change: { path: 'file.txt', oldPath: null, status: 'modified' },
      staged,
      shownDiff: 'the diff',
      options: { fullFile: false },
      selection,
      onDone
    })
    return { presenter, requests, labels, errors, confirmations, onDone, target }
  }

  const select = (presenter: LineActionPresenter, target: LineActionTarget, label: string) => {
    const item = presenter.menuItems(target).find((candidate) => candidate.label === label)
    if (!item) throw new Error(`No menu item "${label}"`)
    item.onSelect()
  }

  it('offers nothing without changed lines, so an unchanged line gets no menu', () => {
    const { presenter, target } = setUp()

    expect(presenter.menuItems(target({ removed: [], added: [] }))).toEqual([])
  })

  it('offers stage and a dangerous discard for an unstaged diff', () => {
    const { presenter, target } = setUp()

    const items = presenter.menuItems(target({ removed: [], added: [2] }))

    expect(items.map((item) => [item.label, item.danger ?? false])).toEqual([
      ['Stage line', false],
      ['Discard line', true]
    ])
  })

  it('offers only unstage for a staged diff', () => {
    const { presenter, target } = setUp()

    expect(presenter.menuItems(target({ removed: [2], added: [2] }, true)).map((item) => item.label)).toEqual(['Unstage 2 lines'])
  })

  it('stages what was picked in the diff that was shown, then reloads', async () => {
    const { presenter, requests, labels, onDone, target } = setUp()

    select(presenter, target({ removed: [], added: [2] }), 'Stage line')
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce())

    expect(labels).toEqual(['Staging lines'])
    expect(requests).toEqual([
      {
        action: 'stage',
        change: { path: 'file.txt', oldPath: null, status: 'modified' },
        shownDiff: 'the diff',
        options: { fullFile: false },
        selection: { removed: [], added: [2] }
      }
    ])
  })

  it('unstages from a staged diff', async () => {
    const { presenter, requests, onDone, target } = setUp()

    select(presenter, target({ removed: [], added: [2] }, true), 'Unstage line')
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce())

    expect(requests[0].action).toBe('unstage')
  })

  it('asks before discarding, and discards only once confirmed', async () => {
    const { presenter, requests, confirmations, onDone, target } = setUp()

    select(presenter, target({ removed: [], added: [2, 3] }), 'Discard 2 lines')
    expect(requests).toEqual([])
    expect(confirmations[0].title).toBe('Discard 2 lines in file.txt?')

    confirmations[0].confirm()
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce())

    expect(requests[0].action).toBe('discard')
  })

  it('reloads after a refusal too, to show why the lines moved', async () => {
    const { presenter, errors, onDone, target } = setUp(new Error('file.txt changed since this diff was shown'))

    select(presenter, target({ removed: [], added: [2] }), 'Stage line')
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledOnce())

    expect(errors).toEqual(['file.txt changed since this diff was shown'])
  })
})
