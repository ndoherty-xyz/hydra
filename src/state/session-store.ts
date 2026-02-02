import { EventEmitter } from "node:events";
import type { AppState, AppAction } from "./types.js";

export const initialState: AppState = {
  sessions: [],
  activeSessionId: null,
  mode: "normal",
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_SESSION": {
      return {
        ...state,
        sessions: [...state.sessions, action.session],
        activeSessionId: action.session.id,
        mode: "normal",
      };
    }

    case "REMOVE_SESSION": {
      const remaining = state.sessions.filter((s) => s.id !== action.sessionId);
      let nextActiveId = state.activeSessionId;
      if (state.activeSessionId === action.sessionId) {
        const oldIndex = state.sessions.findIndex(
          (s) => s.id === action.sessionId,
        );
        if (remaining.length > 0) {
          nextActiveId =
            remaining[Math.min(oldIndex, remaining.length - 1)]!.id;
        } else {
          nextActiveId = null;
        }
      }
      return {
        ...state,
        sessions: remaining,
        activeSessionId: nextActiveId,
        mode: "normal",
      };
    }

    case "SET_ACTIVE": {
      return {
        ...state,
        activeSessionId: action.sessionId,
      };
    }

    case "NEXT_TAB": {
      if (state.sessions.length === 0) return state;
      const idx = state.sessions.findIndex(
        (s) => s.id === state.activeSessionId,
      );
      const next = (idx + 1) % state.sessions.length;
      return {
        ...state,
        activeSessionId: state.sessions[next]!.id,
      };
    }

    case "PREV_TAB": {
      if (state.sessions.length === 0) return state;
      const idx = state.sessions.findIndex(
        (s) => s.id === state.activeSessionId,
      );
      const prev = (idx - 1 + state.sessions.length) % state.sessions.length;
      return {
        ...state,
        activeSessionId: state.sessions[prev]!.id,
      };
    }

    case "JUMP_TO_TAB": {
      const session = state.sessions[action.index];
      if (!session) return state;
      return {
        ...state,
        activeSessionId: session.id,
      };
    }

    case "SET_MODE": {
      return { ...state, mode: action.mode };
    }

    case "SESSION_EXITED": {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.sessionId
            ? { ...s, exitCode: action.exitCode }
            : s,
        ),
      };
    }

    default:
      return state;
  }
}

export class AppStore extends EventEmitter {
  private state: AppState;

  constructor() {
    super();
    this.state = initialState;
  }

  getState(): AppState {
    return this.state;
  }

  dispatch(action: AppAction): void {
    const prevState = this.state;
    this.state = appReducer(this.state, action);
    if (this.state !== prevState) {
      this.emit("change", this.state);
    }
  }

  subscribe(listener: (state: AppState) => void): () => void {
    this.on("change", listener);
    return () => {
      this.off("change", listener);
    };
  }
}
