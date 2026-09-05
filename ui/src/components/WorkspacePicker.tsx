import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import CheckIcon from "@mui/icons-material/Check";
import AddIcon from "@mui/icons-material/Add";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import type { Workspace } from "../types";

interface WorkspacePickerProps {
  workspaces: Workspace[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (mode: "blank" | "duplicate") => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Top-bar dropdown for switching between saved workspaces ("Layout 1",
 * "debug backend", ...). Each one is a whole arrangement - grid shape,
 * divider positions, which containers are open where - so this is how you
 * keep a two-pane "api + database" setup and a 3x3 "everything" setup side by
 * side instead of rebuilding one into the other by hand.
 *
 * There is deliberately no Save button: edits go straight into whichever
 * workspace is selected (see App.tsx), the same way the rest of the panel
 * already persists itself. The only explicit actions are the structural ones
 * - create, rename, delete.
 */
export function WorkspacePicker({ workspaces, activeId, onSwitch, onCreate, onRename, onDelete }: WorkspacePickerProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Workspace | null>(null);

  const active = workspaces.find((w) => w.id === activeId) ?? workspaces[0];
  const close = () => setAnchorEl(null);

  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    // An empty name would render as an unclickable blank row in this menu.
    if (name) onRename(renaming.id, name);
    setRenaming(null);
  };

  return (
    <>
      <Tooltip title="Saved layouts - grid, divider positions and open containers">
        <Button
          size="small"
          color="inherit"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          endIcon={<ArrowDropDownIcon />}
          sx={{ textTransform: "none", maxWidth: 200 }}
        >
          <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {active?.name ?? "Layout"}
          </Box>
        </Button>
      </Tooltip>

      <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={close}>
        {workspaces.map((workspace) => (
          <MenuItem
            key={workspace.id}
            selected={workspace.id === activeId}
            onClick={() => {
              if (workspace.id !== activeId) onSwitch(workspace.id);
              close();
            }}
          >
            <ListItemIcon>{workspace.id === activeId ? <CheckIcon fontSize="small" /> : null}</ListItemIcon>
            <ListItemText primary={workspace.name} />
          </MenuItem>
        ))}

        <Divider />

        <MenuItem
          onClick={() => {
            onCreate("blank");
            close();
          }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="New empty layout" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            onCreate("duplicate");
            close();
          }}
        >
          <ListItemIcon>
            <ContentCopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Duplicate this layout" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setRenaming({ id: active.id, name: active.name });
            close();
          }}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Rename this layout" />
        </MenuItem>
        <MenuItem
          // Never leave the user with zero layouts - there'd be nothing to
          // fall back to and nowhere to put the panes.
          disabled={workspaces.length <= 1}
          onClick={() => {
            setDeleting(active);
            close();
          }}
        >
          <ListItemIcon>
            <DeleteOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primary="Delete this layout" />
        </MenuItem>
      </Menu>

      <Dialog open={renaming !== null} onClose={() => setRenaming(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Rename layout</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            variant="standard"
            label="Name"
            value={renaming?.name ?? ""}
            onChange={(e) => setRenaming((r) => (r ? { ...r, name: e.target.value } : r))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenaming(null)}>Cancel</Button>
          <Button onClick={commitRename} disabled={!renaming?.name.trim()}>
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete layout</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Delete "{deleting?.name}"? Its panes and open containers can't be recovered.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancel</Button>
          <Button
            color="error"
            onClick={() => {
              if (deleting) onDelete(deleting.id);
              setDeleting(null);
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
