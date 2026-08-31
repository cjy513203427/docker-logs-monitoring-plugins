import React from "react";
import ReactDOM from "react-dom/client";
import CssBaseline from "@mui/material/CssBaseline";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { App } from "./components/App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { cleanupOrphanedLogStreams } from "./api/containers";

// `@docker/docker-mui-theme`'s `DockerMuiThemeProvider` reads its palette off
// a `window.__ddMuiV5Themes` global that Docker Desktop's host page doesn't
// reliably inject (it throws `Cannot read properties of undefined (reading
// 'light')` on first render, which blanks the whole panel since nothing gets
// committed to #root). Build the light/dark theme locally instead so the
// extension doesn't depend on that injection.
function Root() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", { noSsr: true });
  const theme = React.useMemo(() => createTheme({ palette: { mode: prefersDark ? "dark" : "light" } }), [prefersDark]);

  // Once, on startup: sweep up any `docker logs -f` processes orphaned by a
  // previous session that didn't shut down cleanly (see
  // cleanupOrphanedLogStreams for why that's a real risk here). Runs from an
  // effect - after mount, not at module load - for the same reason ddClient
  // access is lazy: don't gate the whole panel's first paint on it.
  React.useEffect(() => {
    cleanupOrphanedLogStreams();
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
