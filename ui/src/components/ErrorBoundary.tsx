import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without this, an exception thrown anywhere during render (e.g. the
 * `docker-mui-theme` / `createDockerDesktopClient` failures this extension
 * has already hit once each) unmounts the whole tree and leaves a silent
 * blank panel - no error, no signal, nothing to screenshot or report. This
 * turns that into a visible message instead.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Logs Console crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 3, fontFamily: "monospace" }}>
          <Typography variant="h6" color="error" gutterBottom>
            Logs Console crashed
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </Typography>
        </Box>
      );
    }
    return this.props.children;
  }
}
