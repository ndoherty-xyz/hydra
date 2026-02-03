const ESC = "\x1b[";

export function sgr(...codes: number[]): string {
  if (codes.length === 0) return `${ESC}0m`;
  return `${ESC}${codes.join(";")}m`;
}

export const RESET = sgr(0);

// Cursor positioning
export function cursorTo(row: number, col: number): string {
  return `${ESC}${row};${col}H`;
}

// Set scroll region (DECSTBM) - rows are 1-indexed
export function setScrollRegion(top: number, bottom: number): string {
  return `${ESC}${top};${bottom}r`;
}

// Reset scroll region to full screen
export function resetScrollRegion(): string {
  return `${ESC}r`;
}

// Clear entire line
export function clearLine(): string {
  return `${ESC}2K`;
}

// Hide/show cursor
export const HIDE_CURSOR = "\x1b[?25l";
export const SHOW_CURSOR = "\x1b[?25h";
export const DISABLE_FOCUS_REPORTING = "\x1b[?1004l";

// Cursor save/restore (DECSC / DECRC)
export const SAVE_CURSOR = "\x1b7";
export const RESTORE_CURSOR = "\x1b8";

// Clear screen
export const CLEAR_SCREEN = `${ESC}2J${ESC}H`;

// Build SGR params for a foreground color based on xterm color mode
export function fgColorParams(colorMode: number, color: number): number[] {
  // colorMode: 0 = default, 1 = palette (16), 2 = palette (256), 3 = RGB
  switch (colorMode) {
    case 0:
      return []; // default color, no params
    case 1:
      // Standard palette 0-7 → 30-37, bright 8-15 → 90-97
      if (color < 8) return [30 + color];
      return [90 + (color & 7)];
    case 2:
      // 256 color palette
      return [38, 5, color];
    case 3:
      // RGB: color is packed as (r << 16) | (g << 8) | b
      return [38, 2, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
    default:
      return [];
  }
}

// Build SGR params for a background color based on xterm color mode
export function bgColorParams(colorMode: number, color: number): number[] {
  switch (colorMode) {
    case 0:
      return [];
    case 1:
      if (color < 8) return [40 + color];
      return [100 + (color & 7)];
    case 2:
      return [48, 5, color];
    case 3:
      return [48, 2, (color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
    default:
      return [];
  }
}
