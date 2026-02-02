import { simpleGit } from "simple-git";
import { basename } from "node:path";

export async function getRepoRoot(cwd?: string): Promise<string> {
  const git = simpleGit(cwd);
  const root = await git.revparse(["--show-toplevel"]);
  return root.trim();
}

export function getRepoName(repoRoot: string): string {
  return basename(repoRoot);
}

export async function listLocalBranches(
  repoRoot: string,
): Promise<string[]> {
  const git = simpleGit(repoRoot);
  const result = await git.branchLocal();
  return result.all;
}

export async function branchExists(
  repoRoot: string,
  branch: string,
): Promise<boolean> {
  const branches = await listLocalBranches(repoRoot);
  return branches.includes(branch);
}

export async function getCurrentBranch(repoRoot: string): Promise<string> {
  const git = simpleGit(repoRoot);
  const result = await git.branchLocal();
  return result.current;
}
