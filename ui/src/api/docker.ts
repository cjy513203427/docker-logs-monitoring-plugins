import { createDockerDesktopClient } from "@docker/extension-api-client";

// The extension client is stateless and cheap to keep around; a single
// instance is shared by the whole UI, same as the reference extension does.
const client = createDockerDesktopClient();

export function useDockerDesktopClient() {
  return client;
}

export const ddClient = client;
