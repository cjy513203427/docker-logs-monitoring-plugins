import { useRef, useState } from "react";
import type { Dispatch } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import type { PaneState } from "../types";
import type { LayoutAction } from "../state/layout";
import { XtermLog, type XtermLogHandle } from "./XtermLog";

interface LogPaneProps {
  pane: PaneState;
  isFocused: boolean;
  dispatch: Dispatch<LayoutAction>;
}

export function LogPane({ pane, isFocused, dispatch }: LogPaneProps) {
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId) ?? null;
  const [search, setSearch] = useState("");
  const logRefs = useRef(new Map<string, XtermLogHandle | null>());

  return (
    <Box
      onMouseDown={() => dispatch({ type: "FOCUS_PANE", paneId: pane.id })}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        outline: (theme) => (isFocused ? `2px solid ${theme.palette.primary.main}` : "2px solid transparent"),
        outlineOffset: "-2px",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={pane.activeTabId ?? false}
          onChange={(_, tabId) => dispatch({ type: "FOCUS_TAB", paneId: pane.id, tabId })}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ minHeight: 36, flex: 1, minWidth: 0 }}
        >
          {pane.tabs.map((tab) => (
            <Tab
              key={tab.id}
              value={tab.id}
              sx={{ minHeight: 36, py: 0, textTransform: "none" }}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <span>{tab.containerName}</span>
                  <CloseIcon
                    fontSize="inherit"
                    sx={{ ml: 0.5, "&:hover": { opacity: 0.7 } }}
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatch({ type: "CLOSE_TAB", paneId: pane.id, tabId: tab.id });
                    }}
                  />
                </Box>
              }
            />
          ))}
        </Tabs>
      </Box>

      {activeTab ? (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              px: 1,
              py: 0.5,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Tooltip title="Toggle timestamps">
              <IconButton
                size="small"
                color={activeTab.timestamps ? "primary" : "default"}
                onClick={() => dispatch({ type: "TOGGLE_TIMESTAMPS", paneId: pane.id, tabId: activeTab.id })}
              >
                <AccessTimeIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={activeTab.following ? "Pause following" : "Resume following"}>
              <IconButton
                size="small"
                onClick={() => dispatch({ type: "TOGGLE_FOLLOWING", paneId: pane.id, tabId: activeTab.id })}
              >
                {activeTab.following ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Clear">
              <IconButton size="small" onClick={() => logRefs.current.get(activeTab.id)?.clear()}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                ml: "auto",
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                px: 0.5,
              }}
            >
              <SearchIcon fontSize="small" sx={{ opacity: 0.6 }} />
              <InputBase
                placeholder="Find in log"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") logRefs.current.get(activeTab.id)?.findNext(search);
                }}
                sx={{ ml: 0.5, fontSize: 13, width: 160 }}
              />
            </Box>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
            {pane.tabs.map((tab) => (
              <Box
                key={tab.id}
                sx={{
                  position: "absolute",
                  inset: 0,
                  visibility: tab.id === activeTab.id ? "visible" : "hidden",
                }}
              >
                <XtermLog
                  ref={(handle) => {
                    logRefs.current.set(tab.id, handle);
                  }}
                  containerId={tab.containerId}
                  timestamps={tab.timestamps}
                  following={tab.following}
                />
              </Box>
            ))}
          </Box>
        </>
      ) : (
        <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Pick a container from the sidebar to view its logs here.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
