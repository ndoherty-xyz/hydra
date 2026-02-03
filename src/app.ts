import { AppStore } from "./state/session-store.js";
import { ScreenRenderer } from "./services/screen-renderer.js";
import { InputHandler } from "./services/input-handler.js";
import { SessionManager } from "./services/session-manager.js";
import { installSignalHandlers, cleanupAllSessions } from "./services/cleanup.js";
import type { AppMode, SessionStatus } from "./state/types.js";

// How long PTY output must be silent before transitioning to "waiting".
const SILENCE_MS = 3000;

interface StatusEntry {
  status: SessionStatus;
  silenceTimer: ReturnType<typeof setTimeout> | null;
}

export class HydraApp {
  private store: AppStore;
  private renderer: ScreenRenderer;
  private inputHandler: InputHandler;
  private sessionManager: SessionManager;
  private repoRoot: string;
  private exitResolve: (() => void) | null = null;
  private removeSignalHandlers: (() => void) | null = null;
  private unsubscribeStore: (() => void) | null = null;

  // Modal state
  private sessionCreatorValue = "";
  private error: string | null = null;

  // Rendering state tracking
  private lastRenderedSessionId: string | null = null;
  private lastMode: AppMode = "normal";

  // Per-session status tracking
  private sessionStatuses = new Map<string, StatusEntry>();

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.store = new AppStore();
    this.renderer = new ScreenRenderer();
    this.sessionManager = new SessionManager(this.store, repoRoot);

    this.inputHandler = new InputHandler(this.store, {
      onCreateSession: () => this.onCreateSession(),
      onCloseSession: () => this.onCloseSession(),
      onQuit: () => this.onQuit(),
      onSessionCreatorInput: (data) => this.onSessionCreatorInput(data),
      onConfirmDialogInput: (data) => this.onConfirmDialogInput(data),
      onSubmit: (sessionId) => this.setSessionStatus(sessionId, "working"),
    });

    // Status detection via PTY silence. Any PTY data resets a timer;
    // when output stops for SILENCE_MS, transition to "waiting".
    this.sessionManager.onRawPtyData = (sessionId, data) => {
      this.resetSilenceTimer(sessionId);

      const state = this.store.getState();
      if (sessionId === state.activeSessionId && state.mode === "normal") {
        this.renderer.writePassthrough(data);
      }
    };

