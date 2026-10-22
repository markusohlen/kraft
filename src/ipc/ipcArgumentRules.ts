import type { FileChangeStatus } from '../domain/entities'
import { gitFlowBranchTypes } from '../domain/gitFlow'
import type { IpcMethod } from './ipcContract'

/**
 * The renderer is the least trusted part of the app: any script running in it can call every IPC
 * method with any values. Each method's arguments are checked here, in the main process, so a value
 * of the wrong type or shape never reaches a service, git or the file system.
 */
type Rule = (value: unknown) => boolean

const isString: Rule = (value) => typeof value === 'string'
const isBoolean: Rule = (value) => typeof value === 'boolean'
const isIndex: Rule = (value) => Number.isInteger(value) && (value as number) >= 0
const optional = (rule: Rule): Rule => (value) => value === undefined || rule(value)
const nullable = (rule: Rule): Rule => (value) => value === null || rule(value)
const oneOf = (...allowed: readonly unknown[]): Rule => (value) => allowed.includes(value)
const arrayOf = (rule: Rule): Rule => (value) => Array.isArray(value) && value.every(rule)
const shape =
  (fields: Record<string, Rule>): Rule =>
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(fields).every(([key, rule]) => rule((value as Record<string, unknown>)[key]))

const fileChangeStatuses: readonly FileChangeStatus[] = ['added', 'modified', 'deleted', 'renamed', 'untracked', 'conflicted']

const diffOptions = shape({ fullFile: isBoolean })
const fileChange = shape({ path: isString, oldPath: nullable(isString), status: oneOf(...fileChangeStatuses) })
const gitFlowConfig = shape({
  mainBranch: isString,
  developBranch: isString,
  featurePrefix: isString,
  releasePrefix: isString,
  hotfixPrefix: isString,
  versionTagPrefix: isString
})
const finishGitFlowOptions = shape({ deleteBranch: isBoolean, rebaseOnDevelop: isBoolean, tagMessage: isString })
const jiraSettingsInput = shape({
  baseUrl: isString,
  deployment: oneOf('cloud', 'server'),
  email: isString,
  projectKeys: arrayOf(isString),
  token: isString
})
const jiraColumnFilter = shape({ boardId: isIndex, boardName: isString, columns: arrayOf(isString) })
const entryRef: Rule = (value) =>
  shape({ kind: oneOf('repository'), path: isString })(value) || shape({ kind: oneOf('folder'), id: isString })(value)
const libraryDestination = shape({ folderId: nullable(isString), before: nullable(entryRef) })

/** One rule per parameter; a `Record` over every method so a new method cannot be added without rules. */
const argumentRules: Record<IpcMethod, readonly Rule[]> = {
  chooseRepositoryFolder: [optional(isString)],
  openRepository: [isString],
  refresh: [],
  commitDetails: [isString],
  commitFileDiff: [isString, isString, optional(diffOptions)],
  workingFileDiff: [fileChange, isBoolean, optional(diffOptions)],
  stage: [arrayOf(isString)],
  unstage: [arrayOf(isString)],
  discard: [arrayOf(fileChange)],
  commit: [isString],
  mergeConflict: [isString],
  resolveMergeConflict: [isString, nullable(isString)],
  checkoutBranch: [isString],
  checkoutRemoteBranch: [isString],
  createBranch: [isString, isString],
  deleteBranch: [isString, isBoolean],
  mergeIntoCurrent: [isString],
  rebaseCurrentOnto: [isString],
  cherryPick: [isString],
  squashPlan: [arrayOf(isString)],
  squashCommits: [arrayOf(isString), isString],
  stash: [isString],
  stashPop: [isIndex],
  stashApply: [isIndex],
  stashDrop: [isIndex],
  fetch: [],
  pull: [],
  push: [],
  createPullRequest: [isString, isString],
  initGitFlow: [gitFlowConfig],
  startGitFlowBranch: [oneOf(...gitFlowBranchTypes), isString],
  finishGitFlowBranch: [isString, finishGitFlowOptions],

  jiraSettings: [],
  saveJiraSettings: [jiraSettingsInput],
  disconnectJira: [],
  jiraIssue: [isString],
  myOpenJiraIssues: [],
  searchJiraIssues: [isString],
  assignJiraIssueToMe: [isString],
  jiraBoards: [],
  jiraBoardColumns: [isIndex],
  saveJiraColumnFilter: [nullable(jiraColumnFilter)],

  repositoryLibrary: [],
  renameRepository: [isString, isString],
  removeRepository: [isString],
  createRepositoryFolder: [isString, optional(isString)],
  renameRepositoryFolder: [isString, isString],
  removeRepositoryFolder: [isString],
  moveLibraryEntry: [entryRef, libraryDestination],
  scanForRepositories: [isString],
  addRepositories: [arrayOf(isString), nullable(isString)]
}

export function assertValidArguments(method: IpcMethod, args: readonly unknown[]): void {
  const rules = argumentRules[method]
  const valid = args.length <= rules.length && rules.every((rule, index) => rule(args[index]))
  if (!valid) throw new Error(`Invalid arguments for ${method}`)
}
