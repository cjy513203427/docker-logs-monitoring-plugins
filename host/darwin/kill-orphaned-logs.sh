#!/bin/sh
# Kills any orphaned `docker logs -f <id>` processes left running from a
# *previous*, uncleanly-terminated session of this extension's UI (e.g. the
# panel's script crashed before a single React effect cleanup could run).
#
# Only ever matches a specific container ID the extension itself passes in
# (see cleanupOrphanedLogStreams() in ui/src/api/containers.ts) combined with
# "docker" and "logs" both appearing earlier in the command line - never a
# bare "docker logs" pattern - so a user's own unrelated `docker logs -f`
# session in a separate terminal is never touched.
for id in "$@"; do
  [ -n "$id" ] || continue
  pkill -f "docker.*logs.*$id" 2>/dev/null || true
done
exit 0
