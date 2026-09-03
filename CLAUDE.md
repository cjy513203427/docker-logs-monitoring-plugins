# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Logs Console" — a Docker Desktop extension: a multi-tab, split-screen
viewer for `docker logs`. Logs are rendered with xterm.js using raw
`docker logs` byte output (no custom table/JSON pretty-printing), so the
UI looks like running `docker logs -f` in a real terminal. Docker's own
**Logs Explorer** extension (`docker/logs-explorer-extension`, often
installed alongside this one) takes the opposite approach — a merged
data-grid table with no ANSI interpretation — which is why this project
exists as a separate thing rather than a PR against it.

The extension has **no backend/VM** — the UI talks to Docker almost
entirely through `ddClient.docker.cli.exec` (the Docker Desktop extension
API), which shells out to the `docker` CLI already present on the host.
The one exception is `ddClient.extension.host.cli.exec`, used to run a
small per-OS cleanup binary (see "Host binaries" below).

## Commands

All build/install commands run from the repo root (`make` wraps plain
`docker`/`docker extension` calls — see `Makefile`):

```sh
make install     # docker build + docker extension install --force
make update       # rebuild and update the already-installed extension
make remove       # docker extension rm
make validate     # docker build + docker extension validate
```

Hot-reload development loop:

```sh
cd ui && npm install && npm run dev   # Vite dev server on :3000
make dev-ui                            # point the installed extension's UI at that dev server
make dev-debug                         # open Chrome devtools for the extension UI
make reset-dev                         # stop pointing at the dev server, go back to built assets
```

UI-only commands (run from `ui/`):

```sh
npm run build     # tsc && vite build -> ui/dist
npm run preview   # preview a production build
```

There is no test suite and no lint script configured in `ui/package.json`.
Feature work in this repo has instead been verified with disposable
Playwright scripts run against `ui/dist` with a mocked `window.ddClient`
(see the `## Gotchas` entries below for what that caught) — there's no
harness for this checked in, but it's the pattern to reach for.

### Requirements

- Docker Desktop with the `docker extension` CLI.
- Node.js 18+ for building the UI.
- Docker Desktop must actually be running with the extension **reinstalled**
  (`docker extension update ... --force`, not just a rebuilt image) to see
  changes — an already-open panel does not reliably reload on its own; if
  it still looks stale after that, use `make dev-ui` to point it at a live
  Vite dev server instead, which forces a real navigation.

## Architecture

Everything lives under `ui/src/`. The extension is a single React app
(`main.tsx` -> `components/App.tsx`).

- **`api/`** — the only boundary that touches Docker.
  - `docker.ts` exports `ddClient`. It is **lazy**, not an eager
    `createDockerDesktopClient()` call at module scope: that throws
    synchronously if `window.ddClient` isn't set yet, and calling it at
    import time meant the throw happened before React ever mounted
    anything, blanking the whole panel with zero on-screen error. `ddClient`
    is a `Proxy` that only calls `createDockerDesktopClient()` on first
    actual property access (from inside a React effect/handler, well after
    mount) — see the git history around the theme-provider/blank-panel bugs
    for the full story.
  - `containers.ts`:
    - `listContainers()` — runs `docker ps --all --format`. **The format
      string must stay wrapped in literal quotes** (`'"{{json .}}"'`, not
      `'{{json .}}'`) — `{{json .}}` contains a space, and dropping the
      quotes reliably broke container listing against the real Docker
      Desktop (confirmed by hand), even though Docker's own Logs Explorer
      extension uses the unquoted form for its (different) `docker events`
      call. Don't "clean this up" without reverifying against the actual
      installed extension — a mocked `ddClient` in a test script can't
      catch this class of bug since it doesn't care what args were passed.
      Also parses the container's `Labels` string (comma-joined
      `key=value` pairs, not JSON) to pull out
      `com.docker.compose.project` for sidebar grouping.
    - `watchContainerEvents()` — streams `docker events` (same quoting
      caveat) instead of polling `docker ps` on a timer, so the sidebar
      reacts within milliseconds of a container starting/stopping. Every
      event triggers a `listContainers()` refresh in `ContainerPicker`,
      which also dispatches `SYNC_CONTAINERS` (see `state/layout.ts`) to
      reconcile already-open tabs against the fresh list.
    - `startLogStream(containerId, { timestamps, tail }, onChunk, onClose)`
      — runs `docker logs -f` with `stream: {...}`. **Important:** when
      `stream` is passed, `ddClient.docker.cli.exec` returns an
      `ExecProcess` synchronously, not a `Promise` — it must not be
      awaited. Callers get back a handle and **must call `.close()`** when
      a tab/pane closes, or the follow process leaks for the lifetime of
      the extension. Output is streamed through untouched
      (`splitOutputLines: false`) so it can feed xterm.js byte-for-byte.
      `tail` is caller-controlled (500 / 5000 / "all", see
      `TabState.tailLines`), not hardcoded.
    - `cleanupOrphanedLogStreams()` — every `startLogStream` call records
      its containerId in `localStorage`; this function (called once from
      `main.tsx` on startup) reads whatever's left over from a previous,
      uncleanly-terminated session, clears the bookkeeping, and asks the
      host binary to kill any matching orphaned processes. See "Host
      binaries" below for the actual kill mechanism.

