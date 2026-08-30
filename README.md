# Logs Console — Docker Desktop Extension

A multi-tab, split-screen viewer for `docker logs`, built as a Docker Desktop
extension. It borrows its tab-per-container idea from
[maltus/docker-logs-viewer](https://github.com/maltus/docker-logs-viewer) and
its container-list-first browsing from Docker's own **Logs Explorer**
extension, but differs from both in two ways:

- **Split screen** — open several containers' logs at once, side by side, in
  a resizable 1 / 2 / 2×2 pane layout, instead of only ever tab-switching
  between them.
- **Native log rendering** — logs are rendered with [xterm.js](https://xtermjs.org/),
  the same terminal-emulator technology behind real terminals, using its
  default theme and raw `docker logs` byte output. There is no custom
  table, JSON pretty-printing, or recoloring layered on top — it looks like
  running `docker logs -f` in a terminal.

## Requirements

- Docker Desktop with the `docker extension` CLI (already installed with
  recent Docker Desktop releases).
- Node.js 18+ for building the UI.

## Build & install

```sh
make install     # builds the image and installs it into Docker Desktop
```

Then open Docker Desktop and select **Logs Console** from the left sidebar.

## Development (hot reload)

```sh
cd ui && npm install && npm run dev   # Vite dev server on :3000
make dev-ui                            # point the installed extension at it
make dev-debug                         # open devtools for the extension UI
```

Run `make reset-dev` to go back to the built assets.

## Architecture

See `ui/src/`:

- `api/` — talks to Docker only through `ddClient.docker.cli.exec` (no
  extension backend/VM is used).
- `state/layout.ts` — the pane/tab layout reducer that drives split-screen.
- `components/XtermLog.tsx` — the xterm.js log viewport (one instance per
  open tab).
- `components/PaneGrid.tsx` / `LogPane.tsx` — the resizable split-screen
  layout and per-pane tab strip.
- `components/ContainerPicker.tsx` — the sidebar container list.
