import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useApp } from "ink";
import { FullScreen } from "./components/full-screen.js";
import { TabBar } from "./components/tab-bar.js";
import { TerminalPane } from "./components/terminal-pane.js";
import { StatusBar } from "./components/status-bar.js";
import { SessionCreator } from "./components/session-creator.js";
import { ConfirmDialog } from "./components/confirm-dialog.js";
import {
  AppStateContext,
  AppDispatchContext,
  useAppStore,
} from "./state/session-store.js";
import { useInputRouter } from "./hooks/use-input-router.js";
import { useSessions } from "./hooks/use-sessions.js";
import { installSignalHandlers } from "./services/cleanup.js";

// Tab bar = 1 row, status bar = 1 row, border top/bottom = 2 rows
const CHROME_ROWS = 4;
const CHROME_COLS = 2; // border left + border right

interface AppInnerProps {
  repoRoot: string;
}

function AppInner({ repoRoot }: AppInnerProps) {
  const [state, dispatch] = useAppStore();
  const { exit } = useApp();

  const [innerRows, setInnerRows] = useState(
    Math.max(1, process.stdout.rows - CHROME_ROWS),
  );
  const [innerCols, setInnerCols] = useState(
    Math.max(1, process.stdout.columns - CHROME_COLS),
  );

  useEffect(() => {
    const onResize = () => {
      setInnerRows(Math.max(1, process.stdout.rows - CHROME_ROWS));
      setInnerCols(Math.max(1, process.stdout.columns - CHROME_COLS));
    };
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.removeListener("resize", onResize);
    };
  }, []);

  const activeSession = state.sessions.find(
    (s) => s.id === state.activeSessionId,
  );

  const notifyDirtyRef = useRef<() => void>(() => {});

  const activeSessionIdRef = useRef(state.activeSessionId);
  activeSessionIdRef.current = state.activeSessionId;

  const onPtyData = useCallback(
    (sessionId: string) => {
      if (sessionId === activeSessionIdRef.current) {
        notifyDirtyRef.current();
      }
    },
    [],
  );

  const { createSession, closeSession, resizeAllSessions, cleanupOrphans } =
    useSessions(dispatch, repoRoot, innerCols, innerRows, onPtyData);

  // Resize sessions when terminal size changes
  const prevDims = useRef({ innerCols, innerRows });
  useEffect(() => {
    if (
      innerCols !== prevDims.current.innerCols ||
      innerRows !== prevDims.current.innerRows
    ) {
      prevDims.current = { innerCols, innerRows };
      resizeAllSessions(state.sessions, innerCols, innerRows);
    }
  }, [innerCols, innerRows, state.sessions, resizeAllSessions]);

  // Cleanup orphans on startup
  useEffect(() => {
    cleanupOrphans().catch(() => {});
  }, [cleanupOrphans]);

  // Install signal handlers for clean shutdown
  const sessionsRef = useRef(state.sessions);
  sessionsRef.current = state.sessions;
  useEffect(() => {
    const removeHandlers = installSignalHandlers(
      () => sessionsRef.current,
      repoRoot,
      exit,
    );
    return removeHandlers;
  }, [repoRoot, exit]);

  const onCreateSession = useCallback(() => {
    dispatch({ type: "SET_MODE", mode: "creating-session" });
  }, [dispatch]);

  const onCloseSession = useCallback(() => {
    if (activeSession) {
      dispatch({ type: "SET_MODE", mode: "confirming-close" });
    }
  }, [dispatch, activeSession]);

  const [error, setError] = useState<string | null>(null);

  const handleSessionCreate = useCallback(
    async (branch: string) => {
      dispatch({ type: "SET_MODE", mode: "normal" });
      setError(null);
      try {
        await createSession(branch);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [dispatch, createSession],
  );

  const handleSessionClose = useCallback(async () => {
    dispatch({ type: "SET_MODE", mode: "normal" });
    if (activeSession) {
      await closeSession(activeSession);
      // If no sessions left, exit
      if (state.sessions.length <= 1) {
        exit();
      }
    }
  }, [dispatch, activeSession, closeSession, state.sessions.length, exit]);

  const handleModalCancel = useCallback(() => {
    dispatch({ type: "SET_MODE", mode: "normal" });
  }, [dispatch]);

  const handleQuit = useCallback(async () => {
    const { cleanupAllSessions } = await import("./services/cleanup.js");
    await cleanupAllSessions(state.sessions, repoRoot);
    exit();
  }, [state.sessions, repoRoot, exit]);

  useInputRouter({
    mode: state.mode,
    activeSession,
    dispatch,
    onCreateSession,
    onCloseSession,
    onQuit: handleQuit,
  });

  return (
    <AppStateContext.Provider value={state}>
      <AppDispatchContext.Provider value={dispatch}>
        <FullScreen>
          <TabBar />
          <Box
            flexGrow={1}
            borderStyle="single"
            borderColor="gray"
            flexDirection="column"
          >
            {state.mode === "creating-session" ? (
              <SessionCreator
                onSubmit={handleSessionCreate}
                onCancel={handleModalCancel}
              />
            ) : state.mode === "confirming-close" && activeSession ? (
              <ConfirmDialog
                message={`Close session "${activeSession.branch}"? This will remove the worktree.`}
                onConfirm={handleSessionClose}
                onCancel={handleModalCancel}
              />
            ) : (
              <TerminalPane notifyDirtyRef={notifyDirtyRef} visibleRows={innerRows} activeSession={activeSession} scrollOffset={state.scrollOffset} />
            )}
          </Box>
          {error && (
            <Box height={1}>
              <Text color="red" bold>Error: {error}</Text>
            </Box>
          )}
          <StatusBar />
        </FullScreen>
      </AppDispatchContext.Provider>
    </AppStateContext.Provider>
  );
}

export function App({ repoRoot }: { repoRoot: string }) {
  return <AppInner repoRoot={repoRoot} />;
}
