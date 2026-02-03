import type { Terminal } from "@xterm/headless";
import {
  cursorTo,
  setScrollRegion,
  resetScrollRegion,
  clearLine,
  SHOW_CURSOR,
  DISABLE_FOCUS_REPORTING,
  RESET,
  sgr,
  SAVE_CURSOR,
  RESTORE_CURSOR,
} from "../utils/ansi.js";
import { CHROME_ROWS } from "../utils/constants.js";
import { renderBuffer } from "./buffer-renderer.js";
import type { AppState, Session, SessionStatus } from "../state/types.js";

export class ScreenRenderer {
  private totalRows = 0;
  private totalCols = 0;
  private viewportRows = 0;
  private lastKnownState: AppState | null = null;
  private isModalActive = false;
  private chromeNeedsRedraw = false;
  private sessionStatuses = new Map<string, SessionStatus>();

  // Sequences to filter from passthrough
  private static DECSTBM_RE = /\x1b\[\d*;?\d*r/g;
  private static ALT_SCREEN_RE = /\x1b\[\?(?:1049|47|1047)[hl]/g;
  private static KITTY_KBD_RE = /\x1b\[>[0-9;]*u/g;
  private static DSR_RE = /\x1b\[6n/g;
  private static DA_RE = /\x1b\[[>=]?c/g;
  private static FOCUS_REPORTING_RE = /\x1b\[\?1004[hl]/g;

  setSessionStatuses(statuses: Map<string, { status: SessionStatus }>): void {
    this.sessionStatuses = new Map(
      [...statuses].map(([id, entry]) => [id, entry.status]),
    );
  }

  get cols(): number {
    return this.totalCols;
  }

  get rows(): number {
    return this.viewportRows;
  }

  initialize(): void {
    this.totalRows = process.stdout.rows;
    this.totalCols = process.stdout.columns;
    this.viewportRows = Math.max(1, this.totalRows - CHROME_ROWS);

    // Clear screen
    process.stdout.write("\x1b[2J\x1b[H");

    // Set scroll region: rows 1 to (totalRows - CHROME_ROWS)
    process.stdout.write(setScrollRegion(1, this.viewportRows));

    // Position cursor at top of scroll region
    process.stdout.write(cursorTo(1, 1));
  }

  cleanup(): void {
    // Reset scroll region, show cursor, move to bottom
    process.stdout.write(resetScrollRegion());
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(DISABLE_FOCUS_REPORTING);
    process.stdout.write(cursorTo(this.totalRows, 1));
    process.stdout.write("\n");
  }

  handleResize(): void {
    this.totalRows = process.stdout.rows;
    this.totalCols = process.stdout.columns;
    this.viewportRows = Math.max(1, this.totalRows - CHROME_ROWS);

    // Re-establish scroll region
    process.stdout.write(setScrollRegion(1, this.viewportRows));

    // Mark chrome dirty
    this.chromeNeedsRedraw = true;
  }

  /**
   * Hot path: write raw PTY data directly to stdout.
   * If a modal is active, data is silently dropped (xterm still receives it).
   */
  writePassthrough(data: string): void {
    if (this.isModalActive) return;

    if (this.chromeNeedsRedraw) {
      this.drawChrome();
    }

    const safe = data
      .replace(ScreenRenderer.DECSTBM_RE, setScrollRegion(1, this.viewportRows))
      .replace(ScreenRenderer.ALT_SCREEN_RE, "")
      .replace(ScreenRenderer.KITTY_KBD_RE, "")
      .replace(ScreenRenderer.DSR_RE, "")
      .replace(ScreenRenderer.DA_RE, "")
      .replace(ScreenRenderer.FOCUS_REPORTING_RE, "");
    process.stdout.write(safe);
  }

  /**
   * Draw chrome (status bar) using cursor save/restore so that the
   * passthrough cursor position is not disturbed.
   */
  drawChrome(): void {
    this.chromeNeedsRedraw = false;

    const state = this.lastKnownState;
    if (!state) return;

    const topBorderRow = this.totalRows - 2;
    const chromeRow = this.totalRows - 1;
    const bottomBorderRow = this.totalRows;
    const border = sgr(90) + "─".repeat(this.totalCols) + RESET;

    process.stdout.write(
      SAVE_CURSOR +
      resetScrollRegion() +
      cursorTo(topBorderRow, 1) + clearLine() + border +
      cursorTo(chromeRow, 1) + clearLine() + this.formatChromeLine(state) +
      cursorTo(bottomBorderRow, 1) + clearLine() + border +
      setScrollRegion(1, this.viewportRows) +
      RESTORE_CURSOR
    );
  }

  /**
   * Repaint the full viewport from a session's xterm buffer.
   * Used for session switches and modal exit.
   */
  repaintViewport(session: Session): void {
    const terminal = session.terminal;
    const buffer = terminal.buffer.active;

    // Temporarily reset scroll region so we can write to all viewport rows
    process.stdout.write(resetScrollRegion());

    const viewportLines = renderBuffer(terminal, 0, this.viewportRows);

    for (let i = 0; i < this.viewportRows; i++) {
      const row = i + 1; // 1-indexed
      process.stdout.write(
        cursorTo(row, 1) + clearLine() + (viewportLines[i] ?? "") + RESET,
      );
    }

    // Restore scroll region
    process.stdout.write(setScrollRegion(1, this.viewportRows));

    // Position cursor where the terminal's cursor is
    const cursorY = buffer.cursorY + 1; // 1-indexed
    const cursorX = buffer.cursorX + 1; // 1-indexed
    process.stdout.write(cursorTo(cursorY, cursorX));
  }

  /**
   * Handle a session switch: update state, repaint viewport, redraw chrome.
   */
  handleSessionSwitch(session: Session, state: AppState): void {
    this.updateState(state);
    this.repaintViewport(session);
    this.drawChrome();
  }

  /**
   * Enter a modal (session creator or confirm close).
   * Blocks passthrough and takes over the viewport.
   */
  enterModal(
    type: "session-creator" | "confirm-close" | "git-select" | "git-message" | "git-running" | "git-result",
    value: string,
    state: AppState,
    options?: { session?: Session; gitChoice?: number; isError?: boolean },
  ): void {
    this.isModalActive = true;
    this.updateState(state);

    // Reset scroll region so we can write to full viewport
    process.stdout.write(resetScrollRegion());

    // Clear viewport area for modal
    for (let i = 1; i <= this.viewportRows; i++) {
      process.stdout.write(cursorTo(i, 1) + clearLine());
    }

    if (type === "session-creator") {
      const lines = [
        sgr(1, 32) + "New Session" + RESET,
        "Branch name: " + sgr(36) + value + RESET + sgr(90) + "|" + RESET,
        sgr(90) + "Enter to create, Esc to cancel" + RESET,
      ];
      this.renderCenteredLines(lines);
    } else if (type === "confirm-close" && options?.session) {
      const msg = `Close session "${options.session.branch}"? This will remove the worktree.`;
      const lines = [
        sgr(1, 33) + "Confirm" + RESET,
        msg,
        sgr(90) + "y/n" + RESET,
      ];
      this.renderCenteredLines(lines);
    } else if (type === "git-select") {
      const lines = [
        sgr(1, 35) + "Git Operations" + RESET,
        "",
        sgr(36) + "1" + RESET + "  Commit",
        sgr(36) + "2" + RESET + "  Commit & Push",
        sgr(36) + "3" + RESET + "  Deliver (commit, push, close session)",
        "",
        sgr(90) + "Press 1/2/3, Esc to cancel" + RESET,
      ];
      this.renderCenteredLines(lines);
    } else if (type === "git-message") {
      const choiceLabels = ["Commit", "Commit & Push", "Deliver"];
      const label = choiceLabels[(options?.gitChoice ?? 1) - 1] ?? "Commit";
      const lines = [
        sgr(1, 35) + label + RESET,
        "",
        "Commit message: " + sgr(36) + value + RESET + sgr(90) + "|" + RESET,
        "",
        sgr(90) + "Enter to confirm, Esc to go back" + RESET,
      ];
      this.renderCenteredLines(lines);
    } else if (type === "git-running") {
      const lines = [
        sgr(1, 33) + "Running..." + RESET,
        "",
        sgr(36) + value + RESET,
      ];
      this.renderCenteredLines(lines);
    } else if (type === "git-result") {
      const isError = options?.isError ?? false;
      const title = isError
        ? sgr(1, 31) + "Error" + RESET
        : sgr(1, 32) + "Success" + RESET;
      const lines = [
        title,
        "",
        value,
        "",
        sgr(90) + "Press any key to dismiss" + RESET,
      ];
      this.renderCenteredLines(lines);
    }

    // Restore scroll region and draw chrome
    process.stdout.write(setScrollRegion(1, this.viewportRows));
    this.drawChrome();
  }

  /**
   * Exit a modal. Repaints viewport from session buffer (or placeholder),
   * then redraws chrome.
   */
  exitModal(session: Session | undefined): void {
    this.isModalActive = false;

    if (session) {
      this.repaintViewport(session);
    } else {
      this.renderPlaceholder();
    }

    this.drawChrome();
  }

  /**
   * Cache the latest app state and mark chrome dirty if the active session changed.
   */
  updateState(state: AppState): void {
    const prevActiveId = this.lastKnownState?.activeSessionId ?? null;
    this.lastKnownState = state;

    if (state.activeSessionId !== prevActiveId) {
      this.chromeNeedsRedraw = true;
    }
  }

  /**
   * Mark chrome as needing a redraw and draw immediately if not in a modal.
   */
  requestChromeRedraw(): void {
    this.chromeNeedsRedraw = true;
    if (!this.isModalActive) {
      this.drawChrome();
    }
  }

  renderPlaceholder(): void {
    const msg = "No active session. Press Ctrl+B, N to create one.";
    const midRow = Math.floor(this.viewportRows / 2) + 1;
    const midCol = Math.max(1, Math.floor((this.totalCols - msg.length) / 2));

    // Reset scroll region temporarily
    process.stdout.write(resetScrollRegion());

    // Clear viewport
    for (let i = 1; i <= this.viewportRows; i++) {
      process.stdout.write(cursorTo(i, 1) + clearLine());
    }

    process.stdout.write(cursorTo(midRow, midCol) + sgr(90) + msg + RESET);

    // Restore scroll region
    process.stdout.write(setScrollRegion(1, this.viewportRows));
  }

  private formatChromeLine(state: AppState): string {
    const left: string[] = [];
    const activeSession = state.sessions.find(
      (s) => s.id === state.activeSessionId,
    );

    // hydra label
    left.push(sgr(1, 32) + " hydra " + RESET); // bold green
    left.push(sgr(90) + "| " + RESET);

    // Mode indicator
    if (state.mode === "creating-session") {
      left.push(sgr(33) + "[CREATE] " + RESET);
    } else if (state.mode === "confirming-close") {
      left.push(sgr(33) + "[CLOSE?] " + RESET);
    } else if (state.mode.startsWith("git-")) {
      left.push(sgr(35) + "[GIT] " + RESET);
    }

    // Tabs
    if (state.sessions.length === 0) {
      left.push(sgr(90) + "no sessions" + RESET);
    } else {
      for (let i = 0; i < state.sessions.length; i++) {
        const session = state.sessions[i]!;
        const isActive = session.id === state.activeSessionId;
        const hasExited = session.exitCode !== null;
        const status = this.sessionStatuses.get(session.id) ?? "idle";

        // Status dot: exited overrides status color
        const dotColor = hasExited || status === "waiting"
          ? sgr(31)  // red
          : status === "working"
            ? sgr(32)  // green
            : sgr(90); // gray (idle)
        const dot = dotColor + "●" + RESET;

        // Tab label
        const label = ` ${i + 1}:${session.branch} `;
        const labelStyle = hasExited
          ? sgr(31)
          : isActive
            ? sgr(1, 4, 37) // bold underline white
            : sgr(90);

        left.push(" " + dot + labelStyle + label + RESET);

        if (i < state.sessions.length - 1) {
          left.push(sgr(90) + "|" + RESET);
        }
      }
    }

    // Exit code indicator
    if (
      activeSession?.exitCode !== null &&
      activeSession?.exitCode !== undefined
    ) {
      left.push(sgr(31) + ` exited(${activeSession.exitCode})` + RESET);
    }

    // Right side: keybindings in plain gray
    const rightHelp = "^B,G:git  ^B,N:new  ^B,W:close  ^B,[/]:tabs  ^B,Q:quit ";
    const rightStr = sgr(90) + rightHelp + RESET;

    const leftStr = left.join("");
    const leftLen = this.visibleLength(leftStr);
    const rightLen = rightHelp.length;
    const gap = Math.max(1, this.totalCols - leftLen - rightLen);

    return leftStr + " ".repeat(gap) + rightStr;
  }

  private visibleLength(str: string): number {
    return str.replace(/\x1b\[[0-9;]*m/g, "").length;
  }

  private renderCenteredLines(lines: string[]): void {
    const startRow = Math.max(
      1,
      Math.floor(this.viewportRows / 2) - Math.floor(lines.length / 2),
    );
    for (let i = 0; i < lines.length; i++) {
      const len = this.visibleLength(lines[i]!);
      const col = Math.max(1, Math.floor((this.totalCols - len) / 2));
      process.stdout.write(cursorTo(startRow + i, col) + lines[i]!);
    }
  }
}
