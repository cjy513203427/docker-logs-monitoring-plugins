# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); this project
doesn't (yet) follow strict semantic versioning guarantees - it's pre-1.0.

## [0.3.0]

### Fixed
- **Log tabs going silently stale**: an open tab's `docker logs -f` stream
  was bound to a fixed container ID for its whole lifetime and never
  reconnected. Two real failure modes this caused (both surfaced testing
  against InterSystems IRIS containers, which get restarted/recreated more
  than most): a container stopping and starting again under the *same* id
  wouldn't resume emitting output, and a container getting *recreated*
  (removed, new one started under the same name - a Compose redeploy, a
  health-check-driven recreate) left the tab following the now-dead old id
  forever. Neither case showed any visible error. Fixed by reconciling
  every open tab against each fresh container list (`SYNC_CONTAINERS`):
  forces a reconnect on a same-id restart, and rebinds the tab to the new
  id when a same-named container replaces the old one.
- `make update` deleted the installed extension and then failed outright
  (`docker extension update` tries to *pull* the locally-built image from a
  registry instead of using the one `docker build` already produced) -
  changed to `docker extension install --force`, same as `make install`.

### Added
- **Ctrl+F / Cmd+F** jumps straight to the focused pane's "Find in log" box
  instead of the browser's own find - needed its own capture-phase
  listener for the same reason Ctrl+Tab does (xterm.js's hidden textarea
  swallows a plain `Ctrl`/`Cmd`+letter reaching a focused terminal,
  regardless of `disableStdin`). Shift+Enter in that box now also jumps to
  the previous match, not just Enter for the next.

## [0.2.0]

### Added
- Terminal color theme picker (palette icon in the top bar): Classic (xterm
  default), Soft Dark, and Solarized Dark (official published palette
  values). Switches live, without disrupting an active log stream. Applies
  to the merged view's background too, for consistency within a pane -
  except under Classic, which is specifically an xterm.js terminal-fidelity
  default that doesn't apply there.

## [0.1.0]

First tagged release.

### Fixed
Several bugs that blanked the entire panel with no visible error, all
confirmed against the real installed extension (not just in isolated
testing):
- `DockerMuiThemeProvider` crashed on `window.__ddMuiV5Themes` being
  unset; replaced with a locally-built MUI theme.
- `createDockerDesktopClient()` was called eagerly at module load and threw
  before React could mount anything; `ddClient` is now a lazily-initialized
  `Proxy`.
- Vite's default root-absolute asset paths 404 under the `file://` protocol
  Docker Desktop actually loads the built UI with; now builds with
  `base: "./"`.
- `docker ps`/`docker events --format` strings must stay wrapped in literal
  quotes or container listing silently breaks against the real Desktop
  backend.
- Allotment (resizable splits) silently collapsed a row to 0 height when
  the layout changed orientation on an already-mounted instance; fixed
  with `key={state.layout}` on every top-level Allotment.
- Added an `ErrorBoundary` so any future render crash shows an on-screen
  error instead of a silent blank panel.

### Added
- **Merged log view** - combine a pane's open tabs into one time-ordered,
  per-container-colored stream, across Compose projects or not.
- **Compose-project grouping** and Running/Stopped filter in the sidebar.
- **Event-driven container list** (`docker events`) instead of polling.
- **Per-tab configurable log history** (500 / 5,000 / full), click-to-change
  via a chip in the tab toolbar or right-click on the tab.
- **Drag a container** from the sidebar directly onto a pane to open it
  there.
- **Ctrl+Tab / Ctrl+Shift+Tab** cycles tabs in the focused pane.
- **3x2 / 3x3 grid layouts** for large monitors, alongside 1 / 2h / 2v / 2x2.
- **Host binary** that cleans up `docker logs -f` processes orphaned by an
  unclean shutdown, scoped to specific container IDs only (never a broad
  `docker logs` pattern, unlike some other extensions' approach to the same
  problem).
- **In-app Tips dialog**.

### Verified
Compatible with plain `docker run` containers, Compose-managed containers
(including several from different projects merged into one view at once),
and Kubernetes-labeled containers (`io.kubernetes.*` labels) - Docker
Desktop's own `docker ps`/Engine API already filters out pod-sandbox/pause
containers before any client sees them, so no special-casing was needed on
this project's side.
