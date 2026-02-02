import xtermHeadless from "@xterm/headless";
const { Terminal } = xtermHeadless;
import type { Terminal as TerminalType } from "@xterm/headless";
import { MAX_SCROLLBACK } from "../utils/constants.js";

export function createTerminal(cols: number, rows: number): TerminalType {
  const terminal = new Terminal({
    cols,
    rows,
    scrollback: MAX_SCROLLBACK,
    allowProposedApi: true,
  });
  return terminal;
}

export function resizeTerminal(
  terminal: TerminalType,
  cols: number,
  rows: number,
): void {
  terminal.resize(cols, rows);
}

export function disposeTerminal(terminal: TerminalType): void {
  terminal.dispose();
}
