// Deterministic color per container ID, shared by the merged-view tab chips
// and the merged log lines themselves so the two stay visually in sync (the
// chip for a container is always the same color as its lines below it).
export function colorForContainer(containerId: string): string {
  let hash = 0;
  for (let i = 0; i < containerId.length; i++) {
    hash = (hash * 31 + containerId.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360}, 55%, 40%)`;
}
