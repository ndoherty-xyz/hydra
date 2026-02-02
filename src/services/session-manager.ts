import { createTerminal, resizeTerminal, disposeTerminal } from "./terminal-emulator.js";
import { spawnClaude, resizePty, killPty } from "./pty-manager.js";
import { WorktreeManager } from "./worktree-manager.js";
import type { AppStore } from "../state/session-store.js";
import type { Session } from "../state/types.js";

let sessionCounter = 0;

function generateSessionId(): string {
  return `session-${++sessionCounter}-${Date.now()}`;
}

export class SessionManager {
  private store: AppStore;
  private worktreeManager: WorktreeManager;
  private repoRoot: string;
  onPtyData: ((sessionId: string) => void) | null = null;

  constructor(store: AppStore, repoRoot: string) {
    this.store = store;
    this.repoRoot = repoRoot;
    this.worktreeManager = new WorktreeManager(repoRoot);
  }

  async createSession(
    branch: string,
    cols: number,
    rows: number,
    existingWorktreePath?: string,
  ): Promise<void> {
    const worktreePath =
      existingWorktreePath ?? (await this.worktreeManager.addWorktree(branch));

    const terminal = createTerminal(cols, rows);
    const proc = spawnClaude(worktreePath, cols, rows);
    const sessionId = generateSessionId();

    // Buffer PTY data with a short debounce so that a complete frame
    // is written to xterm atomically.
    const pendingChunks: string[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    const flushPtyData = () => {
      flushTimer = null;
      const batch = pendingChunks.join("");
      pendingChunks.length = 0;
      terminal.write(batch, () => {
        this.onPtyData?.(sessionId);
      });
    };

    proc.onData((data) => {
      pendingChunks.push(data);
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
      }
      flushTimer = setTimeout(flushPtyData, 8);
    });

    proc.onExit(({ exitCode }) => {
      this.store.dispatch({ type: "SESSION_EXITED", sessionId, exitCode });
      this.onPtyData?.(sessionId);
    });

    const session: Session = {
      id: sessionId,
      branch,
      worktreePath,
      terminal,
      pty: proc,
      exitCode: null,
    };

    this.store.dispatch({ type: "ADD_SESSION", session });
  }

  async closeSession(session: Session): Promise<void> {
    killPty(session.pty);
    disposeTerminal(session.terminal);

    try {
      await this.worktreeManager.removeWorktree(session.worktreePath);
    } catch {
      // Worktree removal might fail; that's okay
    }

    this.store.dispatch({ type: "REMOVE_SESSION", sessionId: session.id });
  }

  resizeAllSessions(sessions: Session[], newCols: number, newRows: number): void {
    for (const session of sessions) {
      if (session.exitCode !== null) continue;
      resizeTerminal(session.terminal, newCols, newRows);
      resizePty(session.pty, newCols, newRows);
      this.onPtyData?.(session.id);
    }
  }

  async cleanupOrphans(): Promise<void> {
    await this.worktreeManager.cleanupOrphans();
  }

  async restoreExistingSessions(cols: number, rows: number): Promise<void> {
    const worktrees = await this.worktreeManager.listWorktrees();
    for (const wt of worktrees) {
      await this.createSession(wt.branch, cols, rows, wt.path);
    }
  }
}
