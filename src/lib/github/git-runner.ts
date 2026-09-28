import "server-only";

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GitHubAppConfig } from "@/lib/github/env";
import { createGitHubInstallationToken } from "@/lib/github/auth";

function runGit(args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("git", args, { cwd, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    const timer = setTimeout(() => child.kill(), 120_000);
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(output).toString("utf8").slice(-8_000));
      else reject(new Error(`git_runner_${code}:${Buffer.concat(errors).toString("utf8").slice(-1_000)}`));
    });
  });
}

export async function synchronizeRepositoryWithRunner(input: {
  config: GitHubAppConfig;
  installationId: number;
  owner: string;
  repository: string;
  branch: string;
}) {
  const directory = await mkdtemp(join(tmpdir(), "armario-git-"));
  try {
    const { token } = await createGitHubInstallationToken(input.config, input.installationId);
    const authorization = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
    };
    const checkout = join(directory, "repository");
    const remote = `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}.git`;
    await runGit(["clone", "--branch", input.branch, "--single-branch", "--depth=50", remote, checkout], directory, env);
    await runGit(["fetch", "--prune", "origin"], checkout, env);
    await runGit(["pull", "--ff-only", "origin", input.branch], checkout, env);
    const pushOutput = await runGit(["push", "--porcelain", "origin", `HEAD:refs/heads/${input.branch}`], checkout, env);
    const head = (await runGit(["rev-parse", "HEAD"], checkout, env)).trim();
    return { head, changed: !pushOutput.includes("[up to date]") && !pushOutput.includes("up to date") };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

