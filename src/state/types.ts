import type { Terminal } from "@xterm/headless";
import type { IPty } from "node-pty";

export interface Session {
  id: string;
  branch: string;
  worktreePath: string;
  terminal: Terminal;
  pty: IPty;
  exitCode: number | null;
}

export type AppMode = "normal" | "creating-session" | "confirming-close";

export type SessionStatus = "idle" | "working" | "waiting";

export interface AppState {
  sessions: Session[];
  activeSessionId: string | null;
  mode: AppMode;
}

export type AppAction =
  | { type: "ADD_SESSION"; session: Session }
  | { type: "REMOVE_SESSION"; sessionId: string }
  | { type: "SET_ACTIVE"; sessionId: string }
  | { type: "NEXT_TAB" }
  | { type: "PREV_TAB" }
  | { type: "JUMP_TO_TAB"; index: number }
  | { type: "SET_MODE"; mode: AppMode }
  | { type: "SESSION_EXITED"; sessionId: string; exitCode: number };
