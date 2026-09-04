import { useEffect, useRef, useState } from "react";
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
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import ViewListIcon from "@mui/icons-material/ViewList";
import CallMergeIcon from "@mui/icons-material/CallMerge";
import { CONTAINER_DRAG_MIME_TYPE, type ContainerInfo, type PaneState, type PaneViewMode, type TailLines } from "../types";
import type { LayoutAction } from "../state/layout";
import { XtermLog, type XtermLogHandle, type SearchResultInfo } from "./XtermLog";
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
  const [searchResults, setSearchResults] = useState<SearchResultInfo | null>(null);
  const logRefs = useRef(new Map<string, XtermLogHandle | null>());
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // The match count/position is per-tab (each tab has its own SearchAddon
  // instance - see XtermLog), but the toolbar above is per-pane, so drop
  // whatever the previously-active tab reported whenever the active tab
  // changes rather than showing its stale count against the new one.
  useEffect(() => {
    setSearchResults(null);
  }, [activeTab?.id]);

  const runSearch = (direction: "next" | "previous") => {
    if (!activeTab || !search) return;
    const handle = logRefs.current.get(activeTab.id);
    if (direction === "next") handle?.findNext(search);
    else handle?.findPrevious(search);
  };
  const [tailMenu, setTailMenu] = useState<{ tabId: string; top: number; left: number } | null>(null);
  // Counter, not a boolean: dragenter/dragleave fire for every child element
  // the pointer crosses too, not just the pane's own boundary, so a naive
  // boolean flickers on/off as the drag moves over tabs/content inside.
  const [dragOverDepth, setDragOverDepth] = useState(0);

  // Ctrl+F / Cmd+F focuses this pane's "Find in log" box instead of the
  // browser's own find - only for whichever pane is currently focused, and
  // only when that box actually exists (the "tabs" view with an active tab;
  // "merged" mode has no search UI of its own).
  //
  // Registered on the *capture* phase for the same reason as the Ctrl+Tab
  // listener in App.tsx: xterm.js's hidden textarea has its own capture-
  // phase keydown listener, and - confirmed by reading its source - a plain
  // Ctrl+F reaching a focused terminal gets mapped to the ACK control
  // character and unconditionally preventDefault()+stopPropagation()'d
  // there (this happens *despite* `disableStdin: true` on XtermLog's
  // Terminal - disableStdin only suppresses sending the resulting byte
  // onward, not the swallow itself - same root cause as the Tab gotcha).
  // A bubble-phase listener would never see the keydown at all once any
  // pane's terminal has focus; capture always visits window first.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isFocused || pane.viewMode === "merged" || !activeTab) return;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      e.stopPropagation();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isFocused, pane.viewMode, activeTab]);

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
                inputRef={searchInputRef}
                placeholder="Find in log"
                value={search}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearch(value);
                  const handle = logRefs.current.get(activeTab.id);
                  if (!value) {
                    // Empty search: drop the highlights instead of leaving
                    // the last term's matches lit up with nothing to jump
                    // between.
                    handle?.clearSearch();
                  } else {
                    // `incremental` re-highlights on every keystroke without
                    // jumping to a brand-new match each time, matching how a
                    // browser's own find-in-page behaves while typing.
                    handle?.findNext(value, true);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch(e.shiftKey ? "previous" : "next");
                  } else if (e.key === "Escape") {
                    setSearch("");
                    logRefs.current.get(activeTab.id)?.clearSearch();
                  }
                }}
                sx={{ ml: 0.5, fontSize: 13, width: 160 }}
              />
              {search && (
                <>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ mx: 0.5, minWidth: 36, textAlign: "center", flexShrink: 0 }}
                  >
                    {searchResults
                      ? searchResults.resultCount === 0
                        ? "0/0"
                        : `${searchResults.resultIndex + 1}/${searchResults.resultCount}`
                      : ""}
                  </Typography>
                  <Tooltip title="Previous match (Shift+Enter)">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!searchResults || searchResults.resultCount === 0}
                        onClick={() => runSearch("previous")}
                      >
                        <KeyboardArrowUpIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Next match (Enter)">
                    <span>
                      <IconButton
                        size="small"
                        disabled={!searchResults || searchResults.resultCount === 0}
                        onClick={() => runSearch("next")}
                      >
                        <KeyboardArrowDownIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </>
              )}
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
                  streamEpoch={tab.streamEpoch}
                  onSearchResults={(results) => {
                    // XtermLog instances for every open tab stay mounted
                    // (just hidden - see the visibility toggle above) so
                    // their streams keep following in the background; guard
                    // against a background tab's own re-highlight-on-new-
                    // lines updates overwriting the toolbar for whichever
                    // tab is actually focused right now.
                    if (tab.id === activeTab.id) setSearchResults(results);
                  }}
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
