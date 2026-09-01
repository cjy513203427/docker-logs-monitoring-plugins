import { useState } from "react";
import type { MouseEvent } from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import ListItemIcon from "@mui/material/ListItemIcon";
import Box from "@mui/material/Box";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import { TERMINAL_THEMES } from "../utils/terminalThemes";
import { useTerminalTheme } from "../state/TerminalThemeContext";

/** Picks the terminal color palette (background/foreground/ANSI colors),
 * applied live to every open tab. This is a display-only choice - same as
 * picking a color scheme in any real terminal emulator - it never touches
 * the raw log bytes xterm renders. */
export function TerminalThemePicker() {
  const { preset, setThemeId } = useTerminalTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const open = (e: MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const close = () => setAnchorEl(null);

  return (
    <>
      <Tooltip title="Terminal color theme">
        <IconButton size="small" onClick={open}>
          <PaletteOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={close}>
        {TERMINAL_THEMES.map((t) => (
          <MenuItem
            key={t.id}
            selected={t.id === preset.id}
            onClick={() => {
              setThemeId(t.id);
              close();
            }}
          >
            <ListItemIcon>
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  bgcolor: t.previewBg,
                  border: 1,
                  borderColor: "divider",
                }}
              />
            </ListItemIcon>
            <ListItemText primary={t.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
