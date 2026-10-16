---
name: run-kraft
description: Build, start, run and drive the Kraft Electron Git client headless. Use when asked to start or launch Kraft, take a screenshot of its UI, click through a feature (commit graph, cherry-pick, pull request, branches, stashes, git-flow), or check a change in the running app rather than only in tests.
---

Kraft is an Electron + React desktop Git client. Agents drive it through the Playwright REPL at
`.claude/skills/run-kraft/driver.mjs`, running under `xvfb-run` inside tmux. The driver launches the
real Electron app, answers the native folder dialog, records links the app opens, and can create a
sandbox repository to click around in. All paths are relative to the repository root.

## Prerequisites

Ubuntu with `xvfb` and `tmux`. Electron's shared libraries were already present in the cloud
container; `ldd node_modules/electron/dist/electron | grep "not found"` (after Setup) lists any that are not.

```bash
apt-get install -y xvfb tmux
```

Node 22.12 or newer (Electron 44 requires it); verified with Node 22.22.

## Setup

```bash
npm ci
npx install-electron                     # Electron 44 has no postinstall; this downloads node_modules/electron/dist
npm install --no-save playwright-core@1.56.1   # the driver's only extra dependency; not in package.json
```

Run all three again after any `npm ci`: it wipes both the Electron binary and `playwright-core`.

## Build

```bash
npx electron-vite build                  # -> out/main, out/preload, out/renderer; the driver runs this build
```

Rebuild after every source change; the driver does not watch files.

## Run (agent path)

Start the driver in tmux and wait until it is ready:

```bash
rm -f /tmp/kraft-driver.log
tmux kill-session -t kraft 2>/dev/null
tmux new-session -d -s kraft -x 200 -y 50 -c "$PWD" 'xvfb-run -a node .claude/skills/run-kraft/driver.mjs'
timeout 30 bash -c 'until grep -q "driver ready" /tmp/kraft-driver.log 2>/dev/null; do sleep 0.2; done'
```

Send commands with this helper. It types one command into the REPL, waits for the driver to log
`=== end ===` and prints that command's output. Shell functions don't persist between tool calls, so
define it in every Bash call that uses it:

```bash
kraft() {
  local start=$(wc -l < /tmp/kraft-driver.log)
  tmux send-keys -t kraft -l "$*"; tmux send-keys -t kraft Enter
  timeout 90 bash -c "until tail -n +$((start + 1)) /tmp/kraft-driver.log | grep -q '^=== end ===\$'; do sleep 0.2; done"
  tail -n +$((start + 1)) /tmp/kraft-driver.log | grep -v '^=== end ===$'
}
```

A full flow — open a sandbox repository, cherry-pick a commit, create a pull request:

```bash
rm -rf /tmp/kraft-demo
kraft launch
kraft make-demo /tmp/kraft-demo
kraft open-repo /tmp/kraft-demo/demo
kraft ss 01-graph
kraft right-click-row Fix string addition
kraft click-text Cherry pick commit
kraft idle
kraft toasts                             # ["Cherry-picked 59d6825 onto main"] (sha varies)
kraft right-click-branch login
kraft click-text Create pull request from feature/login
kraft text .modal
kraft click-text Create pull request
kraft idle
kraft toasts
kraft links                              # ["https://github.com/acme/widgets/compare/main...feature/login?expand=1"]
kraft ss 02-after
kraft quit
```

Screenshots land in `/tmp/kraft-shots/` (override with `SCREENSHOT_DIR`); open them with Read and
look at them. The driver log is `/tmp/kraft-driver.log` (override with `KRAFT_DRIVER_LOG`).

