import { execFileSync } from "node:child_process";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (args, options = {}) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", ...options }).trim();
if (git(["status", "--porcelain"]))
  throw new Error(
    "Commit the current source before publishing. No files were pushed.",
  );
const sourceCommit = git(["rev-parse", "--verify", "HEAD^{commit}"]);
const dist = path.join(root, "dist");
await access(path.join(dist, "index.html"));
await writeFile(path.join(dist, ".nojekyll"), "");
const remote = git(["ls-remote", "--heads", "origin", "refs/heads/gh-pages"]);
let parent = "";
if (remote) {
  git(["fetch", "origin", "refs/heads/gh-pages"]);
  parent = git(["rev-parse", "FETCH_HEAD"]);
}
const temp = await mkdtemp(path.join(os.tmpdir(), "finances-pages-"));
try {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(temp, "index") };
  const args = ["--work-tree", dist];
  git([...args, "read-tree", "--empty"], { env });
  git([...args, "add", "--all"], { env });
  const tree = git([...args, "write-tree"], { env });
  const commit = git([
    "commit-tree",
    tree,
    ...(parent ? ["-p", parent] : []),
    "-m",
    `Deploy finances from ${sourceCommit}`,
  ]);
  git(["push", "origin", `${commit}:refs/heads/gh-pages`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const verified = git([
    "ls-remote",
    "--heads",
    "origin",
    "refs/heads/gh-pages",
  ]).split(/\s/)[0];
  if (verified !== commit)
    throw new Error(
      "Remote deployment ref did not match the published commit.",
    );
  console.log(`Published static files to gh-pages (${commit}).`);
  console.log(
    "Enable GitHub Pages: Settings > Pages > Source: Deploy from a branch > gh-pages / (root) > Save.",
  );
  console.log(
    "Expected site URL after a successful GitHub Pages deployment: https://linda-yx.github.io/Linda-YX/",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
