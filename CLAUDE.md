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
make update       # rebuild + reinstall (also `install --force` - see the gotcha below)
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
  (`make update`, i.e. `docker extension install --force` — not just a
  rebuilt image, and *not* `docker extension update`, see the Gotchas) to
  see changes — an already-open panel does not reliably reload on its own;
  if it still looks stale after that, use `make dev-ui` to point it at a
  live Vite dev server instead, which forces a real navigation.

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
    - `cleanupOrphanedLogStreams(activeContainerIds)` — every
      `startLogStream` call records its containerId in `localStorage`; this
      function (called once from **`App.tsx`**'s mount effect, not
      `main.tsx` — it needs the restored workspace's container ids) reads
      whatever's left over from a previous, uncleanly-terminated session,
      keeps the ids still open in this session, and asks the host binary to
      kill the rest. See the Gotchas entry on why that argument is
      load-bearing, and "Host binaries" below for the kill mechanism.

- **`state/persistence.ts`** — saves and restores the workspaces. A
  *workspace* is one named `LayoutState` (grid, divider positions, open
  tabs and their settings); several are kept side by side and switched from
  the top-bar dropdown, all under the single `logs-console:layout`
  localStorage key. Everything read back is validated field-by-field and
  discarded wholesale if it doesn't fit (see the Gotchas), and the
  `SCHEMA_VERSION` 1 → 2 step *migrates* the old single-state payload into
  one workspace rather than dropping it — a schema bump must never be the
  reason someone loses their open tabs.
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
  another `GRID_DIMS` entry (`PANE_COUNT` is derived from it - rows x cols -
  and `PaneGrid` renders straight off it, so one source of truth for "what
  shape is this layout"). Tab identity (`TabState.id`) is distinct from
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
  - `WorkspacePicker.tsx` — top-bar dropdown listing the saved workspaces,
    plus new/duplicate/rename/delete. Deliberately has **no Save button**:
    edits land in the selected workspace as they happen (`App.tsx` persists
    on every state change), matching how the rest of the panel already
    behaves. Deleting the last remaining workspace is blocked — there'd be
    nothing to fall back to. `App.tsx` holds the active workspace's state
    twice on purpose (live in the reducer, stored in the `workspaces`
    array); its `snapshot()` helper folds the live one back in and every
    switch/create/delete path goes through it.
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
- **xterm.js's hidden per-terminal textarea swallows more than just Tab** -
  this generalizes past the original Tab finding below; confirmed a second
  time for Ctrl+F while wiring up the pane-search shortcut (see the Ctrl+F
  listener in `LogPane.tsx`). Reading `evaluateKeyboardEvent`'s source
  (`node_modules/@xterm/xterm/lib/xterm.js`) directly (not guessing) shows
  *any* plain `Ctrl+<A-Z>` reaching a focused terminal gets mapped to its
  control-character equivalent and unconditionally
  `preventDefault()`+`stopPropagation()`'d via `cancel(e, true)` -
  **regardless of `disableStdin: true`**, which only suppresses sending the
  resulting byte onward (`CoreService.triggerDataEvent` short-circuits on
  it), not the swallow itself. Concretely for Tab: keyCode 9, unless Shift
  is held. Any future global keyboard shortcut that's a bare Tab or a plain
  `Ctrl`/`Cmd`+letter needs its own listener registered on the *capture*
  phase (`addEventListener(..., true)`) to win the race against a focused
  terminal - see the Ctrl+Tab listener in `App.tsx` and the Ctrl+F one in
  `LogPane.tsx`.
- **xterm.js's decoration API is "proposed" and throws unless the Terminal
  is constructed with `allowProposedApi: true`.** `SearchAddon`'s
  match highlighting (the `decorations` option on
  `findNext`/`findPrevious`) draws every match via
  `terminal.registerDecoration()`, which starts with a `_checkProposedApi()`
  that throws `You must set the allowProposedApi option to true to use
  proposed API`. The throw lands inside our own keystroke/find handler, so
  `ErrorBoundary` never sees it and nothing appears on screen - search just
  silently highlights nothing and the match counter stays blank, looking
  exactly like "the new build didn't install". `tsc` cannot catch this
  (the option is optional, and addon-search's types say nothing about
  needing it), and it *shipped broken once* for precisely that reason -
  "it compiles" is not evidence that terminal-level features work. See the
  Terminal options in `XtermLog.tsx`; `overviewRulerWidth` must also be
  non-zero there or the decorations' scrollbar tick marks (which is how you
  see matches that are outside the current viewport) never render, since
  xterm only builds the overview-ruler renderer when that option is set.
- **`docker extension rm` deletes the built image too, so `rm` must come
  *before* `docker build`, not after.** It prints `Extension image
  local/docker-logs-console:0.3.0 removed` and really does drop it from the
  local daemon. The original `make update` (`update: build` + `rm` +
  `install`) therefore destroyed the image it had just built, and the
  `install` that followed fell back to trying to *pull* `local/...` -
  failing with `pull access denied` and leaving Docker Desktop with no Logs
  Console tab at all. `make update` now runs `rm`, *then* `build`, then
  `install`; don't reorder it back.
- **Neither `docker extension update` nor plain `docker extension install
  --force` alone can move an already-installed copy of this extension to a
  new local tag - confirmed by hand, not assumed.** `docker extension
  update` is "remove and re-install", and the re-install step tries to
  *pull* the image from a registry instead of using the one `docker build`
  just put in the local daemon - it errors with `pull access denied ...
  repository does not exist` **after** having already removed the
  extension, leaving Docker Desktop with no Logs Console tab at all. Trying
  `docker extension install <repo>:<newtag> --force` instead (skipping
  `update` entirely) *also* fails, with "already installed", whenever any
  tag of that repo is currently installed - `--force` only suppresses
  install's confirmation prompt, it doesn't override that check, and it
  doesn't matter that the requested tag differs from the installed one.
  The combination that actually works - `docker extension rm $(IMAGE)`
  (bare repo, no tag - removes whatever tag is currently installed) *then*
  `docker extension install $(IMAGE):$(TAG) --force` - is what `make
  update` runs. Don't "simplify" it back to just one of the two calls.
- **After changing UI code you must actually rebuild *and* reinstall before
  testing** - a panel that is already open keeps serving the JS bundle it
  loaded, and neither editing files nor `npm run build` alone changes what
  Docker Desktop serves. Fast way to tell new code from stale without
  opening devtools: the Tips dialog (the light-bulb button in the top bar)
  lists the keyboard shortcuts, so a shortcut you just added showing up
  there proves the panel is running the new bundle. The installed bundle
  lives at `%APPDATA%/Docker/extensions/local_docker-logs-console/ui/ui/assets/`
  - Vite content-hashes the filename, so grepping there is a definitive
  check of what is actually installed.
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
- **Docker Desktop destroys and rebuilds the extension UI every time you
  navigate away from its tab and back** - React remounts from scratch, so
  anything held only in component state is gone (reported as "leave the
  window, come back, and it's all back to zero"). `state/persistence.ts`
  saves the whole `LayoutState` to `localStorage` on every change and
  `App.tsx` restores it as the `useReducer` initializer. Two things that
  restore has to get right, both verified with a Playwright reload test:
  restored payloads are validated field-by-field and thrown away wholesale
  if anything is off (a `panes.length` that disagrees with `PANE_COUNT[layout]`
  makes `PaneGrid`'s positional `state.panes[index].id` throw during first
  render = blank panel, no error), and `following` is deliberately *not*
  restored, so a tab paused an hour ago doesn't come back looking like the
  empty panel this feature exists to fix.
- **The startup orphan sweep must be told which containers are already
  open, or it kills the restored tabs' own streams.** React runs child
  effects before the parent's, so every restored tab's `docker logs -f` has
  already registered itself in the `logs-console:active-streams` bookkeeping
  by the time `cleanupOrphanedLogStreams()` runs - they look exactly like
  leftovers from a crashed session, and the host binary matches on container
  id alone so it physically cannot tell a fresh stream from an orphaned one.
  Hence `cleanupOrphanedLogStreams(activeContainerIds)` and its call site in
  `App.tsx`'s mount effect (not `main.tsx` any more - App is where the
  restored state lives). Excluded ids stay in the bookkeeping because this
  session still owns them. Don't drop that argument "to simplify": the
  symptom is a restored tab that looks perfectly normal and silently never
  shows a line.
- **Allotment's `defaultSizes` are proportions, not pixels — verified, not
  assumed.** They're only ever compared against their own sum: on mount the
  React wrapper builds `descriptor: { size: sizes.reduce(sum), views }` and
  SplitView immediately calls `saveProportions()` (`size / contentSize`),
  laying out against the real container from there. So the raw pixel arrays
  `onDragEnd` hands back can be stored and replayed as-is, with no rescaling
  on our side. Confirmed with a Playwright run at three viewport widths — a
  39/61 split came back exactly 39/61 at 900, 1400 and 1920px (the only
  deviation is a pane's `minSize` floor clamping an extreme ratio on a
  narrow window, which is correct). Two things that do matter: the arrays
  must be keyed **per layout** (`LayoutState.sizes`) or 2x2's proportions
  leak into 2h's, and `defaultSizes` is read **only on mount** — restoring
  saved sizes rides on the `key={state.layout}` remount `PaneGrid` already
  does for the orientation-flip bug. A wrong-length array is not a crash but
  not harmless either: Allotment logs "Expected N children based on
  defaultSizes but found M" and silently ignores the whole array, which
  reads as "my divider positions were forgotten" — hence the length checks
  in both `persistence.ts` and `PaneGrid`.
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
