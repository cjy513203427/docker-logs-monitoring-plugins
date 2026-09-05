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

// "3x2"/"3x3" (6/9 panes) exist for large monitors - on a normal laptop
// screen they're cramped, but that's the user's call to make, not ours to
// block.
export type PaneLayout = "1" | "2h" | "2v" | "2x2" | "3x2" | "3x3";

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
  /**
   * Bumped by the `SYNC_CONTAINERS` reducer case whenever this tab's log
   * stream should be force-restarted even though containerId/timestamps/
   * tailLines didn't change - specifically, when the same container id goes
   * from not-running back to running (`docker logs -f` does not reliably
   * resume on its own across a same-id container restart). A rebind to a
   * *recreated* container (see lastKnownState below) changes containerId
   * itself, which already retriggers the stream on its own - this field
   * only covers the same-id case. XtermLog includes it in its stream-restart
   * effect's dependency array.
   */
  streamEpoch: number;
  /**
   * The backing container's `state` (e.g. "running"/"exited") as of the most
   * recent `SYNC_CONTAINERS` sync. Used only to detect a running -> stopped
   * -> running transition on the *same* container id (see streamEpoch) and
   * to seed rebinding when a same-named container replaces this one under a
   * new id - see the SYNC_CONTAINERS reducer case in state/layout.ts.
   */
  lastKnownState?: string;
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
  /**
   * Divider (sash) positions, keyed by the layout they belong to so that
   * switching 2x2 -> 2h -> 2x2 doesn't cross-contaminate one grid's
   * proportions with another's. Absent/short entries just mean "never
   * dragged" - the grid falls back to an even split. See PaneSizes.
   */
  sizes?: Partial<Record<PaneLayout, PaneSizes>>;
}

/**
 * Where the dividers sit for one `PaneLayout`, mirroring how PaneGrid nests
 * its Allotments: one outer vertical split of rows, then one horizontal
 * split of columns per row.
 *
 * The numbers are whatever Allotment reported at the end of a drag, i.e.
 * pixels - but only their *ratios* ever matter. Allotment turns `defaultSizes`
 * into proportions immediately on mount (`size / sum(sizes)`, see
 * `saveProportions` in its source) and lays out against the real container
 * from there, so a layout saved on a wide monitor restores correctly on a
 * narrow one with no rescaling on our side.
 *
 * An empty array means "not set yet"; `cols[rowIndex]` is that row's split.
 */
export interface PaneSizes {
  rows: number[];
  cols: number[][];
}

/**
 * A named, self-contained workspace: a whole `LayoutState` (grid shape,
 * divider positions, which containers are open in which pane, and each
 * tab's settings) under a user-editable name, switchable from the top bar.
 * Lets one setup be "debug backend" (two panes, api + postgres) and another
 * "everything" (3x3), instead of rebuilding the arrangement by hand.
 */
export interface Workspace {
  id: string;
  name: string;
  state: LayoutState;
}
