import { spawn as ptySpawn, type IPty } from "node-pty";

export function spawnClaude(
  cwd: string,
  cols: number,
  rows: number,
): IPty {
  const proc = ptySpawn("claude", [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });
  return proc;
}

export function resizePty(proc: IPty, cols: number, rows: number): void {
  try {
    proc.resize(cols, rows);
  } catch {
    // Process may have already exited
  }
}

export function killPty(proc: IPty): void {
  try {
    proc.kill();
  } catch {
    // Process may have already exited
  }
}
