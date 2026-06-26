import { query } from "@anthropic-ai/claude-agent-sdk";
import { writeFileSync } from "node:fs";
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

export interface ExternalRunOptions {
  url?: string;
  headed: boolean;
  timeout: number;
  maxSteps: number;
  /** Only set when the user passed --model; otherwise the plan default is used. */
  model?: string;
  onStep?: (line: string) => void;
}

const BROWSER_TOOLS = [
  "mcp__browser__navigate",
  "mcp__browser__read_page",
  "mcp__browser__click",
  "mcp__browser__fill",
  "mcp__browser__screenshot",
];

/**
 * Run a test through the Claude Agent SDK (Claude Code as a library).
 *
 * Authentication: when ANTHROPIC_API_KEY is unset, the SDK uses the local
 * Claude Code login — i.e. your subscription/plan — so runs are not billed to
 * a separate metered key. Be logged in via `claude` first.
 */
export async function runWithClaudeCode(
  test: TestCase,
  body: string,
  opts: ExternalRunOptions,
): Promise<RunResult> {
  const artifactDir = makeArtifactDir(test.id);
  const log = opts.onStep ?? (() => {});
  const prompt = buildExternalPrompt(body, opts.url);

  let finalText = "";
  let verdict: RunResult["verdict"] = "FAILED";
  let reason = "The agent stopped before reaching a verdict.";

  try {
    for await (const message of query({
      prompt,
      options: {
        maxTurns: opts.maxSteps,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        // Don't inherit the user's project/global Claude settings — keep runs hermetic.
        settingSources: [],
        allowedTools: BROWSER_TOOLS,
        ...(opts.model ? { model: opts.model } : {}),
        mcpServers: {
          browser: {
            command: process.execPath,
            args: [mcpServerPath()],
            env: browserEnv({
              artifactDir,
              timeout: opts.timeout,
              headed: opts.headed,
            }),
          },
        },
      },
    })) {
      if (message.type === "assistant") {
        for (const block of message.message.content) {
          if (block.type === "text" && block.text.trim()) {
            log(`· ${firstLine(block.text)}`);
          } else if (block.type === "tool_use") {
            log(`→ ${String(block.name).replace("mcp__browser__", "")}`);
          }
        }
      } else if (message.type === "result") {
        finalText = "result" in message ? String(message.result ?? "") : "";
        if (message.subtype !== "success") {
          reason = `Claude Code run ended with: ${message.subtype}`;
        }
      }
    }
    const parsed = parseVerdict(finalText);
    verdict = parsed.verdict;
    reason = parsed.reason;
  } catch (err) {
    verdict = "FAILED";
    reason = `Claude Code run crashed: ${errMsg(err)}`;
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

function firstLine(text: string): string {
  return text.trim().split("\n")[0].slice(0, 100);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0] : String(err);
}
