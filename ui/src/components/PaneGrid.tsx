import type { Dispatch, ReactElement } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import type { LayoutState, PaneSizes } from "../types";
import { GRID_DIMS, type LayoutAction } from "../state/layout";
import { LogPane } from "./LogPane";

interface PaneGridProps {
  state: LayoutState;
  dispatch: Dispatch<LayoutAction>;
}

const NO_SIZES: PaneSizes = { rows: [], cols: [] };

/** Only hand Allotment a `defaultSizes` when we have exactly one number per
 * child. Allotment logs "Expected N children based on defaultSizes but found
 * M" and silently ignores a mismatched array, so passing a stale/short one
 * would look like the saved divider positions had simply been forgotten. */
function sizesFor(stored: number[] | undefined, count: number): number[] | undefined {
  return stored && stored.length === count ? stored : undefined;
}

/** Renders `state.panes` in the arrangement implied by `state.layout`, using
 * resizable splits so several containers' logs can be viewed side by side.
 *
 * Every layout with more than one pane goes through this one path: an outer
 * vertical split of rows, each row an inner horizontal split of columns
 * (row-major, so pane 0 is top-left). "2h" is just 1x2 and "2v" is 2x1 - they
 * used to be hand-written special cases, which meant three places to thread
 * divider-size persistence through instead of one.
 *
 * `key={layoutKey}` is load-bearing, not decoration: two layouts can render an
 * <Allotment> at the same JSX position with a different `vertical` prop, and
 * without a key React reconciles that as updating the *same* Allotment
 * instance with a flipped orientation rather than remounting it - Allotment's
 * split-view sizing engine doesn't correctly recompute for a live orientation
 * flip and one row silently collapses to 0 height, permanently (confirmed; not
 * a timing issue, waiting or firing a resize event doesn't fix it). The key
 * forces a fresh mount with freshly-computed sizing on every layout change -
 * which is also what makes restoring saved sizes work, since `defaultSizes` is
 * only read on mount.
 */
function renderGrid(
  layoutKey: string,
  rows: number,
  cols: number,
  sizes: PaneSizes,
  pane: (index: number) => ReactElement,
  dispatch: Dispatch<LayoutAction>,
): ReactElement {
  return (
    <Allotment
      key={layoutKey}
      vertical
      defaultSizes={sizesFor(sizes.rows, rows)}
      // onDragEnd, not onChange: onChange fires continuously while dragging.
      onDragEnd={(next) => dispatch({ type: "SET_ROW_SIZES", sizes: next })}
    >
      {Array.from({ length: rows }, (_, rowIndex) => (
        <Allotment.Pane key={rowIndex} minSize={80}>
          <Allotment
            defaultSizes={sizesFor(sizes.cols[rowIndex], cols)}
            onDragEnd={(next) => dispatch({ type: "SET_COL_SIZES", rowIndex, sizes: next })}
          >
            {Array.from({ length: cols }, (_, colIndex) => (
              <Allotment.Pane key={colIndex} minSize={120}>
                {pane(rowIndex * cols + colIndex)}
              </Allotment.Pane>
            ))}
          </Allotment>
        </Allotment.Pane>
      ))}
    </Allotment>
  );
}

export function PaneGrid({ state, dispatch }: PaneGridProps) {
  const pane = (index: number) => {
    const p = state.panes[index];
    return <LogPane key={p.id} pane={p} isFocused={p.id === state.focusedPaneId} dispatch={dispatch} />;
  };

  const { rows, cols } = GRID_DIMS[state.layout];
  // A single pane has no dividers at all - skip the Allotment wrappers rather
  // than nesting two split views around one child.
  if (rows === 1 && cols === 1) return pane(0);

  return renderGrid(state.layout, rows, cols, state.sizes?.[state.layout] ?? NO_SIZES, pane, dispatch);
}
