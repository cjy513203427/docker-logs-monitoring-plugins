import { useEffect, useState } from "react";
import type { Dispatch } from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import InputBase from "@mui/material/InputBase";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { CONTAINER_DRAG_MIME_TYPE, type ContainerInfo } from "../types";
import type { LayoutAction } from "../state/layout";
import { listContainers, watchContainerEvents } from "../api/containers";

interface ContainerPickerProps {
  focusedPaneId: string;
  dispatch: Dispatch<LayoutAction>;
}

const STANDALONE_GROUP_KEY = "";

type StatusFilter = "all" | "running" | "stopped";

interface ContainerGroup {
  key: string;
  label: string;
  containers: ContainerInfo[];
}

/** Groups by the `com.docker.compose.project` label so a Compose stack (like
 * this project's own mvp-* containers) reads as one collapsible unit instead
 * of an unsorted flat list. Containers with no compose label land in a
 * trailing "Standalone containers" group. */
function groupByComposeProject(containers: ContainerInfo[]): ContainerGroup[] {
  const groups = new Map<string, ContainerInfo[]>();
  for (const c of containers) {
    const key = c.composeProject ?? STANDALONE_GROUP_KEY;
    const existing = groups.get(key);
    if (existing) existing.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === STANDALONE_GROUP_KEY) return 1;
      if (b === STANDALONE_GROUP_KEY) return -1;
      return a.localeCompare(b);
    })
    .map(([key, groupContainers]) => ({
      key,
      label: key === STANDALONE_GROUP_KEY ? "Standalone containers" : key,
      containers: groupContainers,
    }));
}

export function ContainerPicker({ focusedPaneId, dispatch }: ContainerPickerProps) {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const refresh = async () => {
    try {
      setContainers(await listContainers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();

    // Event-driven instead of polling: `docker events` reacts within
    // milliseconds of a container actually starting/stopping, and costs
    // nothing between events (no fixed-interval `docker ps` calls).
    const watch = watchContainerEvents(
      () => refresh(),
      (error) => console.error("container event watch failed", error),
    );
    return () => watch.close();
  }, []);

  const runningCount = containers.filter((c) => c.state === "running").length;

  const filtered = containers.filter((c) => {
    const q = filter.trim().toLowerCase();
    const matchesText = !q || c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q);
    const isRunning = c.state === "running";
    const matchesStatus = statusFilter === "all" || (statusFilter === "running" ? isRunning : !isRunning);
    return matchesText && matchesStatus;
  });

  const groups = groupByComposeProject(filtered);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Box sx={{ width: 260, flexShrink: 0, borderRight: 1, borderColor: "divider", display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, p: 1, borderBottom: 1, borderColor: "divider" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flex: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1,
            px: 0.5,
          }}
        >
          <SearchIcon fontSize="small" sx={{ opacity: 0.6 }} />
          <InputBase
            placeholder="Filter containers"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            sx={{ ml: 0.5, fontSize: 13, width: "100%" }}
          />
        </Box>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refresh}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <ToggleButtonGroup
        size="small"
        exclusive
        fullWidth
        value={statusFilter}
        onChange={(_, value: StatusFilter | null) => value && setStatusFilter(value)}
        sx={{ px: 1, py: 0.75, borderBottom: 1, borderColor: "divider", "& .MuiToggleButton-root": { fontSize: 11, py: 0.25 } }}
      >
        <ToggleButton value="all">All ({containers.length})</ToggleButton>
        <ToggleButton value="running">Running ({runningCount})</ToggleButton>
        <ToggleButton value="stopped">Stopped ({containers.length - runningCount})</ToggleButton>
      </ToggleButtonGroup>

      <List dense sx={{ overflowY: "auto", flex: 1 }}>
        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            Loading containers…
          </Typography>
        )}
        {!loading && filtered.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No containers found.
          </Typography>
        )}
        {groups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          // Only show a group header at all once there's more than one group
          // to distinguish - a single standalone-only list stays a flat list.
          const showHeader = groups.length > 1;
          return (
            <Box key={group.key || "__standalone__"}>
              {showHeader && (
                <ListItemButton dense onClick={() => toggleGroup(group.key)} sx={{ py: 0.25 }}>
                  {isCollapsed ? <ChevronRightIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  <ListItemText
                    primary={group.label}
                    secondary={`${group.containers.length} container${group.containers.length === 1 ? "" : "s"}`}
                    primaryTypographyProps={{ fontSize: 12, fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ fontSize: 11 }}
                  />
                </ListItemButton>
              )}
              <Collapse in={!showHeader || !isCollapsed} unmountOnExit>
                {group.containers.map((container) => (
                  <ListItemButton
                    key={container.id}
                    sx={{ pl: showHeader ? 3 : 2, "&[draggable=true]": { cursor: "grab" } }}
                    onClick={() => dispatch({ type: "OPEN_TAB", paneId: focusedPaneId, container })}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(CONTAINER_DRAG_MIME_TYPE, JSON.stringify(container));
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        mr: 1,
                        bgcolor: container.state === "running" ? "success.main" : "text.disabled",
                        flexShrink: 0,
                      }}
                    />
                    <ListItemText
                      primary={container.name}
                      secondary={container.image}
                      primaryTypographyProps={{ noWrap: true, fontSize: 13 }}
                      secondaryTypographyProps={{ noWrap: true, fontSize: 11 }}
                    />
                  </ListItemButton>
                ))}
              </Collapse>
            </Box>
          );
        })}
      </List>
    </Box>
  );
}