    // Redraw chrome after each debounced PTY batch, since passthrough
    // output may contain ED/clear sequences that wipe the chrome area.
    this.sessionManager.onPtyData = (sessionId) => {
      const state = this.store.getState();
      if (sessionId === state.activeSessionId && state.mode === "normal") {
        this.renderer.updateState(state);
        this.renderer.drawChrome();
      }
    };
  }

  async run(): Promise<void> {
    // Initialize renderer (sets scroll region)
    this.renderer.initialize();

    // Start input handler (raw mode)
    this.inputHandler.start();

    // Subscribe to store changes
    this.unsubscribeStore = this.store.subscribe(() => this.render());

    // Install signal handlers
    this.removeSignalHandlers = installSignalHandlers(
      () => this.store.getState().sessions,
      () => this.shutdown(),
    );

    // Listen for resize
    process.stdout.on("resize", () => this.handleResize());

    // Restore existing sessions
    try {
      await this.sessionManager.cleanupOrphans();
      await this.sessionManager.restoreExistingSessions(
        this.renderer.cols,
        this.renderer.rows,
      );
    } catch {
      // Best effort
    }

    // Initial render
    this.render();

    // Wait until quit
    return new Promise<void>((resolve) => {
      this.exitResolve = resolve;
    });
  }

  private setSessionStatus(sessionId: string, status: SessionStatus): void {
    const entry = this.sessionStatuses.get(sessionId);
    if (entry?.status === status) return;

    this.sessionStatuses.set(sessionId, {
      status,
      silenceTimer: entry?.silenceTimer ?? null,
    });
    this.renderer.setSessionStatuses(this.sessionStatuses);
    this.renderer.requestChromeRedraw();
  }

  /** Reset the silence timer for a session. Only fires "waiting" if currently "working". */
  private resetSilenceTimer(sessionId: string): void {
    const entry = this.sessionStatuses.get(sessionId);
    if (!entry) return;

    if (entry.silenceTimer) clearTimeout(entry.silenceTimer);
    entry.silenceTimer = setTimeout(() => {
      entry.silenceTimer = null;
      if (entry.status === "working") {
        this.setSessionStatus(sessionId, "waiting");
      }
    }, SILENCE_MS);
  }

  /** Ensure every session has a status entry; remove stale entries. */
  private syncSessionStatuses(): void {
    const state = this.store.getState();
    const currentIds = new Set(state.sessions.map((s) => s.id));

    for (const session of state.sessions) {
      if (!this.sessionStatuses.has(session.id)) {
        this.sessionStatuses.set(session.id, { status: "idle", silenceTimer: null });
      }
    }

    for (const [id, entry] of this.sessionStatuses) {
      if (!currentIds.has(id)) {
        if (entry.silenceTimer) clearTimeout(entry.silenceTimer);
        this.sessionStatuses.delete(id);
      }
    }

    this.renderer.setSessionStatuses(this.sessionStatuses);
  }

  private render(): void {
    this.syncSessionStatuses();

    const state = this.store.getState();
    const activeSession = state.sessions.find(
      (s) => s.id === state.activeSessionId,
    );

    // Modal entry: creating-session or confirming-close
    if (state.mode === "creating-session") {
      this.renderer.enterModal(
        "session-creator",
        this.sessionCreatorValue,
        state,
      );
      this.lastMode = state.mode;
      return;
    }

    if (state.mode === "confirming-close") {
      this.renderer.enterModal("confirm-close", "", state, activeSession);
      this.lastMode = state.mode;
      return;
    }

    // Modal exit: was in a modal, now back to normal
    if (this.lastMode !== "normal" && state.mode === "normal") {
      this.renderer.updateState(state);
      this.renderer.exitModal(activeSession);
      this.lastMode = state.mode;
      this.lastRenderedSessionId = state.activeSessionId;
      return;
    }

    // Session switch
    if (state.activeSessionId !== this.lastRenderedSessionId) {
      if (activeSession) {
        this.renderer.handleSessionSwitch(activeSession, state);
        this.lastRenderedSessionId = state.activeSessionId;
        this.lastMode = state.mode;
        return;
      }

      // No active session but there was one before — show placeholder
      if (this.lastRenderedSessionId !== null) {
        this.renderer.updateState(state);
        this.renderer.renderPlaceholder();
        this.renderer.drawChrome();
        this.lastRenderedSessionId = null;
        this.lastMode = state.mode;
        return;
      }
    }

    // Default: update state and redraw chrome (handles exit label changes, etc.)
    this.renderer.updateState(state);
    this.renderer.requestChromeRedraw();
    this.lastMode = state.mode;
  }

  private handleResize(): void {
    this.renderer.handleResize();

    // Resize all session terminals + PTYs
    this.sessionManager.resizeAllSessions(
      this.store.getState().sessions,
      this.renderer.cols,
      this.renderer.rows,
    );

    const state = this.store.getState();
    const activeSession = state.sessions.find(
      (s) => s.id === state.activeSessionId,
    );

    if (state.mode === "normal" && activeSession) {
      // Repaint viewport from xterm buffer after resize
      this.renderer.updateState(state);
      this.renderer.repaintViewport(activeSession);
      this.renderer.drawChrome();
    } else if (state.mode !== "normal") {
      // Re-render modal
      this.render();
    } else {
      // No active session
      this.renderer.updateState(state);
      this.renderer.renderPlaceholder();
      this.renderer.drawChrome();
    }
  }

  private onCreateSession(): void {
    this.sessionCreatorValue = "";
    this.store.dispatch({ type: "SET_MODE", mode: "creating-session" });
  }

  private onCloseSession(): void {
    const state = this.store.getState();
    const activeSession = state.sessions.find(
      (s) => s.id === state.activeSessionId,
    );
    if (activeSession) {
      this.store.dispatch({ type: "SET_MODE", mode: "confirming-close" });
    }
  }

  private async onSessionCreatorInput(data: string): Promise<void> {
    // Escape (may arrive bundled with next keystroke)
    if (data.startsWith("\x1b")) {
      this.store.dispatch({ type: "SET_MODE", mode: "normal" });
      return;
    }

    // Enter
    if (data === "\r" || data === "\n") {
      const trimmed = this.sessionCreatorValue.trim();
      if (trimmed.length > 0) {
        this.store.dispatch({ type: "SET_MODE", mode: "normal" });
        this.error = null;
        try {
          await this.sessionManager.createSession(
            trimmed,
            this.renderer.cols,
            this.renderer.rows,
          );
        } catch (err) {
          this.error = err instanceof Error ? err.message : String(err);
        }
      }
      return;
    }

    // Backspace
    if (data === "\x7f" || data === "\b") {
      this.sessionCreatorValue = this.sessionCreatorValue.slice(0, -1);
      this.render();
      return;
    }

    // Regular character input (ignore control chars)
    if (data.length === 1 && data.charCodeAt(0) >= 32) {
      this.sessionCreatorValue += data;
      this.render();
    }
  }

  private async onConfirmDialogInput(data: string): Promise<void> {
    if (data === "y" || data === "Y") {
      const state = this.store.getState();
      const activeSession = state.sessions.find(
        (s) => s.id === state.activeSessionId,
      );
      this.store.dispatch({ type: "SET_MODE", mode: "normal" });
      if (activeSession) {
        await this.sessionManager.closeSession(activeSession);
      }
      return;
    }

    if (data === "n" || data === "N" || data.startsWith("\x1b")) {
      this.store.dispatch({ type: "SET_MODE", mode: "normal" });
    }
  }

  private async onQuit(): Promise<void> {
    await this.shutdown();
  }

  private async shutdown(): Promise<void> {
    // Cleanup signal handlers
    this.removeSignalHandlers?.();

    // Stop input
    this.inputHandler.stop();

    // Unsubscribe store
    this.unsubscribeStore?.();

    // Cleanup all sessions
    await cleanupAllSessions(this.store.getState().sessions);

    // Restore terminal
    this.renderer.cleanup();

    // Resolve exit promise
    this.exitResolve?.();
  }
}
