import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon, type ISearchOptions } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { startLogStream } from "../api/containers";
import type { TailLines } from "../types";
import { useTerminalTheme } from "../state/TerminalThemeContext";

export interface SearchResultInfo {
  resultIndex: number;
  resultCount: number;
}

export interface XtermLogHandle {
  clear(): void;
  findNext(term: string, incremental?: boolean): void;
  findPrevious(term: string): void;
  clearSearch(): void;
}

interface XtermLogProps {
  containerId: string;
  timestamps: boolean;
  following: boolean;
  tailLines: TailLines;
  /** Bumped by the SYNC_CONTAINERS reducer case to force a stream restart
   * (e.g. the container stopped and started again under the same id) even
   * though containerId/timestamps/tailLines are unchanged - see TabState. */
  streamEpoch: number;
  /** Fires whenever the SearchAddon's own match count/position changes
   * (typing, Enter/Shift+Enter, or new log lines arriving while a search
   * term is active) - lets LogPane's toolbar show "2/17" and enable/disable
   * its prev/next buttons. Rgba colors below aren't a typo despite the
   * addon's `#RRGGBB`-only doc comment - decorations are plain DOM elements
   * with a CSS backgroundColor (confirmed by reading addon-search's
   * source), so translucent highlights that don't fully hide the
   * underlying text/theme work fine in both light and dark terminals. */
  onSearchResults?: (results: SearchResultInfo | null) => void;
}

const SEARCH_DECORATIONS: NonNullable<ISearchOptions["decorations"]> = {
  matchBackground: "rgba(255, 200, 0, 0.35)",
  matchOverviewRuler: "rgba(255, 200, 0, 0.6)",
  activeMatchBackground: "rgba(255, 140, 0, 0.65)",
  activeMatchColorOverviewRuler: "rgba(255, 140, 0, 1)",
};

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
  { containerId, timestamps, following, tailLines, streamEpoch, onSearchResults },
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
  // Kept in a ref (not read directly in the mount effect) so the
  // onDidChangeResults subscription set up once at mount always calls
  // whatever the latest `onSearchResults` prop is, same pattern as
  // followingRef above.
  const onSearchResultsRef = useRef(onSearchResults);
  useEffect(() => {
    onSearchResultsRef.current = onSearchResults;
  }, [onSearchResults]);

  useImperativeHandle(ref, () => ({
    clear() {
      termRef.current?.clear();
    },
    findNext(term: string, incremental?: boolean) {
      // `decorations` is what makes the addon highlight every match (not
      // just the current selection) - see SEARCH_DECORATIONS above.
      // `incremental` expands/contracts the current match as the user
      // keeps typing instead of jumping to a whole new one on every
      // keystroke; the addon's own docs note it's meaningful for findNext
      // only, not findPrevious.
      searchRef.current?.findNext(term, { decorations: SEARCH_DECORATIONS, incremental });
    },
    findPrevious(term: string) {
      searchRef.current?.findPrevious(term, { decorations: SEARCH_DECORATIONS });
    },
    clearSearch() {
      searchRef.current?.clearDecorations();
      onSearchResultsRef.current?.(null);
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
      // Required for SearchAddon's match highlighting: it draws matches with
      // `registerDecoration`, which xterm.js still classes as proposed API -
      // calling it without this *throws* ("You must set the allowProposedApi
      // option to true to use proposed API"). The throw happens inside our
      // own find/keystroke handler, so it never reaches ErrorBoundary and
      // never shows up on screen: search silently highlights nothing and the
      // match counter stays blank, which is exactly how this shipped broken
      // once already. tsc can't catch it (the option is optional and the
      // addon's types say nothing about it) - it only reproduces at runtime.
      allowProposedApi: true,
      // Gives the search decorations somewhere to draw their scrollbar tick
      // marks (`matchOverviewRuler`/`activeMatchColorOverviewRuler` in
      // SEARCH_DECORATIONS): xterm only builds the overview-ruler renderer at
      // all when this is non-zero, so without it matches outside the current
      // viewport are invisible until you scroll onto them.
      overviewRulerWidth: 14,
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

    const searchResultsDisposable = search.onDidChangeResults((results) => onSearchResultsRef.current?.(results));

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // host may be briefly zero-sized mid-layout; ignore and rely on the next tick
      }
    });
    resizeObserver.observe(host);

    return () => {
      searchResultsDisposable.dispose();
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
  // timestamp flag, the requested history length, or streamEpoch (a forced-
  // restart signal from SYNC_CONTAINERS - see TabState) changes; always tear
  // the previous process down first.
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
  }, [containerId, timestamps, tailLines, streamEpoch]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
});
