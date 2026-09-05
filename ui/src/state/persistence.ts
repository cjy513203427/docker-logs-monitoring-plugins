import type { LayoutState, PaneLayout, PaneSizes, PaneState, PaneViewMode, TabState, TailLines, Workspace } from "../types";
import { GRID_DIMS, PANE_COUNT, initialLayoutState } from "./layout";

/**
 * Saves/restores the whole split-screen workspace (layout, panes, open tabs
 * and their per-tab settings) across panel reloads.
 *
 * Why this exists: Docker Desktop tears the extension's UI down and rebuilds
 * it from scratch whenever you navigate to another section and come back -
 * React remounts, `useReducer` re-runs its initializer, and every open tab is
 * gone. Reported as "if you leave the window and come back, it's back to
 * zero". The log *content* legitimately can't survive that (the terminal
 * buffer is thrown away with the DOM, and each restored tab just re-runs
 * `docker logs --tail`), but which containers you had open, in which panes,
 * is exactly the state a user expects to still be there.
 *
 * Everything read back off disk is treated as untrusted: it may have been
 * written by an older build with a different shape, or hand-edited, and a
 * bad payload here would crash the first render - which in this extension
 * means a totally blank panel with no visible error (see ErrorBoundary and
 * the CLAUDE.md gotchas). Anything that doesn't validate is discarded in
 * favour of a clean default state rather than half-restored.
 */

const STORAGE_KEY = "logs-console:layout";

/** v1 stored a single bare LayoutState; v2 stores a list of named workspaces
 * plus which one is active. A v1 payload is migrated rather than dropped (see
 * parseEnvelope) - a schema bump must never be the reason someone loses the
 * tabs they had open. Bump this only for a change that genuinely can't be
 * migrated; anything unrecognised falls back to one empty workspace. */
const SCHEMA_VERSION = 2;

export const DEFAULT_WORKSPACE_NAME = "Layout 1";

export interface WorkspacesState {
  activeId: string;
  workspaces: Workspace[];
}

const TAIL_VALUES: readonly TailLines[] = [500, 5000, "all"];
const VIEW_MODES: readonly PaneViewMode[] = ["tabs", "merged"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTab(raw: unknown): TabState | null {
  if (!isRecord(raw)) return null;
  const { id, containerId, containerName, timestamps, tailLines, streamEpoch, lastKnownState } = raw;
  if (typeof id !== "string" || typeof containerId !== "string" || typeof containerName !== "string") return null;
  if (typeof timestamps !== "boolean") return null;
  if (!TAIL_VALUES.includes(tailLines as TailLines)) return null;
  return {
    id,
    containerId,
    containerName,
    timestamps,
    // Deliberately NOT restored: pausing is a transient "hold still so I can
    // read this" action, not a preference. Coming back to a tab that's still
    // paused from an hour ago just looks like the empty panel this whole
    // feature exists to fix, so every restored tab resumes following.
    following: true,
    tailLines: tailLines as TailLines,
    streamEpoch: typeof streamEpoch === "number" && Number.isFinite(streamEpoch) ? streamEpoch : 0,
    lastKnownState: typeof lastKnownState === "string" ? lastKnownState : undefined,
  };
}

/** Divider positions are cosmetic, so a bad entry is dropped on its own
 * rather than taking the whole workspace with it - the grid just falls back
 * to an even split. Lengths are re-checked against the layout's real row/
 * column counts because Allotment ignores a mismatched `defaultSizes`
 * outright (it only warns), which would look like the sizes were forgotten. */
function parseSizes(raw: unknown, layout: PaneLayout): PaneSizes | null {
  if (!isRecord(raw)) return null;
  const { rows, cols } = GRID_DIMS[layout];
  const isSizeArray = (v: unknown, want: number): v is number[] =>
    Array.isArray(v) && v.length === want && v.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);

  const parsedRows = isSizeArray(raw.rows, rows) ? raw.rows : [];
  const parsedCols: number[][] = [];
  if (Array.isArray(raw.cols)) {
    for (const entry of raw.cols.slice(0, rows)) {
      parsedCols.push(isSizeArray(entry, cols) ? entry : []);
    }
  }
  if (parsedRows.length === 0 && parsedCols.every((c) => c.length === 0)) return null;
  return { rows: parsedRows, cols: parsedCols };
}

