import type { ContainerInfo, LayoutState, PaneLayout, PaneSizes, PaneState, PaneViewMode, TabState, TailLines } from "../types";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function emptyPane(): PaneState {
  return { id: nextId("pane"), tabs: [], activeTabId: null, viewMode: "tabs" };
}

/** Rows x columns each layout resolves to. The single source of truth for
 * both how PaneGrid nests its Allotments and how many panes a layout has -
 * adding another grid size is one entry here and nothing else. */
export const GRID_DIMS: Record<PaneLayout, { rows: number; cols: number }> = {
  "1": { rows: 1, cols: 1 },
  "2h": { rows: 1, cols: 2 },
  "2v": { rows: 2, cols: 1 },
  "2x2": { rows: 2, cols: 2 },
  "3x2": { rows: 2, cols: 3 },
  "3x3": { rows: 3, cols: 3 },
};

export const PANE_COUNT: Record<PaneLayout, number> = Object.fromEntries(
  Object.entries(GRID_DIMS).map(([layout, { rows, cols }]) => [layout, rows * cols]),
) as Record<PaneLayout, number>;

export function initialLayoutState(): LayoutState {
  const pane = emptyPane();
  return { layout: "1", panes: [pane], focusedPaneId: pane.id };
}

export type LayoutAction =
  | { type: "SET_LAYOUT"; layout: PaneLayout }
  | { type: "OPEN_TAB"; paneId: string; container: ContainerInfo }
  | { type: "CLOSE_TAB"; paneId: string; tabId: string }
  | { type: "FOCUS_TAB"; paneId: string; tabId: string }
  | { type: "FOCUS_PANE"; paneId: string }
  | { type: "TOGGLE_TIMESTAMPS"; paneId: string; tabId: string }
  | { type: "TOGGLE_FOLLOWING"; paneId: string; tabId: string }
  | { type: "SET_TAIL_LINES"; paneId: string; tabId: string; tailLines: TailLines }
  | { type: "SET_PANE_VIEW_MODE"; paneId: string; viewMode: PaneViewMode }
  | { type: "CYCLE_TAB"; paneId: string; direction: "next" | "prev" }
  | { type: "SYNC_CONTAINERS"; containers: ContainerInfo[] }
  | { type: "SET_ROW_SIZES"; sizes: number[] }
  | { type: "SET_COL_SIZES"; rowIndex: number; sizes: number[] }
  | { type: "LOAD_STATE"; state: LayoutState };

function currentSizes(state: LayoutState): PaneSizes {
  return state.sizes?.[state.layout] ?? { rows: [], cols: [] };
}

function withSizes(state: LayoutState, sizes: PaneSizes): LayoutState {
  return { ...state, sizes: { ...state.sizes, [state.layout]: sizes } };
}

function withPane(state: LayoutState, paneId: string, update: (pane: PaneState) => PaneState): LayoutState {
  return {
    ...state,
    panes: state.panes.map((pane) => (pane.id === paneId ? update(pane) : pane)),
  };
}

