import type { LayoutState, PaneLayout, PaneState, PaneViewMode, TabState, TailLines } from "../types";
import { PANE_COUNT, initialLayoutState } from "./layout";

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

/** Bump when LayoutState's persisted shape changes in a way older payloads
 * can't satisfy; a mismatch is dropped silently and the user gets a fresh
 * default workspace instead of a validation failure per field. */
const SCHEMA_VERSION = 1;

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
  };
}

/** The persisted workspace, or a fresh default one if there isn't a valid
 * saved one. Safe to call as a `useReducer` lazy initializer. */
export function restoreLayoutState(): LayoutState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return initialLayoutState();
  }
  if (!raw) return initialLayoutState();

  try {
    const envelope: unknown = JSON.parse(raw);
    if (!isRecord(envelope) || envelope.version !== SCHEMA_VERSION) return initialLayoutState();
    return parseLayoutState(envelope.state) ?? initialLayoutState();
  } catch {
    return initialLayoutState();
  }
}

export function persistLayoutState(state: LayoutState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, state }));
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
