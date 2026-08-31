import { createDockerDesktopClient } from "@docker/extension-api-client";

// `createDockerDesktopClient()` throws synchronously if `window.ddClient`
// isn't set yet (see its source: it reads `window?.ddClient` and throws if
// missing). Calling it eagerly at module scope used to mean that throw
// happened during the import graph's evaluation - before React ever got a
// chance to mount anything - which blanked the *entire* panel with no error
// visible anywhere in the UI. Build the client lazily instead, on first
// actual use (from inside a React effect/handler, once the app has already
// rendered), so a slow or missing injection only breaks the feature that
// needed it instead of the whole extension.
let client: ReturnType<typeof createDockerDesktopClient> | undefined;

function getClient(): ReturnType<typeof createDockerDesktopClient> {
  if (!client) {
    client = createDockerDesktopClient();
  }
  return client;
}

export function useDockerDesktopClient() {
  return getClient();
}

// Drop-in replacement for the old eager `ddClient` export: a Proxy defers
// the `window.ddClient` lookup until a caller actually touches a property
// (e.g. `ddClient.docker.cli.exec(...)`), rather than at import time.
export const ddClient: ReturnType<typeof createDockerDesktopClient> = new Proxy(
  {} as ReturnType<typeof createDockerDesktopClient>,
  {
    get(_target, prop, receiver) {
      return Reflect.get(getClient() as object, prop, receiver);
    },
  },
);
