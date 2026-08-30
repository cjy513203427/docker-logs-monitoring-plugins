import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { startLogStream } from "../api/containers";

export interface XtermLogHandle {
  clear(): void;
  findNext(term: string): void;
  findPrevious(term: string): void;
}

interface XtermLogProps {
  containerId: string;
  timestamps: boolean;
  following: boolean;
}

/**
 * A single container's log viewport, rendered with xterm.js using its
 * built-in default theme — intentionally no custom colors/fonts/CSS are
 * applied here so the output looks exactly like running
 * `docker logs -f -t <container>` in a real terminal.
 */
export const XtermLog = forwardRef<XtermLogHandle, XtermLogProps>(function XtermLog(
  { containerId, timestamps, following },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const followingRef = useRef(following);
  const pausedBufferRef = useRef<string[]>([]);

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
      // No `theme` set on purpose: xterm's default theme is what a real
      // terminal looks like, matching Docker's own native log view.
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

  // (Re)start the raw `docker logs -f` stream whenever the container or the
  // timestamp flag changes; always tear the previous process down first.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    term.clear();
    pausedBufferRef.current = [];

    const handle = startLogStream(containerId, { timestamps }, (chunk) => {
      if (followingRef.current) {
        term.write(chunk);
      } else {
        pausedBufferRef.current.push(chunk);
      }
    });

    return () => handle.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, timestamps]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%" }} />;
});
