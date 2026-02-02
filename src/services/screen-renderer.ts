import type { Terminal } from "@xterm/headless";
import {
  cursorTo,
  setScrollRegion,
  resetScrollRegion,
  clearLine,
  HIDE_CURSOR,
  SHOW_CURSOR,
  RESET,
  sgr,
} from "../utils/ansi.js";
import { CHROME_ROWS } from "../utils/constants.js";
import { renderLine, renderBuffer } from "./buffer-renderer.js";
import type { AppState, AppMode, Session } from "../state/types.js";

const FALLBACK_POLL_MS = 500;

export class ScreenRenderer {
  private totalRows = 0;
  private totalCols = 0;
  private viewportRows = 0;
  private lastRenderedBaseY: Map<string, number> = new Map();
  private lastActiveSessionId: string | null = null;
  private prevFrame = "";
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRender = false;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;

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

    // Hide cursor
    process.stdout.write(HIDE_CURSOR);

    // Clear screen
    process.stdout.write("\x1b[2J\x1b[H");

    // Set scroll region: rows 1 to (totalRows - CHROME_ROWS)
    process.stdout.write(setScrollRegion(1, this.viewportRows));

    // Position cursor at top of scroll region
    process.stdout.write(cursorTo(1, 1));

    // Start fallback poll
    this.pollTimer = setInterval(() => {
      this.scheduleRender();
    }, FALLBACK_POLL_MS);
  }

  cleanup(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }

    // Reset scroll region, show cursor, clear screen
    process.stdout.write(resetScrollRegion());
    process.stdout.write(SHOW_CURSOR);
    process.stdout.write(cursorTo(this.totalRows, 1));
    process.stdout.write("\n");
  }

  handleResize(): void {
    this.totalRows = process.stdout.rows;
    this.totalCols = process.stdout.columns;
    this.viewportRows = Math.max(1, this.totalRows - CHROME_ROWS);

    // Re-establish scroll region
    process.stdout.write(setScrollRegion(1, this.viewportRows));

    // Force full re-render
    this.prevFrame = "";
    this.lastRenderedBaseY.clear();
  }

  scheduleRender(): void {
    if (this.pendingRender) return;
    this.pendingRender = true;
    this.renderTimer = setTimeout(() => {
      this.pendingRender = false;
      this.renderTimer = null;
      // Emit event or call render directly - will be wired by app controller
      this.onRenderNeeded?.();
    }, 0);
  }

  onRenderNeeded: (() => void) | null = null;

  renderFrame(state: AppState): void {
    const activeSession = state.sessions.find(
      (s) => s.id === state.activeSessionId,
    );

    // Handle session switch: print separator
    if (state.activeSessionId !== this.lastActiveSessionId) {
      if (this.lastActiveSessionId !== null && activeSession) {
        this.printSessionSeparator(activeSession.branch);
      }
      this.lastActiveSessionId = state.activeSessionId;
      this.prevFrame = "";
    }

    // Render chrome (always)
    this.renderChrome(state);

    if (!activeSession) {
      // No session - show placeholder in viewport
      this.renderPlaceholder();
      return;
    }

    // Stream new scrollback lines, then overwrite viewport
    this.streamAndRenderViewport(activeSession);
  }

  private streamAndRenderViewport(session: Session): void {
    const terminal = session.terminal;
    const buffer = terminal.buffer.active;
    const currentBaseY = buffer.baseY;
    const lastBaseY = this.lastRenderedBaseY.get(session.id) ?? 0;

    // If baseY has increased, new lines have scrolled off the viewport top.
    // Print them into the scroll region so they enter native scrollback.
    if (currentBaseY > lastBaseY) {
      const newLines = currentBaseY - lastBaseY;
      const cell = buffer.getNullCell();

      // Position cursor at bottom of scroll region to trigger scrolling
      process.stdout.write(cursorTo(this.viewportRows, 1));

      for (let i = 0; i < newLines; i++) {
        const lineIdx = lastBaseY + i;
        const bufferLine = buffer.getLine(lineIdx);
        if (bufferLine) {
          const rendered = renderLine(bufferLine, terminal.cols, cell);
          // Print with newline to scroll the region
          process.stdout.write("\n" + clearLine() + rendered);
        } else {
          process.stdout.write("\n" + clearLine());
        }
      }

      this.lastRenderedBaseY.set(session.id, currentBaseY);
    }

    // Overwrite the current viewport in-place
    const viewportLines = renderBuffer(terminal, 0, this.viewportRows);
    const frame = viewportLines.join("\n");

    if (frame !== this.prevFrame) {
      this.prevFrame = frame;

      for (let i = 0; i < this.viewportRows; i++) {
        const row = i + 1; // 1-indexed
        process.stdout.write(
          cursorTo(row, 1) + clearLine() + (viewportLines[i] ?? "") + RESET,
        );
      }
    }

    // Park cursor at bottom of scroll region (hidden, so position doesn't matter visually)
    process.stdout.write(cursorTo(this.viewportRows, 1));
  }

  renderChrome(state: AppState): void {
    const topBorderRow = this.totalRows - 2;
    const chromeRow = this.totalRows - 1;
    const bottomBorderRow = this.totalRows;

    const border = sgr(90) + "─".repeat(this.totalCols) + RESET;

    // Top border
    process.stdout.write(cursorTo(topBorderRow, 1) + clearLine() + border);

    // Single chrome line: tabs on left, keybindings on right
    process.stdout.write(
      cursorTo(chromeRow, 1) + clearLine() + this.formatChromeLine(state),
    );

    // Bottom border
    process.stdout.write(cursorTo(bottomBorderRow, 1) + clearLine() + border);
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
    }

    // Tabs
    if (state.sessions.length === 0) {
      left.push(sgr(90) + "no sessions" + RESET);
    } else {
      for (let i = 0; i < state.sessions.length; i++) {
        const session = state.sessions[i]!;
        const isActive = session.id === state.activeSessionId;
        const hasExited = session.exitCode !== null;

        if (hasExited) {
          left.push(sgr(31) + ` ${i + 1}:${session.branch} ` + RESET);
        } else if (isActive) {
          left.push(
            sgr(1, 37, 44) + ` ${i + 1}:${session.branch} ` + RESET,
          ); // bold white on blue
        } else {
          left.push(sgr(90) + ` ${i + 1}:${session.branch} ` + RESET);
        }

        if (i < state.sessions.length - 1) {
          left.push(sgr(90) + "|" + RESET);
        }
      }
    }

    // Exit code indicator
    if (activeSession?.exitCode !== null && activeSession?.exitCode !== undefined) {
      left.push(sgr(31) + ` exited(${activeSession.exitCode})` + RESET);
    }

    // Right side: keybindings in plain gray
    const rightHelp = "^B,N:new  ^B,W:close  ^B,[/]:tabs  ^B,Q:quit ";
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

  private renderPlaceholder(): void {
    const msg = "No active session. Press Ctrl+B, N to create one.";
    const midRow = Math.floor(this.viewportRows / 2) + 1;
    const midCol = Math.max(1, Math.floor((this.totalCols - msg.length) / 2));

    // Clear viewport
    for (let i = 1; i <= this.viewportRows; i++) {
      process.stdout.write(cursorTo(i, 1) + clearLine());
    }

    process.stdout.write(
      cursorTo(midRow, midCol) + sgr(90) + msg + RESET,
    );
  }

  private printSessionSeparator(branch: string): void {
    const label = `--- session: ${branch} ---`;
    const pad = Math.max(0, this.totalCols - label.length);
    const line =
      sgr(2, 90) + label + "-".repeat(pad) + RESET;

    // Position at bottom of scroll region and print with newline to scroll
    process.stdout.write(cursorTo(this.viewportRows, 1));
    process.stdout.write("\n" + clearLine() + line);
  }

  renderModal(type: "session-creator" | "confirm-close", value: string, session?: Session): void {
    // Invalidate frame cache so next renderFrame does a full redraw
    this.prevFrame = "";

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
    } else if (type === "confirm-close" && session) {
      const msg = `Close session "${session.branch}"? This will remove the worktree.`;
      const lines = [
        sgr(1, 33) + "Confirm" + RESET,
        msg,
        sgr(90) + "y/n" + RESET,
      ];
      this.renderCenteredLines(lines);
    }
  }

  private renderCenteredLines(lines: string[]): void {
    const startRow = Math.max(1, Math.floor(this.viewportRows / 2) - Math.floor(lines.length / 2));
    for (let i = 0; i < lines.length; i++) {
      const len = this.visibleLength(lines[i]!);
      const col = Math.max(1, Math.floor((this.totalCols - len) / 2));
      process.stdout.write(cursorTo(startRow + i, col) + lines[i]!);
    }
  }
}
