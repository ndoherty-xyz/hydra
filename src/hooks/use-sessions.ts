import { useCallback, useRef } from "react";
import { createTerminal, resizeTerminal, disposeTerminal } from "../services/terminal-emulator.js";
import { spawnClaude, resizePty, killPty } from "../services/pty-manager.js";
import { WorktreeManager } from "../services/worktree-manager.js";
import type { Session, AppAction } from "../state/types.js";

let sessionCounter = 0;

function generateSessionId(): string {
  return `session-${++sessionCounter}-${Date.now()}`;
}

export function useSessions(
  dispatch: React.Dispatch<AppAction>,
  repoRoot: string,
  cols: number,
  paneRows: number,
  onPtyData?: (sessionId: string) => void,
) {
  const worktreeManagerRef = useRef(new WorktreeManager(repoRoot));
  const onPtyDataRef = useRef(onPtyData);
  onPtyDataRef.current = onPtyData;

  const createSession = useCallback(
    async (branch: string) => {
      const wm = worktreeManagerRef.current;

      // 1. Create worktree
      const worktreePath = await wm.addWorktree(branch);

      // 2. Create xterm terminal
      const terminal = createTerminal(cols, paneRows);

      // 3. Spawn claude in the worktree
      const proc = spawnClaude(worktreePath, cols, paneRows);

      const sessionId = generateSessionId();

      // 4. Wire pty output → xterm terminal
      proc.onData((data) => {
        terminal.write(data);
        onPtyDataRef.current?.(sessionId);
      });

      // 5. Handle pty exit
      proc.onExit(({ exitCode }) => {
        dispatch({ type: "SESSION_EXITED", sessionId, exitCode });
        onPtyDataRef.current?.(sessionId);
      });

      const session: Session = {
        id: sessionId,
        branch,
        worktreePath,
        terminal,
        pty: proc,
        exitCode: null,
      };

      // 6. Add session to state
      dispatch({ type: "ADD_SESSION", session });
    },
    [dispatch, cols, paneRows],
  );

  const closeSession = useCallback(
    async (session: Session) => {
      const wm = worktreeManagerRef.current;

      // 1. Kill the pty
      killPty(session.pty);

      // 2. Dispose the terminal
      disposeTerminal(session.terminal);

      // 3. Remove worktree
      try {
        await wm.removeWorktree(session.worktreePath);
      } catch {
        // Worktree removal might fail; that's okay
      }

      // 4. Remove from state
      dispatch({ type: "REMOVE_SESSION", sessionId: session.id });
    },
    [dispatch],
  );

  const resizeAllSessions = useCallback(
    (sessions: Session[], newCols: number, newRows: number) => {
      for (const session of sessions) {
        if (session.exitCode !== null) continue;
        resizeTerminal(session.terminal, newCols, newRows);
        resizePty(session.pty, newCols, newRows);
        onPtyDataRef.current?.(session.id);
      }
    },
    [],
  );

  const cleanupOrphans = useCallback(async () => {
    const wm = worktreeManagerRef.current;
    await wm.cleanupOrphans();
  }, []);

  return { createSession, closeSession, resizeAllSessions, cleanupOrphans };
}
