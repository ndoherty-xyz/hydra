import { createContext, useContext, useReducer, type Dispatch } from "react";
import type { AppState, AppAction } from "./types.js";

export const initialState: AppState = {
  sessions: [],
  activeSessionId: null,
  mode: "normal",
  scrollOffset: 0,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "ADD_SESSION": {
      return {
        ...state,
        sessions: [...state.sessions, action.session],
        activeSessionId: action.session.id,
        mode: "normal",
        scrollOffset: 0,
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
        scrollOffset: 0,
      };
    }

    case "SET_ACTIVE": {
      return {
        ...state,
        activeSessionId: action.sessionId,
        scrollOffset: 0,
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
        scrollOffset: 0,
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
        scrollOffset: 0,
      };
    }

    case "JUMP_TO_TAB": {
      const session = state.sessions[action.index];
      if (!session) return state;
      return {
        ...state,
        activeSessionId: session.id,
        scrollOffset: 0,
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

    case "SCROLL_UP": {
      return {
        ...state,
        scrollOffset: state.scrollOffset + action.lines,
      };
    }

    case "SCROLL_DOWN": {
      return {
        ...state,
        scrollOffset: Math.max(0, state.scrollOffset - action.lines),
      };
    }

    case "RESET_SCROLL": {
      return { ...state, scrollOffset: 0 };
    }

    default:
      return state;
  }
}

export const AppStateContext = createContext<AppState>(initialState);
export const AppDispatchContext = createContext<Dispatch<AppAction>>(() => {});

export function useAppState() {
  return useContext(AppStateContext);
}

export function useAppDispatch() {
  return useContext(AppDispatchContext);
}

export function useAppStore() {
  return useReducer(appReducer, initialState);
}