| command | what it does |
|---|---|
| `launch` | starts Electron with a fresh profile and waits for the welcome screen or toolbar |
| `make-demo <dir>` | creates `<dir>/demo` (branches `main`, `release/1.0`, `feature/login`) and `<dir>/demo-server.git` |
| `open-repo <path>` | opens a repository; the native folder dialog is answered with `<path>` |
| `ss [name]` | screenshot of the window |
| `right-click-row <text>` | right-clicks the first commit-graph row containing `<text>`, prints the menu |
| `right-click-branch <text>` | right-clicks the first sidebar item containing `<text>`, prints the menu |
| `click-text <text>` | clicks the button with exactly that text, else the first containing it |
| `click <css>` / `select <value>` | clicks an element / picks an option in the open dialog's select |
| `type <text>` / `press <key>` | keyboard input |
| `idle` | waits until the busy indicator is gone (an operation finished) |
| `toasts` | prints the visible notifications |
| `links` | prints the URLs the app tried to open in a browser |
| `text [css]` / `eval <js>` | prints innerText / evaluates in the renderer |
| `sleep <ms>` / `help` | |
| `quit` | closes Kraft and exits; Xvfb and the tmux session end with it |

## Run (human path)

```bash
npx electron-vite dev --noSandbox        # dev server + Electron window with hot reload; Ctrl-C to stop
```

`npm run dev` is the same without `--noSandbox`, which crashes when run as root (see Troubleshooting).
Headless it opens nothing you can see.

## Test

```bash
npm run typecheck
npm test                                  # vitest; 159 tests in 22 files
```

Most changes touch `src/application` or `src/domain`. The tests in `test/application` run the use
cases against real throwaway git repositories (`test/application/gitTestRepository.ts`), and the
presenters in `src/renderer/src/presenters` are tested with fake views in `test/renderer`. Run one file
with `npx vitest run test/application/cherryPick.test.ts`.

## Gotchas

- **`npm ci` leaves `node_modules/electron/dist` empty.** Electron 44 downloads its binary lazily the
  first time `require('electron')` runs. Launching it by path from Playwright never triggers that,
  so run `npx install-electron` first.
- **Native dialogs can't be clicked.** Opening a repository uses `dialog.showOpenDialog`, so `open-repo`
  replaces it in the main process (`app.evaluate`) before clicking the button.
- **Links never reach a browser.** The renderer's `window.open` goes to `shell.openExternal` in the main
  process; the driver replaces that on launch and `links` lists what was opened (pull request pages,
  Jira issues).
- **Each `launch` uses a new profile** (`--user-data-dir` in `/tmp`), so saved repositories and tabs
  from earlier runs don't appear. Set `KRAFT_USER_DATA=<dir>` to keep one.
- **The demo's `origin` fetches from `git@github.com:acme/widgets.git` but pushes to the local bare
  repository** (`remote.origin.pushurl`). Push and pull requests work offline; Fetch and Pull fail.
- **The commit graph is virtualized.** Only rows near the visible area exist in the DOM, so
  `right-click-row` only finds commits that are on screen.
- **Info toasts disappear after 6 seconds.** Run `toasts` right after `idle`.
- **The driver reads commands from `process.stdin`.** Reading `/dev/stdin` through `fs.createReadStream`
  (a common trick in Electron drivers) made `quit` hang: the blocking read holds a libuv thread that
  `process.exit` waits for. Playwright gives Electron its own pipes, so `process.stdin` is safe.
- **Killing `xvfb-run` with `timeout` leaves Electron running.** Clean up with `pkill -x electron` and
  `pkill -x Xvfb`. Never `pkill -f` a pattern that is also in your own command line: it kills your
  shell (exit code 144).

## Troubleshooting

- **`FATAL ... Running as root without --no-sandbox is not supported`**: Electron as root (the cloud
  container) needs `--no-sandbox`. The driver passes it; for dev mode use `npx electron-vite dev --noSandbox`.
- **`redirector.gvt1.com:443 — connect_rejected` from the agent proxy, plus dbus and
  `CreatePlatformSocket()` errors in the log**: Chromium's component updater and desktop services
  being unavailable. Harmless; the app runs.
