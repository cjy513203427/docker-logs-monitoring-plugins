import { useEffect, useReducer } from "react";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import SplitscreenIcon from "@mui/icons-material/Splitscreen";
import GridViewIcon from "@mui/icons-material/GridView";
import ViewComfyIcon from "@mui/icons-material/ViewComfy";
import Grid3x3Icon from "@mui/icons-material/Grid3x3";
import type { PaneLayout } from "../types";
import { layoutReducer } from "../state/layout";
import { openContainerIds, persistLayoutState, restoreLayoutState } from "../state/persistence";
import { cleanupOrphanedLogStreams } from "../api/containers";
import { ContainerPicker } from "./ContainerPicker";
import { PaneGrid } from "./PaneGrid";
import { Tips } from "./Tips";
import { TerminalThemePicker } from "./TerminalThemePicker";

const LAYOUT_OPTIONS: { value: PaneLayout; label: string; icon: JSX.Element }[] = [
  { value: "1", label: "Single pane", icon: <ViewAgendaIcon fontSize="small" /> },
  { value: "2h", label: "Split left/right", icon: <ViewColumnIcon fontSize="small" /> },
  { value: "2v", label: "Split top/bottom", icon: <SplitscreenIcon fontSize="small" /> },
  { value: "2x2", label: "2×2 grid", icon: <GridViewIcon fontSize="small" /> },
  { value: "3x2", label: "3×2 grid (large monitors)", icon: <ViewComfyIcon fontSize="small" /> },
  { value: "3x3", label: "3×3 grid (large monitors)", icon: <Grid3x3Icon fontSize="small" /> },
];

export function App() {
  // Restored from localStorage, not built fresh: Docker Desktop destroys and
  // rebuilds the extension's UI every time you navigate away from the tab and
  // back, so a default-initialised workspace means every open tab silently
  // disappears whenever the user looks at anything else.
  const [state, dispatch] = useReducer(layoutReducer, undefined, restoreLayoutState);

  useEffect(() => {
    persistLayoutState(state);
  }, [state]);

  // Once, on startup: sweep up any `docker logs -f` processes orphaned by a
  // previous session that didn't shut down cleanly. Lives here rather than in
  // main.tsx purely so it can pass the restored workspace's container ids -
  // without them the sweep kills the streams those restored tabs have just
  // started (see cleanupOrphanedLogStreams for the full reasoning). Reads
  // `state` at mount, which is the restored value, hence the empty deps.
  useEffect(() => {
    cleanupOrphanedLogStreams(openContainerIds(state));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ctrl+Tab / Ctrl+Shift+Tab cycles through the tabs of whichever pane is
  // currently focused, same convention as browsers/VS Code/terminals.
  //
  // Registered on the *capture* phase, and deliberately: xterm.js attaches
  // its own keydown listener directly on each terminal's hidden textarea
  // (also capture phase), and its handling of a bare Tab keypress - Ctrl or
  // not - unconditionally calls preventDefault()+stopPropagation(). Once any
  // pane's terminal has DOM focus (which just clicking into a pane to focus
  // it, in split view, already does), a bubble-phase listener here would
  // never see the event at all. Capture always visits window first, before
  // any descendant, so stopping it here wins that race regardless of which
  // element currently has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey || e.metaKey || e.key !== "Tab") return;
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: "CYCLE_TAB", paneId: state.focusedPaneId, direction: e.shiftKey ? "prev" : "next" });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [state.focusedPaneId]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="h6">Logs Console</Typography>
        <Box sx={{ flex: 1 }} />
        <Tips />
        <TerminalThemePicker />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={state.layout}
          onChange={(_, value: PaneLayout | null) => value && dispatch({ type: "SET_LAYOUT", layout: value })}
        >
          {LAYOUT_OPTIONS.map((opt) => (
            <ToggleButton key={opt.value} value={opt.value}>
              <Tooltip title={opt.label}>{opt.icon}</Tooltip>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
        <ContainerPicker focusedPaneId={state.focusedPaneId} dispatch={dispatch} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <PaneGrid state={state} dispatch={dispatch} />
        </Box>
      </Box>
    </Box>
  );
}
