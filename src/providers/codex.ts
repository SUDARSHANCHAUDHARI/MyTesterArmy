import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TestCase } from "../tests.js";
import type { RunResult } from "../agent.js";
import {
  mcpServerPath,
  makeArtifactDir,
  browserEnv,
  buildExternalPrompt,
  parseVerdict,
} from "./shared.js";
import type { ExternalRunOptions } from "./claudeCode.js";

/**
 * Run a test through the Codex CLI (`codex exec`).
 *
 * Authentication: Codex uses your existing `codex login` (ChatGPT plan), so
 * runs are billed to your plan, not a metered API key. Be logged in first.
 *
 * The browser MCP server is wired in via `-c mcp_servers.browser.*` config
 * overrides, and the final agent message is captured with -o for verdict
 * parsing.
 */
export async function runWithCodex(
  test: TestCase,
  body: string,
  opts: ExternalRunOptions,
): Promise<RunResult> {
  const artifactDir = makeArtifactDir(test.id);
  const log = opts.onStep ?? (() => {});
  const prompt = buildExternalPrompt(body, opts.url);
  const finalFile = join(artifactDir, "codex-final.txt");

  const env = browserEnv({ artifactDir, timeout: opts.timeout, headed: opts.headed });
  const args = [
    "exec",
    "--dangerously-bypass-approvals-and-sandbox",
    "--skip-git-repo-check",
    "--ephemeral",
    "-o",
    finalFile,
    "-c",
    `mcp_servers.browser.command=${toml(process.execPath)}`,
    "-c",
    `mcp_servers.browser.args=${JSON.stringify([mcpServerPath()])}`,
    ...Object.entries(env).flatMap(([k, v]) => [
      "-c",
      `mcp_servers.browser.env.${k}=${toml(v)}`,
    ]),
    ...(opts.model ? ["-m", opts.model] : []),
    prompt,
  ];

  let stdout = "";
  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn("codex", args, { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      const line = d.toString().trim();
      if (line) log(`· ${line.split("\n")[0].slice(0, 100)}`);
    });
    child.on("error", (err) => {
      log(`codex failed to start: ${err.message}`);
      resolve(127);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });

  let verdict: RunResult["verdict"] = "FAILED";
  let reason: string;

  if (exitCode === 127) {
    reason = "Could not run `codex`. Install the Codex CLI and run `codex login`.";
  } else {
    const finalText = existsSync(finalFile)
      ? readFileSync(finalFile, "utf8")
      : stdout;
    const parsed = parseVerdict(finalText);
    verdict = parsed.verdict;
    reason =
      exitCode === 0
        ? parsed.reason
        : `${parsed.reason} (codex exited ${exitCode})`;
  }

  log(`✓ ${verdict}`);
  const result: RunResult = {
    test: test.id,
    title: test.title,
    verdict,
    reason,
    steps: 0,
    artifactDir,
  };
  writeFileSync(join(artifactDir, "result.json"), JSON.stringify(result, null, 2));
  return result;
}

/** Serialize a value as a TOML basic string for `codex -c key=value`. */
function toml(value: string): string {
  return JSON.stringify(value);
}
