import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import type { TabState } from "../types";
import { startLogStream } from "../api/containers";
import { colorForContainer } from "../utils/colors";

interface MergedLogViewProps {
  tabs: TabState[];
}

interface MergedLine {
  key: string;
  containerId: string;
  containerName: string;
  timestamp: string;
  content: string;
}

const MAX_BUFFERED_LINES = 5000;
const FLUSH_INTERVAL_MS = 200;

// eslint-disable-next-line no-control-regex -- deliberately matching ANSI escapes
const ANSI_PATTERN = /\x1b\[[0-9;]*[a-zA-Z]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

function formatTimestamp(ts: string): string {
  return ts.replace("T", " ").replace(/\.\d+Z$/, "");
}

/**
 * Combines every tab currently open in a pane into one chronologically
 * interleaved, per-container-colored stream, for correlating what several
 * containers were doing at the same moment - something the per-tab xterm
 * terminals can't show since each is its own isolated view.
 *
 * This is a deliberately separate, opt-in mode: unlike XtermLog it parses
 * each line (to get a sortable timestamp) and strips ANSI escapes (since it
 * renders into plain React text, not a real terminal), so it always requests
 * `--timestamps` regardless of each tab's own toggle. The default per-tab
 * view is untouched and stays byte-for-byte raw.
 */
export function MergedLogView({ tabs }: MergedLogViewProps) {
  const [lines, setLines] = useState<MergedLine[]>([]);
  const [following, setFollowing] = useState(true);
  const bufferRef = useRef<MergedLine[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lineCounterRef = useRef(0);
  const followingRef = useRef(following);
  followingRef.current = following;

  const colors = useMemo(() => {
    const map = new Map<string, string>();
    for (const tab of tabs) map.set(tab.containerId, colorForContainer(tab.containerId));
    return map;
  }, [tabs]);

  const tabsKey = tabs.map((t) => `${t.containerId}:${t.tailLines}`).join(",");

  // (Re)start one stream per open tab whenever the set of open tabs (or a
  // tab's requested history length) changes.
  useEffect(() => {
    setLines([]);
    bufferRef.current = [];
    lineCounterRef.current = 0;

    // `docker logs` chunks arrive at arbitrary byte boundaries, not line
    // boundaries, so a line can be split across chunks - buffer the tail
    // end per container until a newline actually completes it.
    const pendingPartial = new Map<string, string>();

    const handles = tabs.map((tab) =>
      startLogStream(tab.containerId, { timestamps: true, tail: tab.tailLines }, (chunk) => {
        const combined = (pendingPartial.get(tab.containerId) ?? "") + chunk;
        const parts = combined.split("\n");
        pendingPartial.set(tab.containerId, parts.pop() ?? "");

        for (const raw of parts) {
          if (!raw) continue;
          const spaceIdx = raw.indexOf(" ");
          const timestamp = spaceIdx === -1 ? "" : raw.slice(0, spaceIdx);
          const content = spaceIdx === -1 ? raw : raw.slice(spaceIdx + 1);
          lineCounterRef.current += 1;
          bufferRef.current.push({
            key: `${tab.containerId}-${lineCounterRef.current}`,
            containerId: tab.containerId,
            containerName: tab.containerName,
            timestamp,
            content: stripAnsi(content),
          });
        }
      }),
    );

    const flush = setInterval(() => {
      if (bufferRef.current.length === 0) return;
      const newLines = bufferRef.current;
      bufferRef.current = [];
      setLines((current) => {
        const merged = [...current, ...newLines].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        return merged.length > MAX_BUFFERED_LINES ? merged.slice(merged.length - MAX_BUFFERED_LINES) : merged;
      });
    }, FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(flush);
      for (const handle of handles) handle.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsKey]);

  useEffect(() => {
    if (followingRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  if (tabs.length === 0) {
    return (
      <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Typography variant="body2" color="text.secondary">
          Open a container to see merged logs here.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1, py: 0.5, borderBottom: 1, borderColor: "divider" }}>
        <Tooltip title={following ? "Pause following" : "Resume following"}>
          <IconButton size="small" onClick={() => setFollowing((f) => !f)}>
            {following ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Clear">
          <IconButton size="small" onClick={() => setLines([])}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
          {lines.length} lines · {tabs.length} container{tabs.length === 1 ? "" : "s"}
        </Typography>
      </Box>
      <Box
        ref={scrollRef}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontSize: 12,
          px: 1,
          py: 0.5,
        }}
      >
        {lines.map((line) => (
          <Box key={line.key} sx={{ display: "flex", gap: 1, whiteSpace: "pre-wrap", wordBreak: "break-all", lineHeight: 1.7 }}>
            <Box component="span" sx={{ color: "text.secondary", flexShrink: 0 }}>
              {formatTimestamp(line.timestamp)}
            </Box>
            <Box
              component="span"
              sx={{
                flexShrink: 0,
                px: 0.5,
                borderRadius: 0.5,
                color: "#fff",
                bgcolor: colors.get(line.containerId),
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {line.containerName}
            </Box>
            <Box component="span">{line.content}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
