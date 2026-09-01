import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { startLogStream } from "../api/containers";
import type { TailLines } from "../types";
import { useTerminalTheme } from "../state/TerminalThemeContext";

export interface XtermLogHandle {
  clear(): void;
  findNext(term: string): void;
  findPrevious(term: string): void;
}

interface XtermLogProps {
  containerId: string;
  timestamps: boolean;
  following: boolean;
  tailLines: TailLines;
}

/**
 * A single container's log viewport, rendered with xterm.js — no
 * content-level processing (no coloring/parsing/reformatting of the log
 * bytes themselves), so the output is byte-for-byte what
 * `docker logs -f -t <container>` would print. The *palette* (background,
 * foreground, the 16 ANSI colors) is user-selectable via
 * TerminalThemeContext - that's a display-only concern, same as picking a
 * color scheme in any real terminal emulator, and doesn't touch the raw
 * bytes fed to xterm.
 */
export const XtermLog = forwardRef<XtermLogHandle, XtermLogProps>(function XtermLog(
  { containerId, timestamps, following, tailLines },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const followingRef = useRef(following);
  const pausedBufferRef = useRef<string[]>([]);
  const { preset: themePreset } = useTerminalTheme();
  const initialThemeRef = useRef(themePreset.theme);

  useImperativeHandle(ref, () => ({
    clear() {
      termRef.current?.clear();
    },
    findNext(term: string) {
      searchRef.current?.findNext(term);
    },
    findPrevious(term: string) {
      searchRef.current?.findPrevious(term);
    },
  }));

  useEffect(() => {
    followingRef.current = following;
    if (following && pausedBufferRef.current.length > 0) {
      const buffered = pausedBufferRef.current.splice(0);
      for (const chunk of buffered) termRef.current?.write(chunk);
    }
  }, [following]);

  // Mount the terminal once per host element.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      disableStdin: true,
      scrollback: 10000,
      cursorBlink: false,
      // Read via a ref (not the `themePreset` prop directly) so a theme
      // change doesn't belong in this effect's deps - see the dedicated
      // live-update effect below, which mutates the existing terminal's
      // theme in place instead of recreating it (recreating would clear
      // the buffer and briefly interrupt the active log stream).
      theme: initialThemeRef.current,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.open(host);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;
    searchRef.current = search;

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // host may be briefly zero-sized mid-layout; ignore and rely on the next tick
      }
    });
    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
  }, []);

  // Apply theme changes live, to the already-mounted terminal, instead of
  // recreating it - xterm.js supports assigning `terminal.options.theme`
  // post-construction (must be a new object, per its own docs: mutating the
  // existing one in place doesn't take effect). Skips the initial mount
  // (initialThemeRef already covers that) so this only fires on an actual
  // user-driven change.
  useEffect(() => {
    const term = termRef.current;
    if (!term || themePreset.theme === initialThemeRef.current) return;
    term.options.theme = themePreset.theme ? { ...themePreset.theme } : {};
  }, [themePreset]);

  // (Re)start the raw `docker logs -f` stream whenever the container, the
  // timestamp flag, or the requested history length changes; always tear the
  // previous process down first.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    term.clear();
    pausedBufferRef.current = [];

    const handle = startLogStream(containerId, { timestamps, tail: tailLines }, (chunk) => {
      if (followingRef.current) {
        term.write(chunk);
      } else {
        pausedBufferRef.current.push(chunk);
      }
    });

    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, timestamps, tailLines]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
});
