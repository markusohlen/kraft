import { describe, expect, it } from 'vitest'
import { assertValidArguments } from '../../src/ipc/ipcArgumentRules'

const fileChange = { path: 'src/a.ts', oldPath: null, status: 'modified' }

describe('IPC argument rules', () => {
  it('accepts the arguments the user interface sends', () => {
    expect(() => assertValidArguments('refresh', [])).not.toThrow()
    expect(() => assertValidArguments('commitFileDiff', ['abc123', 'src/a.ts'])).not.toThrow()
    expect(() => assertValidArguments('commitFileDiff', ['abc123', 'src/a.ts', { fullFile: true }])).not.toThrow()
    expect(() => assertValidArguments('stashFileDiff', ['abc123', { ...fileChange, status: 'untracked' }, { fullFile: false }])).not.toThrow()
    expect(() => assertValidArguments('discard', [[fileChange, { ...fileChange, status: 'untracked' }]])).not.toThrow()
    expect(() => assertValidArguments('startGitFlowBranch', ['feature', 'login'])).not.toThrow()
    expect(() => assertValidArguments('saveJiraColumnFilter', [null])).not.toThrow()
    expect(() => assertValidArguments('moveLibraryEntry', [{ kind: 'folder', id: 'f1' }, { folderId: null, before: null }])).not.toThrow()
    expect(() => assertValidArguments('addRepositories', [['C:/a', 'C:/b'], null])).not.toThrow()
    expect(() => assertValidArguments('squashCommits', [['abc123', 'def456'], 'Squashed'])).not.toThrow()
    expect(() => assertValidArguments('connectHostingAccount', [{ provider: 'azure-devops', serverUrl: 'acme', username: '', token: 't' }])).not.toThrow()
    expect(() => assertValidArguments('cloneRepository', ['https://x/y.git', 'C:/repos', 'y', { shallow: true, sparse: false }])).not.toThrow()
    expect(() => assertValidArguments('checkForUpdates', [])).not.toThrow()
  })

  it('rejects values of the wrong type', () => {
    expect(() => assertValidArguments('openRepository', [42])).toThrow('Invalid arguments for openRepository')
    expect(() => assertValidArguments('stage', ['not-an-array'])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('stashDrop', [-1])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('jiraBoardColumns', ['7'])).toThrow('Invalid arguments')
  })

  it('rejects objects of the wrong shape', () => {
    expect(() => assertValidArguments('discard', [[{ ...fileChange, status: 'exploded' }]])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('workingFileDiff', [{ path: ['a'] }, false])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('startGitFlowBranch', ['bugfix', 'x'])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('hostedRepositories', ['gitea'])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('cloneRepository', ['https://x/y.git', 'C:/repos', 'y', { shallow: 'yes', sparse: false }])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('moveLibraryEntry', [{ kind: 'folder', path: 'C:/a' }, { folderId: null, before: null }])).toThrow(
      'Invalid arguments'
    )
  })

  it('rejects missing and surplus arguments', () => {
    expect(() => assertValidArguments('createBranch', ['feature'])).toThrow('Invalid arguments')
    expect(() => assertValidArguments('refresh', ['extra'])).toThrow('Invalid arguments')
  })
})
