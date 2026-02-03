import { homedir } from "node:os";
import { join } from "node:path";

export const HYDRA_DIR = join(homedir(), ".hydra");
export const WORKSPACES_DIR = join(HYDRA_DIR, "workspaces");

export const PREFIX_TIMEOUT_MS = 500;
export const MAX_SCROLLBACK = 5000;

export const CTRL_B = "\x02";

// Top border + chrome line + bottom border
export const CHROME_ROWS = 3;
