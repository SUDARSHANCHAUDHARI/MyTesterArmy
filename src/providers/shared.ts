import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Verdict } from "../agent.js";

/** Absolute path to the built MCP browser server (dist/mcp-bin.js). */
export function mcpServerPath(): string {
  // This file lives at dist/providers/shared.js; the server is at dist/mcp-bin.js.
  return fileURLToPath(new URL("../mcp-bin.js", import.meta.url));
}

export function makeArtifactDir(testId: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(process.cwd(), ".mytesterarmy", `${ts}-${testId}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Env passed to the MCP browser server for a run. */
export function browserEnv(opts: {
  artifactDir: string;
  timeout: number;
  headed: boolean;
}): Record<string, string> {
  const env: Record<string, string> = {
    MTA_ARTIFACT_DIR: opts.artifactDir,
    MTA_TIMEOUT: String(opts.timeout),
  };
  if (opts.headed) env.MTA_HEADED = "1";
  return env;
}

/**
 * Prompt handed to an external agent (Claude Code / Codex) that drives the
 * browser MCP tools itself. It must end with a single machine-parseable
 * VERDICT line.
 */
export function buildExternalPrompt(body: string, url: string | undefined): string {
  const target = url ?? "the URL given in the test";
  return `You are MyTesterArmy, an autonomous QA agent. Use the browser tools available to you (navigate, read_page, click, fill, screenshot) to verify whether the target website behaves as expected — like a human tester clicking through it.

How to work:
- Call read_page to see the current page before deciding what to do.
- Take one concrete action at a time (navigate, click, fill), then read_page again to confirm the result.
- Capture a screenshot at important checkpoints or when something looks wrong.
- Judge only from what you actually observe through the tools. Never assume a step worked.

Target URL: ${target}. Wherever the test mentions the app, the target URL, or "<target_url>", it means ${target}.

--- TEST ---
${body}
--- END TEST ---

Return PASS only if every required check passes. Return FAILED the moment a required check fails.

When you are done, finish your reply with EXACTLY ONE final line, and nothing after it, in one of these forms:
VERDICT: PASS
VERDICT: FAILED — <one sentence naming the broken step and the visible error>`;
}

const VERDICT_RE = /VERDICT:\s*(PASS|FAILED)\b[\s—:-]*(.*)/gi;

/** Parse the last VERDICT line out of an agent's final message. */
export function parseVerdict(text: string): { verdict: Verdict; reason: string } {
  let match: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((match = VERDICT_RE.exec(text)) !== null) last = match;

  if (!last) {
    const tail = text.trim().split("\n").slice(-2).join(" ").slice(0, 200);
    return {
      verdict: "FAILED",
      reason: `Agent did not emit a VERDICT line. Last output: ${tail || "(empty)"}`,
    };
  }

  const verdict: Verdict = last[1].toUpperCase() === "PASS" ? "PASS" : "FAILED";
  const reason =
    last[2].trim() ||
    (verdict === "PASS" ? "All required checks passed." : "No reason given.");
  return { verdict, reason };
}
