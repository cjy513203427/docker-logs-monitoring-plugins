/** `DataTransfer` MIME type used to drag a container from the sidebar
 * (ContainerPicker) onto a specific pane (LogPane) to open it there. */
export const CONTAINER_DRAG_MIME_TYPE = "application/x-logs-console-container";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string; // e.g. "running", "exited"
  status: string; // e.g. "Up 3 hours"
  /** value of the `com.docker.compose.project` label, if the container was started by Compose */
  composeProject?: string;
}

export type PaneLayout = "1" | "2h" | "2v" | "2x2";

/** How many lines of history a tab's log stream requests via `docker logs --tail`. */
export type TailLines = 500 | 5000 | "all";

export interface TabState {
  /** unique per open tab, distinct from containerId so the same container can be opened in more than one pane */
  id: string;
  containerId: string;
  containerName: string;
  timestamps: boolean;
  following: boolean;
  tailLines: TailLines;
}

/**
 * "tabs" is the normal one-terminal-per-tab view. "merged" combines every tab
 * currently open in the pane into a single chronologically interleaved,
 * per-container-colored stream, for correlating what several containers were
 * doing at the same moment - see MergedLogView.
 */
export type PaneViewMode = "tabs" | "merged";

export interface PaneState {
  id: string;
  tabs: TabState[];
  activeTabId: string | null;
  viewMode: PaneViewMode;
}

export interface LayoutState {
  layout: PaneLayout;
  panes: PaneState[];
  focusedPaneId: string;
}