export function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case "SET_LAYOUT": {
      const wantCount = PANE_COUNT[action.layout];
      let panes = state.panes;
      if (panes.length < wantCount) {
        panes = [...panes, ...Array.from({ length: wantCount - panes.length }, emptyPane)];
      } else if (panes.length > wantCount) {
        const kept = panes.slice(0, wantCount - 1);
        const overflowTabs = panes.slice(wantCount - 1).flatMap((p) => p.tabs);
        const lastOriginal = panes[wantCount - 1];
        const merged: PaneState = {
          ...lastOriginal,
          tabs: [...lastOriginal.tabs, ...overflowTabs.filter((t) => !lastOriginal.tabs.includes(t))],
        };
        panes = [...kept, merged];
      }
      const focusedPaneId = panes.some((p) => p.id === state.focusedPaneId) ? state.focusedPaneId : panes[0].id;
      return { ...state, layout: action.layout, panes, focusedPaneId };
    }

    case "OPEN_TAB": {
      const pane = state.panes.find((p) => p.id === action.paneId);
      if (!pane) return state;
      const existing = pane.tabs.find((t) => t.containerId === action.container.id);
      if (existing) {
        return withPane(state, pane.id, (p) => ({ ...p, activeTabId: existing.id }));
      }
      const tab: TabState = {
        id: nextId("tab"),
        containerId: action.container.id,
        containerName: action.container.name,
        timestamps: true,
        following: true,
        tailLines: 500,
        streamEpoch: 0,
        lastKnownState: action.container.state,
      };
      return {
        ...withPane(state, pane.id, (p) => ({ ...p, tabs: [...p.tabs, tab], activeTabId: tab.id })),
        focusedPaneId: pane.id,
      };
    }

    case "CLOSE_TAB": {
      return withPane(state, action.paneId, (pane) => {
        const tabs = pane.tabs.filter((t) => t.id !== action.tabId);
        const activeTabId =
          pane.activeTabId === action.tabId ? (tabs[tabs.length - 1]?.id ?? null) : pane.activeTabId;
        return { ...pane, tabs, activeTabId };
      });
    }

    case "FOCUS_TAB":
      return {
        ...withPane(state, action.paneId, (pane) => ({ ...pane, activeTabId: action.tabId })),
        focusedPaneId: action.paneId,
      };

    case "FOCUS_PANE":
      // Dispatched from every mousedown anywhere in a pane, so returning a
      // new state object unconditionally would re-render the whole grid - and
      // now also rewrite the persisted workspace - on every single click
      // inside the already-focused pane.
      if (state.focusedPaneId === action.paneId) return state;
      return { ...state, focusedPaneId: action.paneId };

    case "TOGGLE_TIMESTAMPS":
      return withPane(state, action.paneId, (pane) => ({
        ...pane,
        tabs: pane.tabs.map((t) => (t.id === action.tabId ? { ...t, timestamps: !t.timestamps } : t)),
      }));

    case "TOGGLE_FOLLOWING":
      return withPane(state, action.paneId, (pane) => ({
        ...pane,
        tabs: pane.tabs.map((t) => (t.id === action.tabId ? { ...t, following: !t.following } : t)),
      }));

    case "SET_TAIL_LINES":
      return withPane(state, action.paneId, (pane) => ({
        ...pane,
        tabs: pane.tabs.map((t) => (t.id === action.tabId ? { ...t, tailLines: action.tailLines } : t)),
      }));

    case "SET_PANE_VIEW_MODE":
      return withPane(state, action.paneId, (pane) => ({ ...pane, viewMode: action.viewMode }));

    // Reconciles open tabs against a freshly-fetched container list (called
    // from ContainerPicker on every event-driven or manual refresh). Fixes
    // two ways a tab's log stream can otherwise go silently stale:
    //  1. Same id, container stopped then started again - `docker logs -f`
    //     does not reliably resume on its own, so bump streamEpoch to force
    //     XtermLog/MergedLogView to reissue the stream.
    //  2. Container recreated (removed + a new one started under the same
    //     name, e.g. a Compose redeploy or a health-check-driven recreate) -
    //     the tab's containerId is now permanently dead. Docker container
    //     names are unique host-wide, so "a container with this tab's name
    //     exists under a different id" unambiguously means "this is the
    //     replacement" - rebind the tab to it.
    case "SYNC_CONTAINERS": {
      const byId = new Map(action.containers.map((c) => [c.id, c]));
      const byName = new Map(action.containers.map((c) => [c.name, c]));
      let anyPaneChanged = false;
      const panes = state.panes.map((pane) => {
        let anyTabChanged = false;
        const tabs = pane.tabs.map((tab) => {
          const sameContainer = byId.get(tab.containerId);
          if (sameContainer) {
            const wasRunning = tab.lastKnownState === "running";
            const nowRunning = sameContainer.state === "running";
            if (tab.lastKnownState && !wasRunning && nowRunning) {
              anyTabChanged = true;
              return { ...tab, lastKnownState: sameContainer.state, streamEpoch: tab.streamEpoch + 1 };
            }
            if (tab.lastKnownState !== sameContainer.state) {
              anyTabChanged = true;
              return { ...tab, lastKnownState: sameContainer.state };
            }
            return tab;
          }

          const recreated = byName.get(tab.containerName);
          if (recreated && recreated.id !== tab.containerId) {
            anyTabChanged = true;
            return { ...tab, containerId: recreated.id, lastKnownState: recreated.state };
          }
          return tab;
        });
        if (!anyTabChanged) return pane;
        anyPaneChanged = true;
        return { ...pane, tabs };
      });
      return anyPaneChanged ? { ...state, panes } : state;
    }

    // Divider drags, recorded against the *current* layout only (see
    // LayoutState.sizes for why they're keyed by layout). Dispatched from
    // Allotment's onDragEnd rather than onChange: onChange fires on every
    // animation frame of a drag, which would mean a localStorage write per
    // frame for a value nobody can observe mid-drag anyway.
    case "SET_ROW_SIZES": {
      const current = currentSizes(state);
      return withSizes(state, { ...current, rows: action.sizes });
    }

    case "SET_COL_SIZES": {
      const current = currentSizes(state);
      const cols = [...current.cols];
      while (cols.length <= action.rowIndex) cols.push([]);
      cols[action.rowIndex] = action.sizes;
      return withSizes(state, { ...current, cols });
    }

    // Wholesale swap, used when switching to another saved workspace. The
    // incoming state has already been validated - it either came from this
    // session or through state/persistence.ts's parser.
    case "LOAD_STATE":
      return action.state;

    case "CYCLE_TAB":
      return withPane(state, action.paneId, (pane) => {
        if (pane.tabs.length === 0) return pane;
        const currentIndex = pane.tabs.findIndex((t) => t.id === pane.activeTabId);
        const delta = action.direction === "next" ? 1 : -1;
        // currentIndex === -1 (nothing active yet) lands on tabs[0] either way
        const nextIndex = (currentIndex + delta + pane.tabs.length) % pane.tabs.length;
        return { ...pane, activeTabId: pane.tabs[nextIndex].id };
      });

    default:
      return state;
  }
}
