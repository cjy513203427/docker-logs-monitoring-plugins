import type { Dispatch } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import type { LayoutState } from "../types";
import type { LayoutAction } from "../state/layout";
import { LogPane } from "./LogPane";

interface PaneGridProps {
  state: LayoutState;
  dispatch: Dispatch<LayoutAction>;
}

/** Renders `state.panes` in the arrangement implied by `state.layout`, using
 * resizable splits so several containers' logs can be viewed side by side. */
export function PaneGrid({ state, dispatch }: PaneGridProps) {
  const pane = (index: number) => {
    const p = state.panes[index];
    return <LogPane key={p.id} pane={p} isFocused={p.id === state.focusedPaneId} dispatch={dispatch} />;
  };

  // `key={state.layout}` on every top-level Allotment below is load-bearing,
  // not decoration: "2h" and "2x2" both render an <Allotment> at this same
  // JSX position, just with a different `vertical` prop ("2h" horizontal,
  // "2x2" vertical) - without a key, React reconciles that as updating the
  // *same* Allotment instance with a flipped orientation prop, rather than
  // unmounting and remounting it. Allotment's internal split-view sizing
  // engine doesn't correctly recompute for a live orientation flip on an
  // already-mounted instance, and one row silently collapses to 0 height
  // (confirmed: switching 2h -> 2x2 directly leaves the grid entirely
  // blank, permanently - not a timing issue, waiting longer or firing a
  // resize event doesn't fix it either). The key forces a fresh mount with
  // freshly-computed sizing on every layout change, exactly like routing
  // through "1" (which has no Allotment at all) already "fixed" it by
  // accident.
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
      return (
        <Allotment key={state.layout} vertical>
          <Allotment.Pane minSize={120}>
            <Allotment>
              <Allotment.Pane minSize={200}>{pane(0)}</Allotment.Pane>
              <Allotment.Pane minSize={200}>{pane(1)}</Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
          <Allotment.Pane minSize={120}>
            <Allotment>
              <Allotment.Pane minSize={200}>{pane(2)}</Allotment.Pane>
              <Allotment.Pane minSize={200}>{pane(3)}</Allotment.Pane>
            </Allotment>
          </Allotment.Pane>
        </Allotment>
      );

    default:
      return pane(0);
  }
}
