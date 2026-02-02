import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { getRepoRoot } from "./utils/git.js";

async function main() {
  let repoRoot: string;
  try {
    repoRoot = await getRepoRoot();
  } catch {
    console.error("Error: hydra must be run from within a git repository.");
    process.exit(1);
  }

  const { waitUntilExit } = render(<App repoRoot={repoRoot} />, {
    exitOnCtrlC: false,
    maxFps: 20,
  });

  await waitUntilExit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
