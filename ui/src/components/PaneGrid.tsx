import type { Dispatch, ReactElement } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import type { LayoutState } from "../types";
import type { LayoutAction } from "../state/layout";
import { LogPane } from "./LogPane";

interface PaneGridProps {
  state: LayoutState;
  dispatch: Dispatch<LayoutAction>;
}

/** Builds a `rows` x `cols` grid of panes (row-major: pane 0 is top-left,
 * indices increase left-to-right then top-to-bottom) out of nested
 * Allotments - an outer vertical split of rows, each row an inner
 * horizontal split of columns.
 *
 * `layoutKey` is load-bearing, not decoration: two layouts can render an
 * <Allotment> at the same JSX position with a different `vertical` prop
 * (e.g. "2h" horizontal vs. "2x2"/"3x2"/"3x3" vertical) - without a key,
 * React reconciles that as updating the *same* Allotment instance with a
 * flipped orientation prop rather than unmounting and remounting it, and
 * Allotment's internal split-view sizing engine doesn't correctly recompute
 * for a live orientation flip on an already-mounted instance (confirmed:
 * one row silently collapses to 0 height, permanently - not a timing issue,
 * waiting longer or firing a resize event doesn't fix it). The key forces a
 * fresh mount with freshly-computed sizing on every layout change.
 */
function renderGrid(layoutKey: string, rows: number, cols: number, pane: (index: number) => ReactElement): ReactElement {
  return (
    <Allotment key={layoutKey} vertical>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <Allotment.Pane key={rowIndex} minSize={80}>
          <Allotment>
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

/** Renders `state.panes` in the arrangement implied by `state.layout`, using
 * resizable splits so several containers' logs can be viewed side by side. */
export function PaneGrid({ state, dispatch }: PaneGridProps) {
  const pane = (index: number) => {
    const p = state.panes[index];
    return <LogPane key={p.id} pane={p} isFocused={p.id === state.focusedPaneId} dispatch={dispatch} />;
  };

  switch (state.layout) {
    case "1":
      return pane(0);

    case "2h":
      return (
        <Allotment key={state.layout}>
          <Allotment.Pane minSize={200}>{pane(0)}</Allotment.Pane>
          <Allotment.Pane minSize={200}>{pane(1)}</Allotment.Pane>
        </Allotment>
      );

    case "2v":
      return (
        <Allotment key={state.layout} vertical>
          <Allotment.Pane minSize={120}>{pane(0)}</Allotment.Pane>
          <Allotment.Pane minSize={120}>{pane(1)}</Allotment.Pane>
        </Allotment>
      );

    case "2x2":
      return renderGrid(state.layout, 2, 2, pane);

    // 6/9-pane grids for large monitors - cramped on a normal laptop
    // screen, but that's the user's call to make, not ours to block.
    case "3x2":
      return renderGrid(state.layout, 2, 3, pane);

    case "3x3":
      return renderGrid(state.layout, 3, 3, pane);

    default:
      return pane(0);
  }
}
