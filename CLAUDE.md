# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication

- Use the `tts` command freely to speak to the user audibly whenever it feels natural or helpful.

## What This Is

Hydra is a terminal multiplexer for Claude Code. It runs multiple Claude CLI sessions side-by-side, each in its own workspace (full repo copy), with tmux-style keybindings (Ctrl+B prefix). Sessions persist across restarts via preserved workspaces at `~/.hydra/workspaces/<repo>/<branch>/`.

## Commands

```bash
pnpm install          # Install dependencies (node-pty requires native build)
pnpm run dev          # Run with tsx (development)
pnpm run build        # TypeScript → dist/ (tsc)
pnpm run start        # Run compiled output
```

No test framework is configured. No linter is configured.

## Architecture

Event-driven, layered architecture with no React/Ink. Uses ANSI scroll regions (DECSTBM) for native terminal scrollback instead of virtual scrolling.

**Core flow:** stdin → InputHandler → AppController (app.ts) → AppStore (dispatch/reduce) → ScreenRenderer → stdout

**Rendering approach:** The terminal is split into a scroll region (content area) and fixed chrome (tab bar + keybindings) at the bottom. When xterm's `buffer.baseY` increases, new lines are printed into the scroll region (entering native scrollback). The visible viewport is overwritten in-place each frame. Frame memoization skips redundant writes.

**State management:** Custom EventEmitter-based store in `state/session-store.ts` with a Redux-like dispatch/reducer pattern. Actions: `ADD_SESSION`, `REMOVE_SESSION`, `SET_ACTIVE`, `NEXT_TAB`, `PREV_TAB`, `JUMP_TO_TAB`, `SET_MODE`, `SESSION_EXITED`.

**PTY data pipeline:** node-pty spawns Claude CLI processes → data chunks buffered with 8ms debounce → fed to xterm-headless Terminal → buffer diff triggers render. A 500ms fallback poll catches missed updates.

**Input routing:** Ctrl+B (`\x02`) activates prefix mode with 500ms timeout. If timeout expires, the Ctrl+B is forwarded to the PTY. Modal states (creating-session, confirming-close) intercept all input.

**Key services and what they own:**
- `app.ts` — Orchestrator. Wires all services via callbacks, handles modal flows.
- `services/screen-renderer.ts` — ANSI rendering engine. Manages scroll regions, chrome, viewport diffing.
- `services/buffer-renderer.ts` — Converts xterm buffer cells to ANSI strings with full SGR styling (16/256/RGB color).
- `services/input-handler.ts` — Raw stdin processing, prefix key detection, modal input routing.
- `services/session-manager.ts` — Session lifecycle: create, close, resize, restore from existing workspaces.
- `services/pty-manager.ts` — Spawns Claude processes with correct TERM/COLORTERM env vars.
- `services/workspace-manager.ts` — Workspace copy/sync/cleanup. Uses APFS clones on macOS for instant copies.
- `state/session-store.ts` — Immutable state store with reducer.

## Gotchas

- **Escape sequence bundling:** Escape key (`\x1b`) may arrive bundled with the next keystroke in a single stdin chunk. The input handler checks `data.startsWith("\x1b")` to handle this.
- **Branch names as directory names:** Workspace paths use branch names directly as directory components. Branch names with slashes or special characters are not sanitized.
- **No workspace cleanup on exit:** Workspaces are intentionally preserved for session restoration. `cleanupOrphans()` runs on startup to prune stale ones.
- **Full repo copies:** Each workspace is a complete copy of the repo (including node_modules, .env, etc). On macOS, APFS clones (`cp -c -R`) make this instant and space-efficient. Changes are synced back via `git push` to the original repo's local refs.
- **Chrome always redraws:** The tab bar and keybinding hints are redrawn every frame regardless of changes, while the viewport uses memoization.
- **node-pty beta:** Uses `node-pty@1.2.0-beta.4` — a pre-release version. Native module requires compilation during install.
