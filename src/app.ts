import { AppStore } from "./state/session-store.js";
import { ScreenRenderer } from "./services/screen-renderer.js";
import { InputHandler } from "./services/input-handler.js";
import { SessionManager } from "./services/session-manager.js";
import { installSignalHandlers, cleanupAllSessions } from "./services/cleanup.js";

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
    });

    // Wire PTY data to trigger re-renders
    this.sessionManager.onPtyData = (sessionId) => {
      const state = this.store.getState();
      if (sessionId === state.activeSessionId) {
        this.renderer.scheduleRender();
      }
    };

    // Wire renderer's render callback
    this.renderer.onRenderNeeded = () => this.render();
  }

  async run(): Promise<void> {
    // Initialize renderer (sets scroll region, hides cursor)
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

  private render(): void {
    const state = this.store.getState();

    if (state.mode === "creating-session") {
      this.renderer.renderChrome(state);
      this.renderer.renderModal("session-creator", this.sessionCreatorValue);
      return;
    }

    if (state.mode === "confirming-close") {
      const activeSession = state.sessions.find(
        (s) => s.id === state.activeSessionId,
      );
      this.renderer.renderChrome(state);
      this.renderer.renderModal("confirm-close", "", activeSession);
      return;
    }

    this.renderer.renderFrame(state);
  }

  private handleResize(): void {
    this.renderer.handleResize();

    // Resize all session terminals + PTYs
    this.sessionManager.resizeAllSessions(
      this.store.getState().sessions,
      this.renderer.cols,
      this.renderer.rows,
    );

    // Force re-render
    this.render();
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