function parseAllSizes(raw: unknown): LayoutState["sizes"] {
  if (!isRecord(raw)) return undefined;
  const out: Partial<Record<PaneLayout, PaneSizes>> = {};
  for (const [layout, value] of Object.entries(raw)) {
    if (!(layout in GRID_DIMS)) continue;
    const parsed = parseSizes(value, layout as PaneLayout);
    if (parsed) out[layout as PaneLayout] = parsed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parsePane(raw: unknown): PaneState | null {
  if (!isRecord(raw)) return null;
  const { id, tabs, activeTabId, viewMode } = raw;
  if (typeof id !== "string" || !Array.isArray(tabs)) return null;
  if (!VIEW_MODES.includes(viewMode as PaneViewMode)) return null;

  const parsedTabs: TabState[] = [];
  for (const rawTab of tabs) {
    const tab = parseTab(rawTab);
    if (!tab) return null;
    parsedTabs.push(tab);
  }

  return {
    id,
    tabs: parsedTabs,
    // Repaired rather than rejected: a tab being gone while the rest of the
    // pane is intact is ordinary drift, not corruption. Falling back to the
    // last tab matches what CLOSE_TAB does.
    activeTabId:
      typeof activeTabId === "string" && parsedTabs.some((t) => t.id === activeTabId)
        ? activeTabId
        : (parsedTabs[parsedTabs.length - 1]?.id ?? null),
    viewMode: viewMode as PaneViewMode,
  };
}

function parseLayoutState(raw: unknown): LayoutState | null {
  if (!isRecord(raw)) return null;
  const { layout, panes, focusedPaneId } = raw;
  if (typeof layout !== "string" || !(layout in PANE_COUNT)) return null;
  if (!Array.isArray(panes)) return null;
  // Load-bearing check, not defensive noise: PaneGrid indexes `state.panes`
  // positionally for every slot the layout implies (`state.panes[index].id`),
  // so a payload whose pane count doesn't match its own layout throws on
  // `undefined.id` during the very first render - i.e. a blank panel with no
  // error anywhere, the single worst failure mode this extension has.
  if (panes.length !== PANE_COUNT[layout as PaneLayout]) return null;

  const parsedPanes: PaneState[] = [];
  for (const rawPane of panes) {
    const pane = parsePane(rawPane);
    if (!pane) return null;
    parsedPanes.push(pane);
  }

  // Duplicate ids would collide as React keys (and make "close this tab"
  // ambiguous in the reducer, which matches on id), so treat them as
  // corruption rather than trying to renumber them.
  const paneIds = new Set(parsedPanes.map((p) => p.id));
  if (paneIds.size !== parsedPanes.length) return null;
  const tabIds = parsedPanes.flatMap((p) => p.tabs.map((t) => t.id));
  if (new Set(tabIds).size !== tabIds.length) return null;

  return {
    layout: layout as PaneLayout,
    panes: parsedPanes,
    focusedPaneId:
      typeof focusedPaneId === "string" && paneIds.has(focusedPaneId) ? focusedPaneId : parsedPanes[0].id,
    sizes: parseAllSizes(raw.sizes),
  };
}

let workspaceCounter = 0;
function newWorkspaceId(): string {
  workspaceCounter += 1;
  return `ws-${Date.now()}-${workspaceCounter}`;
}

export function makeWorkspace(name: string, state: LayoutState): Workspace {
  return { id: newWorkspaceId(), name, state };
}

function defaultWorkspaces(): WorkspacesState {
  const only = makeWorkspace(DEFAULT_WORKSPACE_NAME, initialLayoutState());
  return { activeId: only.id, workspaces: [only] };
}

function parseWorkspace(raw: unknown): Workspace | null {
  if (!isRecord(raw)) return null;
  const { id, name, state } = raw;
  if (typeof id !== "string" || typeof name !== "string") return null;
  const parsed = parseLayoutState(state);
  if (!parsed) return null;
  return { id, name, state: parsed };
}

function parseEnvelope(envelope: Record<string, unknown>): WorkspacesState | null {
  // v1: one bare LayoutState, no names. Migrate it into the first workspace
  // so upgrading doesn't wipe the tabs someone had open.
  if (envelope.version === 1) {
    const migrated = parseLayoutState(envelope.state);
    if (!migrated) return null;
    const only = makeWorkspace(DEFAULT_WORKSPACE_NAME, migrated);
    return { activeId: only.id, workspaces: [only] };
  }
  if (envelope.version !== SCHEMA_VERSION || !Array.isArray(envelope.workspaces)) return null;

  const workspaces: Workspace[] = [];
  for (const raw of envelope.workspaces) {
    const parsed = parseWorkspace(raw);
    if (!parsed) return null;
    workspaces.push(parsed);
  }
  if (workspaces.length === 0) return null;
  // Duplicate ids would break switching/renaming (both address by id) and
  // collide as React keys.
  if (new Set(workspaces.map((w) => w.id)).size !== workspaces.length) return null;

  const { activeId } = envelope;
  return {
    activeId: typeof activeId === "string" && workspaces.some((w) => w.id === activeId) ? activeId : workspaces[0].id,
    workspaces,
  };
}

/** Every saved workspace plus which one is active, or a single fresh
 * workspace if there's nothing valid on disk. Safe to call during render as a
 * lazy initializer. */
export function restoreWorkspaces(): WorkspacesState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return defaultWorkspaces();
  }
  if (!raw) return defaultWorkspaces();

  try {
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope)) return defaultWorkspaces();
    return parseEnvelope(envelope) ?? defaultWorkspaces();
  } catch {
    return defaultWorkspaces();
  }
}

export function persistWorkspaces(data: WorkspacesState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...data }));
  } catch {
    // Best-effort only - a full quota or a locked-down storage policy should
    // cost the user their restored workspace, not their working panel.
  }
}

/** Every container id currently open in some tab. Used to keep the startup
 * orphan sweep from killing the streams restored tabs have just started -
 * see cleanupOrphanedLogStreams(). */
export function openContainerIds(state: LayoutState): string[] {
  return [...new Set(state.panes.flatMap((pane) => pane.tabs.map((tab) => tab.containerId)))];
}
