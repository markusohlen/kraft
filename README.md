# Kraft

A desktop Git client with a commit graph, auto-stash, Gitflow, Jira integration and a merge tool for picking what to keep from each side of a conflict.

## Getting started

1. Download the installer for your system from the [Releases](https://github.com/markusohlen/kraft/releases) page: `.exe` for Windows, `.dmg` for macOS, `.AppImage` for Linux.
   The builds aren't code-signed yet, so Windows SmartScreen and macOS Gatekeeper will warn the first time you open Kraft.
2. Open Kraft and choose **Open a repository**, or **Scan a folder for repositories** to add every repository below a folder at once.
3. Each repository gets a tab. Kraft reopens the last one you used on startup.

Kraft uses the `git` installed on your computer, so your existing config, credentials and SSH keys just work.

Kraft **updates itself** on Windows and as an AppImage on Linux: it checks for a new release when it starts and every few hours, downloads it in the background and installs it when you restart (or click **Restart to update** in the tab bar). **Settings → Updates** shows the version and lets you check now. The macOS build isn't signed yet, so it can't update itself; download new versions from the Releases page.

## Features

### Tabs and folders

- Every saved repository is a tab along the top. Click **+** to open another repository or scan a folder.
- Group tabs into **folders**: right-click a tab and choose **Move to new folder…**, or drag tabs onto an existing folder. Click a folder to show its repositories.
- Right-click a tab or folder to rename it or remove it. Removing only takes it off the tab bar; the files on disk are kept.

### Scanning for repositories

**Scan a folder for repositories…** (under **+**, or on the welcome screen) searches a folder and everything below it for Git repositories. Tick the ones you want and, if you like, put them straight into a new folder. Repositories you've already saved are marked.

### Everyday Git

- **Commit graph** of all branches, remotes, tags and stashes. Shift-click a range of commits to **squash** them.
- **Working tree panel**: stage, unstage or discard single files, or Ctrl/Cmd-click and Shift-click several and act on all of them. Drag the divider above *Staged files* to resize the lists.
- **Diffs** in split or unified layout, with syntax highlighting, the changed characters marked, and an optional whole-file view. Marks along the scrollbar show where the changes are in the file.
- **Branches**: checkout (remote branches are fetched and fast-forwarded first), create, delete, merge, rebase and cherry-pick from the right-click menus.
- **Auto-stash**: when a checkout, merge, pull or cherry-pick needs a clean working tree, Kraft stashes your changes and pops them back afterwards.
- **Pull requests**: right-click a branch and choose **Create pull request**. Kraft pushes it if needed and opens the pull request page.
- **Gitflow**: initialise it from the sidebar, then start and finish features, releases and hotfixes.

### Merge conflicts

Click a conflicted file to open the **merge tool**. A (your branch) and B (the incoming changes) are shown side by side. Tick a conflict, or click single lines, to keep them. The Output pane shows the result, which you can also edit by hand. **Save** writes the file and stages it, ready to commit the merge.

### Jira

Connect Jira in **Settings → Jira** with your site address and either:

- **Jira Cloud**: your Atlassian email and an API token from *id.atlassian.com → Security → API tokens*, or
- **Jira Server / Data Center**: a personal access token.

The token is encrypted with your operating system's secure storage (such as Windows DPAPI or the macOS Keychain). Once connected:

- The sidebar lists the issues **assigned to you**. You can search for any issue, and narrow your list to chosen board columns.
- Right-click an issue to **create a branch** from it (and assign it to yourself), or start a Gitflow feature.
- When your branch name contains an issue key, such as `feature/KRA-12-login`, the issue is shown above your changes.

## Building from source

You need Node.js 22.12 or newer and Git.

```bash
npm ci
npx install-electron   # Electron's binary isn't downloaded by npm ci
npm run dev            # start Kraft with hot reload
```

Other scripts:

| Command | What it does |
|---|---|
| `npm test` | Run the tests (Vitest) |
| `npm run typecheck` | Type-check the project |
| `npm run dist` | Build installers for your system into `release/` |
| `npm run icon` | Render `build/icon.svg` to the `build/icon.png` the installers and window use |

Pushing a tag such as `v0.1.1` builds the installers for Windows, macOS and Linux and attaches them to a GitHub release, together with the `latest*.yml` files installed copies read to update themselves. Bump `version` in `package.json` to match the tag, or installed copies won't see the release as newer.
