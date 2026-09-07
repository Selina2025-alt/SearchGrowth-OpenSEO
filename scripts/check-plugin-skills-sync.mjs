#!/usr/bin/env node
// ci:check gate: after `pnpm sync-plugin-skills` rebuilds plugins/openseo/skills
// from .agents/skills, reject ANY drift under that path — tracked modifications
// AND untracked additions. `git diff --exit-code` alone misses untracked files,
// and POSIX `$(...)` in a package.json script does not expand under Windows
// cmd.exe, so this script shells out to porcelain status instead.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const targetDir = "plugins/openseo/skills";

let stdout;
try {
  stdout = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=all", "--", targetDir],
    { cwd: repoRoot, encoding: "utf8" },
  );
} catch (error) {
  console.error(`Could not run git status for ${targetDir}:`, error.message);
  process.exit(1);
}

const lines = stdout.split(/\r?\n/).filter((line) => line.length > 0);
if (lines.length > 0) {
  console.error(
    `Drift detected under ${targetDir} after sync-plugin-skills:` +
      `\n${lines.join("\n")}` +
      `\nRun \`pnpm sync-plugin-skills\` and commit the result.`,
  );
  process.exit(1);
}

console.log(`plugin skill sync clean: ${targetDir}`);
