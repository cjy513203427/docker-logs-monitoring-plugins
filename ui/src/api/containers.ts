import { ddClient } from "./docker";
import type { ContainerInfo, TailLines } from "../types";

// Shape of one line of `docker ps --format "{{json .}}"` output.
interface DockerPsRow {
  ID: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
  // A single comma-joined "key=value,key2=value2" string, *not* JSON - some
  // values (e.g. compose's `depends_on`) themselves contain commas, so a
  // naive split(",") mis-parses those specific values. That's fine here:
  // we only ever look up one exact key (see parseLabels/COMPOSE_PROJECT_LABEL).
  Labels?: string;
}

const COMPOSE_PROJECT_LABEL = "com.docker.compose.project";

function parseLabels(labels: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!labels) return result;
  for (const pair of labels.split(",")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    result[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return result;
}

/** Lists all containers (running and stopped), newest first, via the same
 * `docker ps` CLI call the reference extension uses. */
export async function listContainers(): Promise<ContainerInfo[]> {
  const result = await ddClient.docker.cli.exec("ps", [
    "--all",
    "--format",
    // NB: must stay quoted - `{{json .}}` contains a space, and this is one
    // shell token; unquoted, it gets split into two args somewhere in the
    // `cli.exec` -> host round-trip and `docker ps` silently returns nothing
    // (confirmed by hand: dropping the quotes here reliably broke container
    // listing in the real Docker Desktop, even though the exact same
    // unquoted form is what Docker's own Logs Explorer extension uses for
    // its `docker events --format` call - so this is host/arg-passing
    // specific, not a universal rule; don't "clean this up" without
    // reverifying against the actual installed extension, not just a
    // mocked ddClient).
    '"{{json .}}"',
  ]);
  const rows = result.parseJsonLines() as DockerPsRow[];
  return rows.map((row) => {
    const labels = parseLabels(row.Labels);
    return {
      id: row.ID,
      name: row.Names,
      image: row.Image,
      state: row.State,
      status: row.Status,
      composeProject: labels[COMPOSE_PROJECT_LABEL] || undefined,
    };
  });
}

export interface ContainerEvent {
  status: "start" | "stop" | "die" | "kill" | "destroy";
  id: string;
}

export interface EventStreamHandle {
  close(): void;
}

/**
 * Watches `docker events` for container lifecycle changes instead of the
 * caller having to poll `docker ps` on a timer - the container list can
 * react within milliseconds of a container actually starting/stopping
 * instead of up to one poll interval later, and idles at zero cost between
 * events. Mirrors the approach Docker's own Logs Explorer extension uses.
 */
export function watchContainerEvents(
  onEvent: (event: ContainerEvent) => void,
  onError?: (error: unknown) => void,
): EventStreamHandle {
  const proc = ddClient.docker.cli.exec(
    "events",
    [
      "--filter", "type=container",
      "--filter", "event=start",
      "--filter", "event=stop",
      "--filter", "event=kill",
      "--filter", "event=die",
      "--filter", "event=destroy",
      // quoted for the same reason as listContainers()'s --format arg above
      "--format", '"{{json .}}"',
    ],
    {
      stream: {
        splitOutputLines: true,
        onOutput(data: { stdout?: string; stderr?: string }) {
          const line = (data.stdout ?? data.stderr ?? "").trim();
          if (!line) return;
          try {
            const parsed = JSON.parse(line) as { status?: string; id?: string };
            if (parsed.status && parsed.id) {
              onEvent({ status: parsed.status as ContainerEvent["status"], id: parsed.id });
            }
          } catch {
            // ignore any partial/malformed line rather than crash the watcher
          }
        },
        onError(error: unknown) {
          onError?.(error);
        },
        onClose() {
          // `docker events` itself exited (e.g. the engine restarted); the
          // caller owns deciding whether/when to start a new watch.
        },
      },
    },
  );
  return proc;
}

export type LogChunkHandler = (chunk: string) => void;

export interface LogStreamHandle {
  close(): void;
}

// Bookkeeping so an unclean shutdown (the panel's whole script crashing
// before React can run any effect cleanup, or Docker Desktop killing the
// webview outright) doesn't leak `docker logs -f` processes forever - see
// cleanupOrphanedLogStreams(). Keyed by containerId; the value is unused.
const ACTIVE_STREAMS_KEY = "logs-console:active-streams";

function readActiveStreamSet(): string[] {
  try {
    const raw = localStorage.getItem(ACTIVE_STREAMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActiveStreamSet(ids: string[]): void {
  try {
    localStorage.setItem(ACTIVE_STREAMS_KEY, JSON.stringify(ids));
  } catch {
    // best-effort only - localStorage being unavailable shouldn't break streaming
  }
}

function markStreamActive(containerId: string): void {
  const ids = readActiveStreamSet();
  if (!ids.includes(containerId)) writeActiveStreamSet([...ids, containerId]);
}

function markStreamClosed(containerId: string): void {
  writeActiveStreamSet(readActiveStreamSet().filter((id) => id !== containerId));
}

/**
 * Kills any `docker logs -f` processes left running from a *previous*,
 * uncleanly-terminated session (e.g. the panel's script crashed before a
 * single React effect cleanup could run - see ErrorBoundary/docker.ts for
 * why that's a real, not theoretical, risk here). Call this once, before
 * anything in the new session starts its own streams.
 *
 * Snapshotting-then-clearing the bookkeeping synchronously (no `await`
 * between the two) before kicking off the actual (async) kill means a
 * container reopened seconds later by the *new* session can never be mistaken
 * for one of the leftovers being cleaned up here.
 */
export async function cleanupOrphanedLogStreams(): Promise<void> {
  const leftover = readActiveStreamSet();
  writeActiveStreamSet([]);
  if (leftover.length === 0) return;

  try {
    const binary = ddClient.host.platform === "win32" ? "kill-orphaned-logs.cmd" : "kill-orphaned-logs.sh";
    await ddClient.extension.host?.cli.exec(binary, leftover);
  } catch (error) {
    // Best-effort: if the host binary isn't available or fails, the worst
    // case is a handful of stray follow processes, not a broken UI.
    console.error("cleanupOrphanedLogStreams failed", error);
  }
}

/**
 * Streams raw `docker logs -f` output for a container straight through to
 * the caller, byte for byte (no line-splitting, no stdout/stderr
 * recoloring) so it can be fed directly into an xterm.js terminal and look
 * exactly like running the command in a real shell.
 *
 * Returns a handle whose `close()` stops the underlying `docker logs -f`
 * process — callers must call this when a tab/pane is closed, otherwise
 * the follow process leaks for the lifetime of the extension.
 */
export function startLogStream(
  containerId: string,
  options: { timestamps: boolean; tail: TailLines },
  onChunk: LogChunkHandler,
  onClose?: (exitCode: number) => void,
): LogStreamHandle {
  const args = [
    options.timestamps ? "-ft" : "-f",
    "--tail",
    String(options.tail),
    containerId,
  ];

  markStreamActive(containerId);
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    markStreamClosed(containerId);
  };

  // NB: when a `stream` option is passed, `cli.exec` resolves synchronously
  // to an ExecProcess (not a Promise) — it must not be awaited.
  const proc = ddClient.docker.cli.exec("logs", args, {
    stream: {
      splitOutputLines: false,
      onOutput(data: { stdout?: string; stderr?: string }) {
        if (data.stdout) onChunk(data.stdout);
        if (data.stderr) onChunk(data.stderr);
      },
      onError(error: unknown) {
        console.error("log stream error", error);
      },
      onClose(exitCode: number) {
        closeOnce();
        onClose?.(exitCode);
      },
    },
  });

  return {
    close() {
      closeOnce();
      proc.close();
    },
  };
}
