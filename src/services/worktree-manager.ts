import { simpleGit } from "simple-git";
import { join } from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { WORKTREES_DIR } from "../utils/constants.js";
import { getRepoName, branchExists } from "../utils/git.js";

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export class WorktreeManager {
  private repoRoot: string;
  private repoName: string;
  private worktreeBase: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.repoName = getRepoName(repoRoot);
    this.worktreeBase = join(WORKTREES_DIR, this.repoName);
  }

  async addWorktree(branch: string): Promise<string> {
    const git = simpleGit(this.repoRoot);
    const worktreePath = join(this.worktreeBase, branch);

    await mkdir(this.worktreeBase, { recursive: true });

    const exists = await branchExists(this.repoRoot, branch);
    if (exists) {
      await git.raw(["worktree", "add", worktreePath, branch]);
    } else {
      await git.raw(["worktree", "add", "-b", branch, worktreePath]);
    }

    return worktreePath;
  }

  async removeWorktree(worktreePath: string): Promise<void> {
    const git = simpleGit(this.repoRoot);
    try {
      await git.raw(["worktree", "remove", worktreePath, "--force"]);
    } catch {
      // If git worktree remove fails, try manual cleanup
      if (existsSync(worktreePath)) {
        await rm(worktreePath, { recursive: true, force: true });
      }
      await git.raw(["worktree", "prune"]);
    }
  }

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const git = simpleGit(this.repoRoot);
    const output = await git.raw(["worktree", "list", "--porcelain"]);
    const worktrees: WorktreeInfo[] = [];
    let current: Partial<WorktreeInfo> = {};

    for (const line of output.split("\n")) {
      if (line.startsWith("worktree ")) {
        current.path = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        current.branch = ref.replace("refs/heads/", "");
      } else if (line === "") {
        if (current.path && current.branch) {
          // Only include worktrees under our managed directory
          if (current.path.startsWith(this.worktreeBase)) {
            worktrees.push(current as WorktreeInfo);
          }
        }
        current = {};
      }
    }

    return worktrees;
  }

  async cleanupOrphans(): Promise<void> {
    const git = simpleGit(this.repoRoot);
    await git.raw(["worktree", "prune"]);

    // Remove any stale directories under our worktree base
    if (existsSync(this.worktreeBase)) {
      const managed = await this.listWorktrees();
      const managedPaths = new Set(managed.map((w) => w.path));

      const { readdir } = await import("node:fs/promises");
      try {
        const entries = await readdir(this.worktreeBase, {
          withFileTypes: true,
        });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = join(this.worktreeBase, entry.name);
            if (!managedPaths.has(fullPath)) {
              await rm(fullPath, { recursive: true, force: true });
            }
          }
        }
      } catch {
        // Directory might not exist
      }
    }
  }
}
