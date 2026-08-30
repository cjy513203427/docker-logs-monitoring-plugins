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

  switch (state.layout) {
    case "1":
      return pane(0);

    case "2h":
      return (
        <Allotment>
          <Allotment.Pane minSize={200}>{pane(0)}</Allotment.Pane>
          <Allotment.Pane minSize={200}>{pane(1)}</Allotment.Pane>
        </Allotment>
      );

    case "2v":
      return (
        <Allotment vertical>
          <Allotment.Pane minSize={120}>{pane(0)}</Allotment.Pane>
          <Allotment.Pane minSize={120}>{pane(1)}</Allotment.Pane>
        </Allotment>
      );

    case "2x2":
      return (
        <Allotment vertical>
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
