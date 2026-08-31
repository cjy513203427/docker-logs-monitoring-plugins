# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Logs Console" — a Docker Desktop extension: a multi-tab, split-screen
viewer for `docker logs`. Logs are rendered with xterm.js using raw
`docker logs` byte output (no custom table/JSON pretty-printing), so the
UI looks like running `docker logs -f` in a real terminal.

The extension has **no backend/VM** — the UI talks to Docker only through
`ddClient.docker.cli.exec` (the Docker Desktop extension API), which shells
out to the `docker` CLI already present on the host.

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

### Requirements

- Docker Desktop with the `docker extension` CLI.
- Node.js 18+ for building the UI.
- `ui/package.json` pins `@docker/docker-mui-theme` — check the installed
  version actually exists on the npm registry before bumping it; the range
  originally committed here (`^0.1.7`) does not resolve to any published
  version (latest is `0.0.13`) and breaks `npm ci` in the Docker build.

## Architecture

Everything lives under `ui/src/`. The extension is a single React app
(`main.tsx` -> `components/App.tsx`) with three layers:

- **`api/`** — the only boundary that touches Docker.
  - `docker.ts` creates and exports the single shared `ddClient`
    (`createDockerDesktopClient()`), used everywhere else in the UI.
  - `containers.ts` has two entry points:
    - `listContainers()` — runs `docker ps --all --format '"{{json .}}"'`
      and parses it with `result.parseJsonLines()`.
    - `startLogStream()` — runs `docker logs -f` with `stream: {...}`.
      **Important:** when `stream` is passed, `ddClient.docker.cli.exec`
      returns an `ExecProcess` synchronously, not a `Promise` — it must
      not be awaited. Callers get back a handle and **must call
      `.close()`** when a tab/pane closes, or the follow process leaks
      for the lifetime of the extension. Output is streamed through
      untouched (`splitOutputLines: false`) so it can feed xterm.js
      byte-for-byte.

- **`state/layout.ts`** — a single `useReducer` reducer (`layoutReducer`)
  that owns the whole split-screen/tab model, held in `App.tsx`. Key
  shape (see `types.ts`): `LayoutState` has a `PaneLayout` ("1" / "2h" /
  "2v" / "2x2"), a list of `PaneState` (each with its own `tabs` and
  `activeTabId`), and a `focusedPaneId` — new tabs from the container
  picker open into whichever pane is focused. Changing `SET_LAYOUT` to a
  smaller pane count merges the overflow panes' tabs into the last
  remaining pane rather than dropping them. Tab identity (`TabState.id`)
  is distinct from `containerId` so the same container can be opened in
  more than one pane at once.

- **`components/`**
  - `App.tsx` — top bar (title + layout picker) and the two-column body
    (`ContainerPicker` sidebar + `PaneGrid`).
  - `ContainerPicker.tsx` — sidebar list of containers (via
    `listContainers()`); opening one dispatches `OPEN_TAB` into the
    focused pane.
  - `PaneGrid.tsx` / `LogPane.tsx` — resizable split-screen grid (via
    `allotment`) and the per-pane tab strip.
  - `XtermLog.tsx` — one xterm.js instance per open tab, fed by
    `startLogStream()`.

## Docker image (`Dockerfile`)

Two-stage build: `node:20-alpine` builds `ui/` (`npm ci && npm run
build`), then the built `ui/dist` plus `metadata.json` and `icon.svg` are
copied into a plain `alpine` image. `metadata.json` declares the single
`dashboard-tab` UI entry point (title "Logs Console", `src: index.html`,
`root: ui`) that Docker Desktop loads.
