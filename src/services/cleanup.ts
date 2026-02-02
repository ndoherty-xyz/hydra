import type { Session } from "../state/types.js";
import { killPty } from "./pty-manager.js";
import { disposeTerminal } from "./terminal-emulator.js";
import { WorktreeManager } from "./worktree-manager.js";

/**
 * Clean up all active sessions: kill PTYs, dispose terminals, remove worktrees.
 */
export async function cleanupAllSessions(
  sessions: Session[],
  repoRoot: string,
): Promise<void> {
  const wm = new WorktreeManager(repoRoot);

  for (const session of sessions) {
    try {
      killPty(session.pty);
    } catch {
      // Already dead
    }
    try {
      disposeTerminal(session.terminal);
    } catch {
      // Already disposed
    }
    try {
      await wm.removeWorktree(session.worktreePath);
    } catch {
      // Best effort
    }
  }
}

/**
 * Install signal handlers for clean shutdown.
 * Returns a cleanup function to remove the handlers.
 */
export function installSignalHandlers(
  getSessions: () => Session[],
  repoRoot: string,
  onExit: () => void,
): () => void {
  let cleaning = false;

  const handler = async (signal: string) => {
    if (cleaning) return;
    cleaning = true;

    try {
      await cleanupAllSessions(getSessions(), repoRoot);
    } catch {
      // Best effort
    }

    // Restore terminal
    process.stdout.write("\x1b[?25h"); // show cursor
    process.stdout.write("\x1b[?1049l"); // leave alt screen

    onExit();
    process.exit(0);
  };

  const sigint = () => { handler("SIGINT"); };
  const sigterm = () => { handler("SIGTERM"); };
  const sighup = () => { handler("SIGHUP"); };

  process.on("SIGINT", sigint);
  process.on("SIGTERM", sigterm);
  process.on("SIGHUP", sighup);

  return () => {
    process.off("SIGINT", sigint);
    process.off("SIGTERM", sigterm);
    process.off("SIGHUP", sighup);
  };
}
