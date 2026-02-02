import type { Terminal, IBufferCell, IBufferLine } from "@xterm/headless";
import { fgColorParams, bgColorParams, sgr, RESET } from "../utils/ansi.js";

interface CellStyle {
  fgMode: number;
  fgColor: number;
  bgMode: number;
  bgColor: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
  inverse: boolean;
  strikethrough: boolean;
}

function getCellStyle(cell: IBufferCell): CellStyle {
  return {
    fgMode: cell.isFgDefault() ? 0 : cell.isFgPalette() ? (cell.getFgColor() < 16 ? 1 : 2) : 3,
    fgColor: cell.getFgColor(),
    bgMode: cell.isBgDefault() ? 0 : cell.isBgPalette() ? (cell.getBgColor() < 16 ? 1 : 2) : 3,
    bgColor: cell.getBgColor(),
    bold: cell.isBold() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
    dim: cell.isDim() !== 0,
    inverse: cell.isInverse() !== 0,
    strikethrough: cell.isStrikethrough() !== 0,
  };
}

function stylesEqual(a: CellStyle, b: CellStyle): boolean {
  return (
    a.fgMode === b.fgMode &&
    a.fgColor === b.fgColor &&
    a.bgMode === b.bgMode &&
    a.bgColor === b.bgColor &&
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.dim === b.dim &&
    a.inverse === b.inverse &&
    a.strikethrough === b.strikethrough
  );
}

function buildSGR(style: CellStyle): string {
  const params: number[] = [0]; // always reset first

  if (style.bold) params.push(1);
  if (style.dim) params.push(2);
  if (style.italic) params.push(3);
  if (style.underline) params.push(4);
  if (style.inverse) params.push(7);
  if (style.strikethrough) params.push(9);

  params.push(...fgColorParams(style.fgMode, style.fgColor));
  params.push(...bgColorParams(style.bgMode, style.bgColor));

  return sgr(...params);
}

const DEFAULT_STYLE: CellStyle = {
  fgMode: 0,
  fgColor: 0,
  bgMode: 0,
  bgColor: 0,
  bold: false,
  italic: false,
  underline: false,
  dim: false,
  inverse: false,
  strikethrough: false,
};

function renderLine(line: IBufferLine, cols: number, cell: IBufferCell): string {
  // Single pass: emit SGR when style changes, emit char or space for every column.
  // No trailing-space trimming — let overflow="hidden" on the Ink Box handle truncation.
  const segments: string[] = [];
  let prevStyle: CellStyle = DEFAULT_STYLE;
  let hasContent = false;

  for (let x = 0; x < cols; x++) {
    line.getCell(x, cell);
    const char = cell.getChars();
    const width = cell.getWidth();

    // Skip zero-width continuation cells (wide chars)
    if (width === 0) continue;

    const style = getCellStyle(cell);

    if (!stylesEqual(style, prevStyle)) {
      segments.push(buildSGR(style));
      prevStyle = style;
      hasContent = true;
    }

    const ch = char || " ";
    if (ch !== " " || hasContent) hasContent = true;
    segments.push(ch);
  }

  if (!hasContent) return "";

  segments.push(RESET);
  return segments.join("");
}

/**
 * Render the visible portion of the terminal buffer to ANSI strings.
 * scrollOffset = 0 means show the current viewport (what the terminal is displaying).
 * scrollOffset > 0 means scroll up that many lines into scrollback.
 */
export function renderBuffer(
  terminal: Terminal,
  scrollOffset: number,
  visibleRows: number,
): string[] {
  const buffer = terminal.buffer.active;
  const lines: string[] = [];

  // baseY is the index of the first line of the current viewport.
  // The viewport occupies lines baseY..baseY+terminal.rows-1.
  // With scrollOffset, we look further back into scrollback.
  const startLine = Math.max(0, buffer.baseY - scrollOffset);

  // Reuse a single cell object to avoid allocation per cell
  const cell = terminal.buffer.active.getNullCell();
  const rows = Math.min(visibleRows, terminal.rows);

  for (let i = 0; i < rows; i++) {
    const y = startLine + i;
    if (y >= 0 && y < buffer.length) {
      const line = buffer.getLine(y);
      if (line) {
        lines.push(renderLine(line, terminal.cols, cell));
      } else {
        lines.push("");
      }
    } else {
      lines.push("");
    }
  }

  return lines;
}
