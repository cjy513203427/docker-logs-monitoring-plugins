import type { ContainerInfo, LayoutState, PaneLayout, PaneState, PaneViewMode, TabState, TailLines } from "../types";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function emptyPane(): PaneState {
  return { id: nextId("pane"), tabs: [], activeTabId: null, viewMode: "tabs" };
}

const PANE_COUNT: Record<PaneLayout, number> = {
  "1": 1,
  "2h": 2,
  "2v": 2,
  "2x2": 4,
};

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
  | { type: "CYCLE_TAB"; paneId: string; direction: "next" | "prev" };

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
