# Hydra

A terminal multiplexer for Claude Code. Run multiple Claude sessions side-by-side, each in its own Git worktree, with tmux-style keybindings.

## What it does

Hydra lets you work on multiple branches of a repo simultaneously. Each session gets its own isolated Git worktree with a dedicated Claude Code instance. Sessions persist across restarts — close and reopen Hydra and your worktrees are still there.

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

## Keybindings

All commands use a **Ctrl+B** prefix (like tmux):

| Keys | Action |
|------|--------|
| `Ctrl+B`, `N` | New session |
| `Ctrl+B`, `W` | Close current session |
| `Ctrl+B`, `]` | Next tab |
| `Ctrl+B`, `[` | Previous tab |
| `Ctrl+B`, `1-9` | Jump to tab |
| `Ctrl+B`, `A` / `Up` | Scroll up |
| `Ctrl+B`, `B` / `Down` | Scroll down |
| `Ctrl+B`, `Q` | Quit |

## Architecture

Built with [React](https://react.dev/) + [Ink](https://github.com/vadimdemedes/ink) for the terminal UI, [@xterm/headless](https://github.com/xtermjs/xterm.js) for terminal emulation, and [node-pty](https://github.com/microsoft/node-pty) for spawning shell processes.

```
src/
├── cli.tsx              # Entry point
├── app.tsx              # Root component
├── components/          # UI (tab bar, terminal pane, status bar, dialogs)
├── hooks/               # Input routing, session management, rendering
├── services/            # PTY, terminal emulation, worktree management, cleanup
├── state/               # Reducer-based state management
└── utils/               # ANSI helpers, Git operations, constants
```

Worktrees are stored in `~/.hydra/worktrees/<repo>/<branch>/`.
