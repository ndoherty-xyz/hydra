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

export async function gitAddAll(cwd: string): Promise<void> {
  const git = simpleGit(cwd);
  await git.add("-A");
}

export async function gitCommit(cwd: string, message: string): Promise<string> {
  const git = simpleGit(cwd);
  const result = await git.commit(message);
  const summary = result.summary;
  return `${summary.changes} changed, ${summary.insertions} insertions, ${summary.deletions} deletions`;
}

export async function gitPush(cwd: string): Promise<void> {
  const git = simpleGit(cwd);
  const branch = await getCurrentBranch(cwd);
  await git.push(["-u", "origin", branch]);
}
