import type { Session } from "../state/types.js";
import { killPty } from "./pty-manager.js";
import { disposeTerminal } from "./terminal-emulator.js";
import { resetScrollRegion, SHOW_CURSOR, DISABLE_FOCUS_REPORTING } from "../utils/ansi.js";

/**
 * Clean up all active sessions: kill PTYs and dispose terminals.
 * Workspaces are intentionally preserved so they can be restored on next launch.
 */
export async function cleanupAllSessions(
  sessions: Session[],
): Promise<void> {
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
  }
}

/**
 * Install signal handlers for clean shutdown.
 * Returns a cleanup function to remove the handlers.
 */
export function installSignalHandlers(
  getSessions: () => Session[],
  onExit: () => void,
): () => void {
  let cleaning = false;

  const handler = async (signal: string) => {
    if (cleaning) return;
    cleaning = true;

    try {
      await cleanupAllSessions(getSessions());
    } catch {
      // Best effort
    }

    // Restore terminal
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(DISABLE_FOCUS_REPORTING);
    process.stdout.write(resetScrollRegion());

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
