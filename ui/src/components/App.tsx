import { useReducer } from "react";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import SplitscreenIcon from "@mui/icons-material/Splitscreen";
import GridViewIcon from "@mui/icons-material/GridView";
import type { PaneLayout } from "../types";
import { initialLayoutState, layoutReducer } from "../state/layout";
import { ContainerPicker } from "./ContainerPicker";
import { PaneGrid } from "./PaneGrid";

const LAYOUT_OPTIONS: { value: PaneLayout; label: string; icon: JSX.Element }[] = [
  { value: "1", label: "Single pane", icon: <ViewAgendaIcon fontSize="small" /> },
  { value: "2h", label: "Split left/right", icon: <ViewColumnIcon fontSize="small" /> },
  { value: "2v", label: "Split top/bottom", icon: <SplitscreenIcon fontSize="small" /> },
  { value: "2x2", label: "2×2 grid", icon: <GridViewIcon fontSize="small" /> },
];

export function App() {
  const [state, dispatch] = useReducer(layoutReducer, undefined, initialLayoutState);

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
