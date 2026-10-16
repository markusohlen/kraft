// REPL driver for the Kraft Electron app. Run under xvfb inside tmux; send one command per line.
// Every command's output is also appended to $KRAFT_DRIVER_LOG, followed by "=== end ===".
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as readline from 'node:readline'

const APP_DIR = path.resolve(import.meta.dirname, '../../..')
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/kraft-shots'
const LOG = process.env.KRAFT_DRIVER_LOG || '/tmp/kraft-driver.log'
fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.writeFileSync(LOG, '')

let app = null
let page = null

function log(...parts) {
  const line = parts.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join(' ')
  console.log(line)
  fs.appendFileSync(LOG, line + '\n')
}

function requirePage() {
  if (!page) throw new Error('launch first')
  return page
}

const COMMANDS = {
  async launch() {
    if (app) return log('already launched')
    // A fresh profile each launch, so saved repositories and tabs from earlier runs don't show up.
    const userData = process.env.KRAFT_USER_DATA || fs.mkdtempSync(path.join(os.tmpdir(), 'kraft-user-data-'))
    app = await electron.launch({
      executablePath: path.join(APP_DIR, 'node_modules/electron/dist/electron'),
      args: ['--no-sandbox', `--user-data-dir=${userData}`, APP_DIR],
      timeout: 30_000
    })
    // Headless there is no system browser: links the app opens are recorded for `links` instead.
    await app.evaluate(({ shell }) => {
      globalThis.__openedLinks = []
      shell.openExternal = async (url) => void globalThis.__openedLinks.push(url)
    })
    page = await app.firstWindow()
    await page.waitForSelector('.welcome, .toolbar', { timeout: 20_000 })
    log('launched:', page.url(), 'user data:', userData)
  },

  /** Creates a sandbox repository with branches and a GitHub-looking origin that pushes to a local bare repo. */
  'make-demo'(dir) {
    const root = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'kraft-demo-'))
    const repo = path.join(root, 'demo')
    const server = path.join(root, 'demo-server.git')
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' })
    const write = (file, content) => fs.writeFileSync(path.join(repo, file), content)
    const commit = (message, author = 'Ada Lovelace <ada@example.com>') => git(repo, 'commit', '-qam', message, `--author=${author}`)
    const grace = 'Grace Hopper <grace@example.com>'
    if (fs.existsSync(repo)) throw new Error(`${repo} already exists; remove it or pass another folder`)
    fs.mkdirSync(repo, { recursive: true })
    git(root, 'init', '-q', '--bare', '-b', 'main', server)
    git(repo, 'init', '-q', '-b', 'main')
    git(repo, 'config', 'user.name', 'Ada Lovelace')
    git(repo, 'config', 'user.email', 'ada@example.com')
    git(repo, 'config', 'commit.gpgsign', 'false')
    write('README.md', 'Widgets\n')
    git(repo, 'add', '.')
    commit('Initial commit')
    write('math.js', 'export const add = (a, b) => a + b\n')
    git(repo, 'add', '.')
    commit('Add math helpers')
    // Fetch URL decides the pull request page; pushes go to the local bare repository.
    git(repo, 'remote', 'add', 'origin', 'git@github.com:acme/widgets.git')
    git(repo, 'config', 'remote.origin.pushurl', server)
    git(repo, 'push', '-q', '-u', 'origin', 'main')
    git(repo, 'checkout', '-q', '-b', 'release/1.0')
    write('VERSION', '1.0.0\n')
    git(repo, 'add', '.')
    commit('Bump version to 1.0.0', grace)
    write('math.js', 'export const add = (a, b) => Number(a) + Number(b)\n')
    commit('Fix string addition in add()', grace)
    git(repo, 'push', '-q', '-u', 'origin', 'release/1.0')
    git(repo, 'checkout', '-q', 'main')
    git(repo, 'checkout', '-q', '-b', 'feature/login')
    write('login.js', 'login\n')
    git(repo, 'add', '.')
    commit('Add login form')
    write('login.js', 'login v2\n')
    commit('Validate login input')
    git(repo, 'checkout', '-q', 'main')
    write('README.md', 'Widgets\n\nA demo repository.\n')
    commit('Describe the project')
    // `upstream` really fetches from the server, where a teammate has pushed to release/1.0 since the last fetch.
    git(repo, 'remote', 'add', 'upstream', server)
    git(repo, 'fetch', '-q', 'upstream')
    const teammate = path.join(root, 'teammate')
    git(root, 'clone', '-q', '-b', 'release/1.0', server, teammate)
    fs.writeFileSync(path.join(teammate, 'CHANGELOG.md'), '1.0.0: first release\n')
    git(teammate, 'add', '.')
    git(teammate, '-c', 'user.name=Grace Hopper', '-c', 'user.email=grace@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'Add changelog')
    git(teammate, 'push', '-q', 'origin', 'release/1.0')
    log('demo:', repo, 'server:', server)
  },

  /** Opens a repository; the native folder dialog is answered with `folder`. */
  async 'open-repo'(folder) {
    requirePage()
    await app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] })
    }, path.resolve(folder))
    const clicked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) =>
        /^(Open a repository|repository)/.test(candidate.textContent.trim())
      )
      button?.click()
      return Boolean(button)
    })
    if (!clicked) return log('ERROR: no open-repository button')
    await page.waitForSelector('.toolbar', { timeout: 15_000 })
    log('opened:', await page.locator('.toolbar .toolbar-value').first().innerText())
  },

  async ss(name) {
    const file = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png')
    await requirePage().screenshot({ path: file })
    log('screenshot:', file)
  },

  /** Right-clicks the first graph row containing `text` and lists the context menu. */
  async 'right-click-row'(text) {
    await requirePage().locator('.graph-row', { hasText: text }).first().click({ button: 'right' })
    log('menu:', await page.locator('.context-item').allTextContents())
  },

  /** Right-clicks the first sidebar item (branch, stash) containing `text` and lists the context menu. */
  async 'right-click-branch'(text) {
    await requirePage().locator('.sidebar-item', { hasText: text }).first().click({ button: 'right' })
    log('menu:', await page.locator('.context-item').allTextContents())
  },

  /** Double-clicks the sidebar branch whose full name is `name` (e.g. `upstream/release/1.0`), which checks it out. */
  async 'dblclick-branch'(name) {
    const found = await requirePage().evaluate((wanted) => {
      const item = [...document.querySelectorAll('.sidebar-item')].find((element) => element.title.split('\n')[0] === wanted)
      item?.setAttribute('data-driver-target', '')
      return Boolean(item)
    }, name)
    if (!found) return log('ERROR: no sidebar branch', name)
    await page.locator('[data-driver-target]').dblclick()
    await page.evaluate(() => document.querySelector('[data-driver-target]')?.removeAttribute('data-driver-target'))
    log('double-clicked', name)
  },

  /** Clicks the button whose text is `text` (exact match first, then containing). */
  async 'click-text'(text) {
    const result = await requirePage().evaluate((wanted) => {
      const buttons = [...document.querySelectorAll('button, a, [role="button"]')]
      const button =
        buttons.find((candidate) => candidate.textContent?.trim() === wanted) ?? buttons.find((candidate) => candidate.textContent?.includes(wanted))
      button?.click()
      return button ? 'OK' : 'NOT_FOUND'
    }, text)
    log('click-text', text, '->', result)
  },

  async click(selector) {
    await requirePage().locator(selector).first().click()
    log('clicked', selector)
  },

  /** Picks `value` in the open dialog's select field. */
  async select(value) {
    await requirePage().locator('.modal select').selectOption(value)
    log('selected', value)
  },

  async type(text) {
    await requirePage().keyboard.type(text)
    log('typed', text)
  },

  async press(key) {
    await requirePage().keyboard.press(key)
    log('pressed', key)
  },

  /** Waits for the busy indicator to go away, so an operation's result is on screen. */
  async idle() {
    await requirePage().waitForSelector('.busy-indicator', { state: 'detached', timeout: 60_000 })
    log('idle')
  },

  async toasts() {
    log(await requirePage().locator('.toast-text').allTextContents())
  },

  async links() {
    if (!app) throw new Error('launch first')
    log(await app.evaluate(() => globalThis.__openedLinks))
  },

  async text(selector) {
    log(await requirePage().evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', selector || null))
  },

  async eval(expression) {
    log(await requirePage().evaluate(expression))
  },

  async sleep(ms) {
    await new Promise((resolve) => setTimeout(resolve, Number(ms) || 1000))
    log('slept', ms || 1000)
  },

  async quit() {
    if (app) await app.close().catch(() => {})
    app = null
    page = null
    log('quit')
  },

  help() {
    log('commands:', Object.keys(COMMANDS).join(', '))
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'driver> ' })
rl.on('line', async (line) => {
  const [command, ...rest] = line.trim().split(/\s+/)
  if (!command) return rl.prompt()
  const run = COMMANDS[command]
  try {
    if (run) await run(rest.join(' '))
    else log('unknown command:', command, '- try: help')
  } catch (error) {
    log('ERROR:', error.message.split('\n')[0])
  }
  fs.appendFileSync(LOG, '=== end ===\n')
  if (command === 'quit') {
    rl.close()
    process.exit(0)
  }
  rl.prompt()
})
rl.on('close', async () => {
  if (app) await app.close().catch(() => {})
  process.exit(0)
})
log('kraft driver ready - "help" for commands, "launch" to start')
rl.prompt()
