import { useEffect, useRef, useCallback } from "react";
import { useStdin } from "ink";
import { CTRL_B, PREFIX_TIMEOUT_MS } from "../utils/constants.js";
import type { AppMode, AppAction, Session } from "../state/types.js";

interface InputRouterOptions {
  mode: AppMode;
  activeSession: Session | undefined;
  dispatch: React.Dispatch<AppAction>;
  onCreateSession: () => void;
  onCloseSession: () => void;
  onQuit: () => void;
}

export function useInputRouter({
  mode,
  activeSession,
  dispatch,
  onCreateSession,
  onCloseSession,
  onQuit,
}: InputRouterOptions) {
  const { stdin, setRawMode } = useStdin();
  const prefixActiveRef = useRef(false);
  const prefixTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPrefixTimeout = useCallback(() => {
    if (prefixTimeoutRef.current !== null) {
      clearTimeout(prefixTimeoutRef.current);
      prefixTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setRawMode(true);

    const onData = (data: Buffer) => {
      const str = data.toString();

      // If a modal is active, let ink's useInput handle it
      if (mode === "creating-session" || mode === "confirming-close") {
        return;
      }

      // Check for prefix key (Ctrl+B)
      if (str === CTRL_B && !prefixActiveRef.current) {
        prefixActiveRef.current = true;
        clearPrefixTimeout();

        prefixTimeoutRef.current = setTimeout(() => {
          prefixActiveRef.current = false;
          prefixTimeoutRef.current = null;
          if (activeSession && activeSession.exitCode === null) {
            activeSession.pty.write(CTRL_B);
          }
        }, PREFIX_TIMEOUT_MS);
        return;
      }

      // Handle prefix commands
      if (prefixActiveRef.current) {
        prefixActiveRef.current = false;
        clearPrefixTimeout();

        handlePrefixCommand(str, dispatch, onCreateSession, onCloseSession, onQuit);
        return;
      }

      // Normal mode: forward to active pty
      if (activeSession && activeSession.exitCode === null) {
        activeSession.pty.write(str);
      }
    };

    if (stdin) {
      stdin.on("data", onData);
    }

    return () => {
      if (stdin) {
        stdin.off("data", onData);
      }
      clearPrefixTimeout();
    };
  }, [stdin, setRawMode, mode, activeSession, dispatch, onCreateSession, onCloseSession, onQuit, clearPrefixTimeout]);

  useEffect(() => {
    return () => {
      clearPrefixTimeout();
    };
  }, [clearPrefixTimeout]);
}

function handlePrefixCommand(
  key: string,
  dispatch: React.Dispatch<AppAction>,
  onCreateSession: () => void,
  onCloseSession: () => void,
  onQuit: () => void,
): void {
  if (key === "q" || key === "Q") {
    onQuit();
    return;
  }

  if (key === "n" || key === "N") {
    onCreateSession();
    return;
  }

  if (key === "w" || key === "W") {
    onCloseSession();
    return;
  }

  if (key === "]") {
    dispatch({ type: "NEXT_TAB" });
    return;
  }

  if (key === "[") {
    dispatch({ type: "PREV_TAB" });
    return;
  }

  const num = parseInt(key, 10);
  if (num >= 1 && num <= 9) {
    dispatch({ type: "JUMP_TO_TAB", index: num - 1 });
    return;
  }

  if (key === "\x1b[A" || key === "A") {
    dispatch({ type: "SCROLL_UP", lines: 5 });
    return;
  }

  if (key === "\x1b[B" || key === "B") {
    dispatch({ type: "SCROLL_DOWN", lines: 5 });
    return;
  }
}
