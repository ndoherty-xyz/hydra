import { useState, useEffect, useRef, useCallback } from "react";
import { renderBuffer } from "../services/buffer-renderer.js";
import type { Session } from "../state/types.js";

const FALLBACK_POLL_MS = 500;

/**
 * Event-driven terminal renderer with coalescing.
 *
 * Instead of polling every 50ms, callers invoke `notifyDirty()` when new PTY
 * data arrives.  A `setTimeout(0)` coalesces rapid bursts into a single render.
 * Frame comparison prevents React re-renders when the buffer hasn't changed.
 * A 500ms fallback poll catches edge cases (resize, cursor blink).
 */
export function useTerminalRenderer(
  activeSession: Session | undefined,
  visibleRows: number,
  scrollOffset: number,
): { lines: string[]; notifyDirty: () => void } {
  const [lines, setLines] = useState<string[]>([]);

  // Keep mutable refs so the render callback is stable
  const sessionRef = useRef(activeSession);
  const visibleRowsRef = useRef(visibleRows);
  const scrollOffsetRef = useRef(scrollOffset);
  const prevFrameRef = useRef("");
  const pendingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  sessionRef.current = activeSession;
  visibleRowsRef.current = visibleRows;
  scrollOffsetRef.current = scrollOffset;

  const doRender = useCallback(() => {
    pendingRef.current = false;
    timerRef.current = null;

    const session = sessionRef.current;
    if (!session) return;

    try {
      const rendered = renderBuffer(
        session.terminal,
        scrollOffsetRef.current,
        visibleRowsRef.current,
      );
      const frame = rendered.join("\n");
      if (frame !== prevFrameRef.current) {
        prevFrameRef.current = frame;
        setLines(rendered);
      }
    } catch {
      // Terminal may have been disposed
    }
  }, []);

  const notifyDirty = useCallback(() => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    timerRef.current = setTimeout(doRender, 0);
  }, [doRender]);

  // Fallback poll for edge cases (resize, cursor blink)
  useEffect(() => {
    const interval = setInterval(doRender, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [doRender]);

  // Immediate render when scrollOffset changes
  useEffect(() => {
    doRender();
  }, [scrollOffset, doRender]);

  // Clear lines when session changes
  useEffect(() => {
    prevFrameRef.current = "";
    if (!activeSession) {
      setLines([]);
    } else {
      doRender();
    }
  }, [activeSession?.id, doRender]);

  // Cleanup pending timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { lines, notifyDirty };
}
