import { CTRL_B, PREFIX_TIMEOUT_MS } from "../utils/constants.js";
import type { AppStore } from "../state/session-store.js";
import type { Session } from "../state/types.js";

export interface InputHandlerCallbacks {
  onCreateSession: () => void;
  onCloseSession: () => void;
  onQuit: () => void;
  onSessionCreatorInput: (data: string) => void;
  onConfirmDialogInput: (data: string) => void;
  onSubmit: (sessionId: string) => void;
  onGitOperations: () => void;
  onGitSelectInput: (data: string) => void;
  onGitMessageInput: (data: string) => void;
  onGitResultInput: (data: string) => void;
  onSync: () => void;
  onSyncResultInput: (data: string) => void;
}

export class InputHandler {
  private store: AppStore;
  private callbacks: InputHandlerCallbacks;
  private prefixActive = false;
  private prefixTimeout: ReturnType<typeof setTimeout> | null = null;
  private dataHandler: ((data: Buffer) => void) | null = null;

  constructor(store: AppStore, callbacks: InputHandlerCallbacks) {
    this.store = store;
    this.callbacks = callbacks;
  }

  start(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    this.dataHandler = (data: Buffer) => this.handleData(data);
    process.stdin.on("data", this.dataHandler);
  }

  stop(): void {
    if (this.dataHandler) {
      process.stdin.off("data", this.dataHandler);
      this.dataHandler = null;
    }
    this.clearPrefixTimeout();
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
  }

  private clearPrefixTimeout(): void {
    if (this.prefixTimeout !== null) {
      clearTimeout(this.prefixTimeout);
      this.prefixTimeout = null;
    }
  }

  private getActiveSession(): Session | undefined {
    const state = this.store.getState();
    return state.sessions.find((s) => s.id === state.activeSessionId);
  }

  private handleData(data: Buffer): void {
    const str = data.toString();
    const state = this.store.getState();

    // Modal input handling
    if (state.mode === "creating-session") {
      this.callbacks.onSessionCreatorInput(str);
      return;
    }

    if (state.mode === "confirming-close") {
      this.callbacks.onConfirmDialogInput(str);
      return;
    }

    if (state.mode === "git-select") {
      this.callbacks.onGitSelectInput(str);
      return;
    }

    if (state.mode === "git-message") {
      this.callbacks.onGitMessageInput(str);
      return;
    }

    if (state.mode === "git-running") {
      return;
    }

    if (state.mode === "git-result") {
      this.callbacks.onGitResultInput(str);
      return;
    }

    if (state.mode === "sync-running") {
      return;
    }

    if (state.mode === "sync-result") {
      this.callbacks.onSyncResultInput(str);
      return;
    }

    if (state.mode === "workspace-creating") {
      return;
    }

    // Check for prefix key (Ctrl+B)
    if (str === CTRL_B && !this.prefixActive) {
      this.prefixActive = true;
      this.clearPrefixTimeout();

      this.prefixTimeout = setTimeout(() => {
        this.prefixActive = false;
        this.prefixTimeout = null;
        const activeSession = this.getActiveSession();
        if (activeSession && activeSession.exitCode === null) {
          activeSession.pty.write(CTRL_B);
        }
      }, PREFIX_TIMEOUT_MS);
      return;
    }

    // Handle prefix commands
    if (this.prefixActive) {
      // Terminal response sequences start with ESC — don't let them consume the prefix
      if (str.startsWith("\x1b")) {
        const activeSession = this.getActiveSession();
        if (activeSession && activeSession.exitCode === null) {
          activeSession.pty.write(str);
        }
        return;
      }
      this.prefixActive = false;
      this.clearPrefixTimeout();
      this.handlePrefixCommand(str);
      return;
    }

    // Normal mode: forward to active pty
    const activeSession = this.getActiveSession();
    if (activeSession && activeSession.exitCode === null) {
      activeSession.pty.write(str);
      if (str === "\r") {
        this.callbacks.onSubmit(activeSession.id);
      }
    }
  }

  private handlePrefixCommand(key: string): void {
    if (key === "q" || key === "Q") {
      this.callbacks.onQuit();
      return;
    }

    if (key === "n" || key === "N") {
      this.callbacks.onCreateSession();
      return;
    }

    if (key === "w" || key === "W") {
      this.callbacks.onCloseSession();
      return;
    }

    if (key === "g" || key === "G") {
      this.callbacks.onGitOperations();
      return;
    }

    if (key === "s" || key === "S") {
      this.callbacks.onSync();
      return;
    }

    if (key === "]") {
      this.store.dispatch({ type: "NEXT_TAB" });
      return;
    }

    if (key === "[") {
      this.store.dispatch({ type: "PREV_TAB" });
      return;
    }

    const num = parseInt(key, 10);
    if (num >= 1 && num <= 9) {
      this.store.dispatch({ type: "JUMP_TO_TAB", index: num - 1 });
      return;
    }
  }
}