- **`state/layout.ts`** — a single `useReducer` reducer (`layoutReducer`)
  that owns the whole split-screen/tab model, held in `App.tsx`. Key shape
  (see `types.ts`): `LayoutState` has a `PaneLayout`
  ("1"/"2h"/"2v"/"2x2"/"3x2"/"3x3"), a list of `PaneState` (each with its
  own `tabs`, `activeTabId`, and `viewMode: "tabs" | "merged"`), and a
  `focusedPaneId` — new tabs from the container picker (click or drag) open
  into whichever pane is focused. Changing `SET_LAYOUT` to a smaller pane
  count merges the overflow panes' tabs into the last remaining pane rather
  than dropping them; growing adds empty panes. Both are pane-*count*
  driven, not layout-name driven, so adding another grid size is just
  another `PANE_COUNT` entry. Tab identity (`TabState.id`) is distinct from
  `containerId` so the same container can be opened in more than one pane
  at once. `CYCLE_TAB` (Ctrl+Tab) moves `activeTabId` forward/back within
  one pane's tabs, wrapping around.
  `SYNC_CONTAINERS` (dispatched from `ContainerPicker` on every refresh —
  event-driven or manual) reconciles open tabs against a fresh container
  list so a tab's log stream doesn't silently go stale: if the same
  `containerId` transitions from not-running back to running, it bumps
  `TabState.streamEpoch` to force a reconnect (`docker logs -f` doesn't
  reliably resume on its own across a same-id restart); if a tab's
  `containerId` has disappeared but a container with the same `name` exists
  under a *different* id (a recreate, e.g. a Compose redeploy or a
  health-check-driven recreation — Docker names are unique host-wide so this
  is unambiguous), it rebinds the tab to the new id. See the Gotchas entry
  below.

- **`components/`**
  - `App.tsx` — top bar (title, Tips, layout picker) and the two-column
    body (`ContainerPicker` sidebar + `PaneGrid`). Also owns the
    Ctrl+Tab/Ctrl+Shift+Tab `keydown` listener — see the xterm.js gotcha
    below for why it's capture-phase and calls `stopPropagation()`.
  - `ContainerPicker.tsx` — sidebar list of containers (via
    `listContainers()` + `watchContainerEvents()`), grouped by
    `composeProject` into collapsible sections, filterable by text and by
    All/Running/Stopped. Opening a container (click, or drag onto a pane —
    see `LogPane.tsx`) dispatches `OPEN_TAB`. Its `refresh()` (mount, the
    manual Refresh button, and every container event) also dispatches
    `SYNC_CONTAINERS` with the fresh list — see `state/layout.ts`.
  - `PaneGrid.tsx` — resolves `state.layout` to nested `Allotment` splits
    via a shared `renderGrid(rows, cols, pane)` helper (2x2/3x2/3x3 are all
    the same shape, just different dimensions). **Every top-level
    `Allotment` needs `key={state.layout}`.** Two different layouts can
    render an `<Allotment>` at the same JSX position with a different
    `vertical` prop (e.g. "2h" horizontal vs. "2x2" vertical); without a
    key React reconciles that as updating the *same* Allotment instance in
    place, and Allotment's internal split-view sizing engine doesn't
    correctly recompute for a live orientation flip on an already-mounted
    instance — one row silently collapses to 0 height, permanently (not a
    timing issue; waiting longer or firing a `resize` event doesn't fix
    it). The key forces a fresh mount with freshly-computed sizing on every
    layout change.
  - `LogPane.tsx` — per-pane tab strip + toolbar. In `"tabs"` mode it's a
    normal MUI `Tabs`/`Tab` strip; in `"merged"` mode the strip becomes a
    row of colored, removable `Chip`s instead (`Tabs` implies one selected
    tab, which is meaningless once the content below is every tab merged
    together). Also the drop target for dragging a container from the
    sidebar (`CONTAINER_DRAG_MIME_TYPE`, defined in `types.ts`) directly
    onto a specific pane — uses a drag-depth counter, not a boolean, since
    `dragenter`/`dragleave` fire for every child element crossed too.
    Right-clicking a tab (or clicking its "last N" chip) opens the
    tail-length menu (`SET_TAIL_LINES`).
  - `MergedLogView.tsx` — combines every tab open in a pane into one
    chronologically-interleaved, per-container-colored stream (shared
    color hash in `utils/colors.ts`, also used for the merged-mode Chips in
    `LogPane.tsx`). This is the one place that intentionally breaks from
    "raw bytes only": it always requests `--timestamps` (needed to sort
    across containers) and strips ANSI escapes (renders into plain React
    text, not a terminal). The default per-tab `XtermLog` view is
    untouched and stays byte-for-byte raw — merged mode is a deliberately
    separate, opt-in path. Not gated by Compose project; any tabs open in
    the pane can be merged regardless of which project(s) they belong to.
  - `XtermLog.tsx` — one xterm.js instance per open tab
    (`disableStdin: true`, no custom `theme`), fed by `startLogStream()`.
    Restarts its stream when `containerId`, `timestamps`, `tailLines`, or
    `streamEpoch` (the `SYNC_CONTAINERS` forced-reconnect signal) change.
    `MergedLogView.tsx` folds the same four into its own per-tab restart key
    independently — it doesn't share this effect.
  - `ErrorBoundary.tsx` — wraps `<App />` in `main.tsx`. Exists because
    this extension has hit two separate "exception during render blanks
    the entire panel with zero visible error" bugs (the theme provider, and
    the eager `ddClient` access) — this turns any future one into a
    visible on-screen message instead of a silent blank panel.
  - `Tips.tsx` — in-app help dialog (💡 button in the top bar) documenting
    the features that have no other discovery path (drag-to-pane,
    Ctrl+Tab, the tail-length chip, merged view).

