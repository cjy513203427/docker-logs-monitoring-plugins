import { ddClient } from "./docker";
import type { ContainerInfo } from "../types";

// Shape of one line of `docker ps --format "{{json .}}"` output.
interface DockerPsRow {
  ID: string;
  Names: string;
  Image: string;
  State: string;
  Status: string;
}

/** Lists all containers (running and stopped), newest first, via the same
 * `docker ps` CLI call the reference extension uses. */
export async function listContainers(): Promise<ContainerInfo[]> {
  const result = await ddClient.docker.cli.exec("ps", [
    "--all",
    "--format",
    '"{{json .}}"',
  ]);
  const rows = result.parseJsonLines() as DockerPsRow[];
  return rows.map((row) => ({
    id: row.ID,
    name: row.Names,
    image: row.Image,
    state: row.State,
    status: row.Status,
  }));
}

export type LogChunkHandler = (chunk: string) => void;

export interface LogStreamHandle {
  close(): void;
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
  options: { timestamps: boolean },
  onChunk: LogChunkHandler,
  onClose?: (exitCode: number) => void,
): LogStreamHandle {
  const args = [options.timestamps ? "-ft" : "-f", "--tail", "500", containerId];

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
        onClose?.(exitCode);
      },
    },
  });

  return proc;
}
