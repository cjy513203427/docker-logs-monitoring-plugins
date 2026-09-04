import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined";

const TIPS: { title: string; body: string }[] = [
  {
    title: "Drag a container onto a pane",
    body: "Instead of focusing a pane first and then clicking a container in the sidebar, drag it straight from the sidebar onto whichever pane you want it to open in.",
  },
  {
    title: "Ctrl+Tab / Ctrl+Shift+Tab",
    body: "Cycles through the tabs of whichever pane is currently focused, same as browsers and VS Code.",
  },
  {
    title: "Ctrl+F / Cmd+F",
    body: 'Jumps straight to the "Find in log" box of whichever pane is currently focused, instead of the browser\'s own find. Enter jumps to the next match, Shift+Enter to the previous one.',
  },
  {
    title: "Change how much history a tab loads",
    body: 'Click the "last 500" chip in a tab\'s toolbar (or right-click the tab itself) to switch between the last 500 lines, last 5,000, or full history.',
  },
  {
    title: "Merge a pane's tabs into one stream",
    body: "The two icons at the right of a pane's tab strip switch between one-terminal-per-tab and a merged view: every open tab in that pane combined into a single time-ordered, per-container-colored stream - useful for correlating what several containers were doing at the same moment. Works across containers from different Compose projects too.",
  },
  {
    title: "Sidebar: status filter and Compose grouping",
    body: 'The All/Running/Stopped row filters by container state, on top of the text search. Containers started by the same Compose project are grouped into a collapsible section automatically.',
  },
  {
    title: "Large-monitor layouts",
    body: "Besides the usual single/split/2×2 layouts, the two rightmost icons in the top bar give 3×2 (6 panes) and 3×3 (9 panes) grids for bigger screens.",
  },
];

export function Tips() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip title="Tips">
        <IconButton size="small" onClick={() => setOpen(true)}>
          <LightbulbOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Tips</DialogTitle>
        <DialogContent>
          <List dense>
            {TIPS.map((tip) => (
              <ListItem key={tip.title} disableGutters sx={{ display: "block", py: 1 }}>
                <ListItemText
                  primary={tip.title}
                  secondary={tip.body}
                  primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                  secondaryTypographyProps={{ fontSize: 13 }}
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={() => setOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
