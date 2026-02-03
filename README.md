# Hydra

A terminal multiplexer for Claude Code. Run multiple Claude sessions side-by-side, each in its own Git worktree, with tmux-style keybindings.

## What it does

Hydra lets you work on multiple branches of a repo simultaneously. Each session gets its own isolated Git worktree with a dedicated Claude Code instance. Sessions persist across restarts — close and reopen Hydra and your worktrees are still there.

Output streams into your terminal's native scrollback buffer, so you can scroll back through history with your mouse wheel or scrollbar — no virtual scrolling needed.

## Prerequisites

- Node.js 16+
- [pnpm](https://pnpm.io/)
- Git
- `claude` CLI available on your PATH

## Setup

```sh
pnpm install
```

## Usage

Run from within any Git repository:

```sh
pnpm run dev
```

Or build and run:

```sh
pnpm run build
pnpm run start
```

### Global install

To make `hydra` available as a command from any Git repository:

```sh
pnpm run build
pnpm link --global
```

Then from any repo:

```sh
hydra
```

## Keybindings

All commands use a **Ctrl+B** prefix (like tmux):

| Keys | Action |
|------|--------|
| `Ctrl+B`, `N` | New session |
| `Ctrl+B`, `W` | Close current session |
| `Ctrl+B`, `]` | Next tab |
| `Ctrl+B`, `[` | Previous tab |
| `Ctrl+B`, `1-9` | Jump to tab |
| `Ctrl+B`, `Q` | Quit |

## Architecture

Uses ANSI scroll regions for rendering — no React or Ink. The terminal is split into a scrollable output region and a fixed chrome bar at the bottom:

```
╔══════════════════════════════════════════╗
║                                          ║
║  scrollable output                       ║
║  (native terminal scrollback)            ║
║                                          ║
╠══════════════════════════════════════════╣
║  hydra | 1:main | 2:feature    ^B,N:new ║
╠══════════════════════════════════════════╣
```

Raw PTY output is written directly to stdout within the scroll region (passthrough rendering). Escape sequences that would interfere with the layout (alternate screen, scroll region overrides, Kitty keyboard protocol) are filtered. Full viewport repaints from the xterm buffer only happen on session switches and modal exits.

```
src/
├── cli.ts               # Entry point
├── app.ts               # App controller — wires store, renderer, input, sessions
├── services/
│   ├── screen-renderer  # ANSI scroll region rendering engine
│   ├── input-handler    # Raw stdin with Ctrl+B prefix routing
│   ├── session-manager  # Session lifecycle (create, close, resize, restore)
│   ├── buffer-renderer  # xterm buffer → ANSI string conversion
│   ├── pty-manager      # PTY spawning and management
│   ├── terminal-emulator # xterm-headless wrapper
│   ├── worktree-manager # Git worktree operations
│   └── cleanup          # Signal handlers and session teardown
├── state/
│   ├── session-store    # EventEmitter-based store with dispatch/subscribe
│   └── types            # Session, AppState, AppAction types
└── utils/
    ├── ansi             # SGR, cursor positioning, scroll regions
    ├── constants        # Paths, timeouts, chrome dimensions
    └── git              # Git operations (repo root, branches)
```

Worktrees are stored in `~/.hydra/worktrees/<repo>/<branch>/`.