## Host binaries

`host/{windows,darwin,linux}/kill-orphaned-logs.{cmd,sh}` are declared in
`metadata.json` under `host.binaries` and copied into the image root by the
`Dockerfile` (`COPY host/ /`). They're invoked via
`ddClient.extension.host.cli.exec(binary, containerIds)` from
`cleanupOrphanedLogStreams()` (see `containers.ts` above). Each script only
ever matches a *specific* container ID passed in by the caller, combined
with "docker" and "logs" both appearing in the command line — never a bare
`docker logs` pattern — so a user's own unrelated `docker logs -f` session
in a separate terminal is never touched. (Docker's own Logs Explorer
extension does the equivalent with a much broader `wmic ... CommandLine
Like '%logs --follow --timestamp%'` match, which is both more collateral-
damage-prone and relies on `wmic`, which is deprecated/being removed on
current Windows — don't copy that pattern.) The darwin/linux script is
code-reviewed but has not been run against a real Mac/Linux machine or a
genuine crash-with-active-streams scenario — treat it as unverified if
touching it.

## Gotchas (don't rediscover these)

- **`@docker/docker-mui-theme` is not a dependency.** It was removed
  entirely — its `DockerMuiThemeProvider` reads a theme palette off
  `window.__ddMuiV5Themes`, a global Docker Desktop doesn't reliably
  inject, and throws `Cannot read properties of undefined (reading
  'light')` on first render when it's missing. `main.tsx` builds the
  light/dark theme locally instead (`createTheme` +
  `useMediaQuery('(prefers-color-scheme: dark)')`).
- **`ui/vite.config.ts` sets `base: "./"`.** Docker Desktop loads the built
  extension UI via a `file://` URL, not an HTTP server. The Vite default
  (`/assets/...`, root-absolute) resolves against the filesystem root under
  `file://` (e.g. `C:\assets\`) instead of `index.html`'s own directory, so
  every asset 404s and the panel is blank. Relative paths resolve
  correctly under both `file://` and the Vite dev server.
- **xterm.js swallows a bare `Tab` keydown**, Ctrl held or not, via a
  capture-phase listener on its own hidden textarea (`cancel()` calls
  `preventDefault()` + `stopPropagation()` unconditionally for keyCode 9
  unless Shift is held). Any future global keyboard shortcut that uses Tab
  needs its own listener registered on the *capture* phase
  (`addEventListener(..., true)`) to win the race against a focused
  terminal - see the Ctrl+Tab listener in `App.tsx`.
- **An open tab's `docker logs -f` process does not track its container
  across a restart or recreation on its own — it's bound to a fixed
  container ID for the tab's whole lifetime** (`OPEN_TAB` sets
  `TabState.containerId` once; nothing updated it before `SYNC_CONTAINERS`
  existed). Two concrete failure modes this caused, both reported as "some
  logs just don't show up" from real usage against InterSystems IRIS
  containers, which in practice get restarted/recreated more often than
  most: (1) the *same* container id stops and starts again — the existing
  `docker logs -f` process for that id does not reliably resume emitting new
  output on its own, so the tab goes silently quiet; (2) the container gets
  *recreated* (removed, new one started under the same name — a Compose
  redeploy, a health-check-driven recreate) — the tab keeps following the
  now-dead old id forever. Neither case produced any visible error; the tab
  just looked normal and stopped updating. `SYNC_CONTAINERS` in
  `state/layout.ts` fixes both by reconciling every open tab against each
  fresh container list from `ContainerPicker`'s refresh (which already runs
  on every `docker events` tick — see `watchContainerEvents()`). Don't
  "simplify away" that reconciliation call thinking `watchContainerEvents`
  alone (which only updates the sidebar) is sufficient — it isn't, that was
  the original bug.
- **A render crash before first mount looks identical to "nothing
  happened".** Both the theme-provider bug and the eager-`ddClient` bug
  produced a totally blank panel with no console output visible anywhere
  in Docker Desktop's normal UI - the only way either was actually
  diagnosed was `docker extension dev debug` (opens real Chrome DevTools
  for the panel) plus `docker extension dev ui-source ... http://localhost:PORT`
  (points the *already-installed* extension at a live Vite dev server,
  which reliably forces a fresh navigation - reinstalling via
  `docker extension update` does not reliably do this on its own for a
  panel that's already open).
