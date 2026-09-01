import { useRef, useState } from "react";
import type { Dispatch, MouseEvent } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import InputBase from "@mui/material/InputBase";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import CloseIcon from "@mui/icons-material/Close";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SearchIcon from "@mui/icons-material/Search";
import ViewListIcon from "@mui/icons-material/ViewList";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import { CONTAINER_DRAG_MIME_TYPE, type ContainerInfo, type PaneState, type PaneViewMode, type TailLines } from "../types";
import type { LayoutAction } from "../state/layout";
import { XtermLog, type XtermLogHandle } from "./XtermLog";
import { MergedLogView } from "./MergedLogView";
import { colorForContainer } from "../utils/colors";

interface LogPaneProps {
  pane: PaneState;
  isFocused: boolean;
  dispatch: Dispatch<LayoutAction>;
}

const TAIL_OPTIONS: { value: TailLines; label: string }[] = [
  { value: 500, label: "Last 500 lines" },
  { value: 5000, label: "Last 5,000 lines" },
  { value: "all", label: "Full history" },
];

export function LogPane({ pane, isFocused, dispatch }: LogPaneProps) {
  const activeTab = pane.tabs.find((t) => t.id === pane.activeTabId) ?? null;
  const [search, setSearch] = useState("");
  const logRefs = useRef(new Map<string, XtermLogHandle | null>());
  const [tailMenu, setTailMenu] = useState<{ tabId: string; top: number; left: number } | null>(null);
  // Counter, not a boolean: dragenter/dragleave fire for every child element
  // the pointer crosses too, not just the pane's own boundary, so a naive
  // boolean flickers on/off as the drag moves over tabs/content inside.
  const [dragOverDepth, setDragOverDepth] = useState(0);

  const openTailMenu = (e: MouseEvent, tabId: string) => {
    e.preventDefault();
    setTailMenu({ tabId, top: e.clientY, left: e.clientX });
  };

  const isContainerDrag = (e: { dataTransfer: DataTransfer }) => e.dataTransfer.types.includes(CONTAINER_DRAG_MIME_TYPE);

  return (
    <Box
      onMouseDown={() => dispatch({ type: "FOCUS_PANE", paneId: pane.id })}
      onDragEnter={(e) => {
        if (!isContainerDrag(e)) return;
        e.preventDefault();
        setDragOverDepth((d) => d + 1);
      }}
      onDragOver={(e) => {
        if (!isContainerDrag(e)) return;
        e.preventDefault(); // required for onDrop to ever fire
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (!isContainerDrag(e)) return;
        setDragOverDepth((d) => Math.max(0, d - 1));
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData(CONTAINER_DRAG_MIME_TYPE);
        if (!raw) return;
        e.preventDefault();
        setDragOverDepth(0);
        const container = JSON.parse(raw) as ContainerInfo;
        dispatch({ type: "OPEN_TAB", paneId: pane.id, container });
      }}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        outline: (theme) =>
          dragOverDepth > 0
            ? `2px dashed ${theme.palette.primary.main}`
            : isFocused
              ? `2px solid ${theme.palette.primary.main}`
              : "2px solid transparent",
        outlineOffset: "-2px",
        bgcolor: dragOverDepth > 0 ? "action.hover" : undefined,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", borderBottom: 1, borderColor: "divider" }}>
        {pane.viewMode === "merged" ? (
          // No tab is "active" once the content below is every open tab
          // merged together - a normal Tabs strip would falsely imply one
          // is selected. A row of removable chips (colored to match their
          // lines in the merged view) says "these are all included" instead.
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flex: 1, minWidth: 0, px: 1, py: 0.75, overflowX: "auto" }}>
            {pane.tabs.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                No containers in this merge yet
              </Typography>
            )}
            {pane.tabs.map((tab) => (
              <Chip
                key={tab.id}
                size="small"
                label={tab.containerName}
                onContextMenu={(e) => openTailMenu(e, tab.id)}
                onDelete={() => dispatch({ type: "CLOSE_TAB", paneId: pane.id, tabId: tab.id })}
                sx={{
                  bgcolor: colorForContainer(tab.containerId),
                  color: "#fff",
                  flexShrink: 0,
                  "& .MuiChip-deleteIcon": { color: "rgba(255,255,255,0.7)", "&:hover": { color: "#fff" } },
                }}
              />
            ))}
          </Stack>
        ) : (
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
                onContextMenu={(e) => openTailMenu(e, tab.id)}
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
        )}
        <ToggleButtonGroup
          size="small"
          exclusive
          value={pane.viewMode}
          onChange={(_, value: PaneViewMode | null) =>
            value && dispatch({ type: "SET_PANE_VIEW_MODE", paneId: pane.id, viewMode: value })
          }
          sx={{ mr: 0.5, flexShrink: 0 }}
        >
          <ToggleButton value="tabs">
            <Tooltip title="One terminal per tab">
              <ViewListIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="merged">
            <Tooltip title="Merge open tabs into one time-ordered stream">
              <CallMergeIcon fontSize="small" />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Menu
        open={tailMenu !== null}
        onClose={() => setTailMenu(null)}
        anchorReference="anchorPosition"
        anchorPosition={tailMenu ? { top: tailMenu.top, left: tailMenu.left } : undefined}
      >
        {TAIL_OPTIONS.map((opt) => {
          const tab = pane.tabs.find((t) => t.id === tailMenu?.tabId);
          return (
            <MenuItem
              key={opt.value}
              selected={tab?.tailLines === opt.value}
              onClick={() => {
                if (tailMenu) {
                  dispatch({ type: "SET_TAIL_LINES", paneId: pane.id, tabId: tailMenu.tabId, tailLines: opt.value });
                }
                setTailMenu(null);
              }}
            >
              <ListItemText primary={opt.label} />
            </MenuItem>
          );
        })}
      </Menu>

      {pane.viewMode === "merged" ? (
        <MergedLogView tabs={pane.tabs} />
      ) : activeTab ? (
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
            <Tooltip title="How much history this tab loaded - click to change">
              <Chip
                size="small"
                variant="outlined"
                label={activeTab.tailLines === "all" ? "full history" : `last ${activeTab.tailLines}`}
                onClick={(e) => openTailMenu(e, activeTab.id)}
                sx={{ ml: 0.5, fontSize: 11, "& .MuiChip-label": { px: 1 } }}
              />
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
                  tailLines={tab.tailLines}
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
