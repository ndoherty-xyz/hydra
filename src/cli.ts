#!/usr/bin/env node
import { HydraApp } from "./app.js";
import { getRepoRoot } from "./utils/git.js";

async function main() {
  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot();
  } catch {
    console.error("Error: hydra must be run from within a git repository.");
    process.exit(1);
  }

  const app = new HydraApp(repoRoot);
  await app.run();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
