export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string; // e.g. "running", "exited"
  status: string; // e.g. "Up 3 hours"
}

export type PaneLayout = "1" | "2h" | "2v" | "2x2";

export interface TabState {
  /** unique per open tab, distinct from containerId so the same container can be opened in more than one pane */
  id: string;
  containerId: string;
  containerName: string;
  timestamps: boolean;
  following: boolean;
}

export interface PaneState {
  id: string;
  tabs: TabState[];
  activeTabId: string | null;
}

export interface LayoutState {
  layout: PaneLayout;
  panes: PaneState[];
  focusedPaneId: string;
}
