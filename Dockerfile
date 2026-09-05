FROM --platform=$BUILDPLATFORM node:20-alpine AS client-builder
WORKDIR /ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci
COPY ui .
RUN npm run build

FROM alpine
# The full label set the Marketplace requires (docs.docker.com/extensions/
# extensions-sdk/extensions/labels/). All of these except `additional-urls`
# and `categories` are *required* - `docker extension validate` fails the
# image without them, and the submission bot runs exactly that check.
# `changelog` describes the current version only, so it gets bumped every
# release along with TAG (see push_workflow/PUBLISHING.md).
# The icon/screenshot URLs point at raw.githubusercontent.com on `main`,
# which serves them as image/svg+xml and image/png (verified with curl -I -
# a wrong content type would leave the listing with a broken image).
# The two JSON-valued labels are wrapped in single quotes so the JSON's own
# double quotes survive, which means their text has to stay apostrophe-free
# ("three containers logs", not "three containers' logs") - an apostrophe
# closes the value early and the JSON silently stops parsing.
LABEL org.opencontainers.image.title="Logs Console" \
    org.opencontainers.image.description="Multi-tab, split-screen Docker container logs viewer with a native terminal (xterm.js) log view." \
    org.opencontainers.image.vendor="Jinyao Chen" \
    com.docker.desktop.extension.api.version="0.3.4" \
    com.docker.desktop.extension.icon="https://raw.githubusercontent.com/cjy513203427/docker-logs-monitoring-plugins/main/icon.svg" \
    com.docker.extension.screenshots='[{"alt":"Four containers open side by side in a 2x2 split, with the Compose-grouped container sidebar on the left","url":"https://raw.githubusercontent.com/cjy513203427/docker-logs-monitoring-plugins/main/docs/screenshots/split-view.png"},{"alt":"Merged view interleaving logs from three containers by timestamp, one color per container","url":"https://raw.githubusercontent.com/cjy513203427/docker-logs-monitoring-plugins/main/docs/screenshots/merged-view.png"},{"alt":"The in-app Tips dialog listing keyboard shortcuts and drag-to-pane usage","url":"https://raw.githubusercontent.com/cjy513203427/docker-logs-monitoring-plugins/main/docs/screenshots/tips.png"}]' \
    com.docker.extension.detailed-description="<h2>Logs Console</h2><p>A multi-tab, split-screen viewer for <code>docker logs</code>. Open several containers at once, side by side, instead of tab-switching between them one at a time.</p><h3>Features</h3><ul><li><strong>Split-screen panes</strong> - 1 / 2 (left-right or top-bottom) / 2x2 / 3x2 / 3x3, resizable by dragging the dividers.</li><li><strong>Native terminal rendering</strong> - logs are drawn with xterm.js from raw <code>docker logs</code> output, so ANSI colors and progress output look exactly like <code>docker logs -f</code> in a real terminal. No table, no JSON pretty-printing, no recoloring.</li><li><strong>Merged view</strong> - combine every tab in a pane into one chronologically interleaved, per-container-colored stream, for correlating what several services were doing at the same moment.</li><li><strong>Compose-aware sidebar</strong> - containers group by Compose project, filter by name or by All/Running/Stopped, and update live off <code>docker events</code> rather than polling.</li><li><strong>Drag a container onto any pane</strong> to open it there directly.</li><li><strong>Saved workspaces</strong> - name and switch between whole arrangements (grid, divider positions, open containers). Everything survives leaving the extension tab and coming back.</li><li><strong>Search in a pane</strong> with Ctrl+F, match highlighting, a current/total counter, and scrollbar marks for off-screen hits.</li><li><strong>Per-tab tail length</strong> - last 500 / 5000 / all lines, and a timestamps toggle.</li></ul><h3>Notes</h3><p>The extension has no backend container or VM: it shells out to the <code>docker</code> CLI already on your machine through the Docker Desktop extension API. Nothing is sent anywhere.</p>" \
    com.docker.extension.publisher-url="https://github.com/cjy513203427/docker-logs-monitoring-plugins" \
    com.docker.extension.additional-urls='[{"title":"Source code","url":"https://github.com/cjy513203427/docker-logs-monitoring-plugins"},{"title":"Report an issue","url":"https://github.com/cjy513203427/docker-logs-monitoring-plugins/issues"},{"title":"Changelog","url":"https://github.com/cjy513203427/docker-logs-monitoring-plugins/blob/main/CHANGELOG.md"}]' \
    com.docker.extension.changelog="<h3>0.4.1</h3><p>Packaging only - no functional changes to the extension itself.</p><ul><li><strong>Fixed: the published image was amd64-only and could not be installed on Apple Silicon at all.</strong> Releases are now built for <code>linux/amd64</code> and <code>linux/arm64</code>.</li><li>Added the full set of image labels Docker requires of a Marketplace extension.</li></ul><h3>0.4.0</h3><ul><li><strong>Saved workspaces</strong>: name whole arrangements - grid, divider positions and which containers are open where - and switch between them.</li><li><strong>Divider positions are remembered</strong>, keyed per grid shape and stored as ratios, so a split saved on a wide monitor comes back correct on a narrow one.</li><li><strong>Search highlights every match</strong>, with a current/total counter, prev/next buttons and scrollbar marks for matches outside the viewport.</li><li><strong>Fixed</strong>: leaving the extension tab and coming back no longer resets everything to zero - the whole workspace now persists and is restored.</li><li><strong>Fixed</strong>: search silently highlighted nothing (xterm.js decorations need <code>allowProposedApi</code>).</li><li><strong>Fixed</strong>: restored tabs could have their own log streams killed by the startup orphan sweep moments after opening.</li></ul>" \
    com.docker.extension.categories="utility-tools"

COPY metadata.json .
COPY icon.svg .
COPY host/ /
RUN chmod +x /darwin/kill-orphaned-logs.sh /linux/kill-orphaned-logs.sh
COPY --from=client-builder /ui/dist ui
