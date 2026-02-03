import { join } from "node:path";
import { mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { platform } from "node:os";
import { simpleGit } from "simple-git";
import { WORKSPACES_DIR } from "../utils/constants.js";
import { getRepoName, branchExists } from "../utils/git.js";

const execFileAsync = promisify(execFile);

export interface WorkspaceInfo {
  path: string;
  branch: string;
}

export class WorkspaceManager {
  private repoRoot: string;
  private repoName: string;
  private workspaceBase: string;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.repoName = getRepoName(repoRoot);
    this.workspaceBase = join(WORKSPACES_DIR, this.repoName);
  }

  async createWorkspace(branch: string): Promise<string> {
    const workspacePath = join(this.workspaceBase, branch);

    await mkdir(this.workspaceBase, { recursive: true });

    // Copy the entire repo directory. On macOS, use APFS clone for instant
    // copy-on-write. On Linux, fall back to regular cp.
    const cpArgs =
      platform() === "darwin"
        ? ["-c", "-R", `${this.repoRoot}/.`, workspacePath]
        : ["-R", `${this.repoRoot}/.`, workspacePath];

    await mkdir(workspacePath, { recursive: true });
    await execFileAsync("cp", cpArgs);

    // Check out the requested branch in the new workspace
    const git = simpleGit(workspacePath);
    const exists = await branchExists(this.repoRoot, branch);
    if (exists) {
      await git.checkout(branch);
    } else {
      await git.checkoutLocalBranch(branch);
    }

    return workspacePath;
  }

  async removeWorkspace(workspacePath: string): Promise<void> {
    await rm(workspacePath, { recursive: true, force: true });
  }

  async listWorkspaces(): Promise<WorkspaceInfo[]> {
    if (!existsSync(this.workspaceBase)) {
      return [];
    }

    const workspaces: WorkspaceInfo[] = [];
    const entries = await readdir(this.workspaceBase, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(this.workspaceBase, entry.name);
      const gitDir = join(fullPath, ".git");

      if (!existsSync(gitDir)) continue;

      try {
        const git = simpleGit(fullPath);
        const branch = (
          await git.revparse(["--abbrev-ref", "HEAD"])
        ).trim();
        workspaces.push({ path: fullPath, branch });
      } catch {
        // Skip directories that aren't valid git repos
      }
    }

    return workspaces;
  }

  async cleanupOrphans(): Promise<void> {
    if (!existsSync(this.workspaceBase)) return;

    const entries = await readdir(this.workspaceBase, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = join(this.workspaceBase, entry.name);
      const gitDir = join(fullPath, ".git");

      if (!existsSync(gitDir)) {
        await rm(fullPath, { recursive: true, force: true });
        continue;
      }

      try {
        const git = simpleGit(fullPath);
        await git.revparse(["--abbrev-ref", "HEAD"]);
      } catch {
        // Broken git repo — remove it
        await rm(fullPath, { recursive: true, force: true });
      }
    }
  }

  async syncToOrigin(
    workspacePath: string,
    branch: string,
    message: string,
  ): Promise<void> {
    const git = simpleGit(workspacePath);

    // Stage all changes and commit
    await git.add("-A");
    await git.commit(message, { "--allow-empty": null });

    // Push the branch directly into the original repo's refs via local path
    await git.push(this.repoRoot, `${branch}:${branch}`);
  }
}
