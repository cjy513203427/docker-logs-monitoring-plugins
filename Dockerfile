FROM --platform=$BUILDPLATFORM node:20-alpine AS client-builder
WORKDIR /ui
COPY ui/package.json ui/package-lock.json* ./
RUN npm ci
COPY ui .
RUN npm run build

FROM alpine
LABEL org.opencontainers.image.title="Logs Console" \
    org.opencontainers.image.description="Multi-tab, split-screen Docker container logs viewer with a native terminal (xterm.js) log view." \
    org.opencontainers.image.vendor="local" \
    com.docker.desktop.extension.api.version="0.3.4" \
    com.docker.extension.categories="utility-tools"

COPY metadata.json .
COPY icon.svg .
COPY --from=client-builder /ui/dist ui
