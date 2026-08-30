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
import RefreshIcon from "@mui/icons-material/Refresh";
import SearchIcon from "@mui/icons-material/Search";
import type { ContainerInfo } from "../types";
import type { LayoutAction } from "../state/layout";
import { listContainers } from "../api/containers";

interface ContainerPickerProps {
  focusedPaneId: string;
  dispatch: Dispatch<LayoutAction>;
}

const POLL_INTERVAL_MS = 5000;

export function ContainerPicker({ focusedPaneId, dispatch }: ContainerPickerProps) {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      setContainers(await listContainers());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const filtered = containers.filter((c) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.image.toLowerCase().includes(q);
  });

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
        {filtered.map((container) => (
          <ListItemButton
            key={container.id}
            onClick={() => dispatch({ type: "OPEN_TAB", paneId: focusedPaneId, container })}
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
      </List>
    </Box>
  );
}
