import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserSession } from "../browser.js";
import type { RunResult, Verdict } from "../agent.js";
import type { TestCase } from "../tests.js";
import { makeArtifactDir } from "./shared.js";
import type { ExternalRunOptions } from "./claudeCode.js";

const DEFAULT_MODEL = "qwen3:8b";

function ollamaHost(): string {
  return (
    process.env.MTA_OLLAMA_HOST ||
    process.env.OLLAMA_HOST ||
    "http://127.0.0.1:11434"
  ).replace(/\/$/, "");
}

function ollamaModel(override?: string): string {
  return override || process.env.MTA_OLLAMA_MODEL || DEFAULT_MODEL;
}

const SYSTEM = `You are MyTesterArmy, an autonomous QA agent that drives a real web browser to verify whether a website behaves as expected.

Loop: call read_page to see the current page, take ONE action (navigate, click, fill), then read_page again to confirm before moving on. Capture a screenshot at important checkpoints. Judge only from what you actually observe — never assume a step worked.

Use the finish tool exactly once when you have enough evidence. Return PASS only if every required check passes; return FAILED the moment a required check fails, naming the broken step.`;

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  };
}

const TOOLS: OllamaTool[] = [
  fn("navigate", "Open a URL in the browser.", { url: { type: "string" } }, ["url"]),
  fn("read_page", "Read the current page: URL, title, visible text, and interactive elements. Call before deciding what to do.", {}, []),
  fn("click", "Click a link or button by its visible text or accessible name.", { text: { type: "string" } }, ["text"]),
  fn("fill", "Type a value into an input identified by its label or placeholder.", { target: { type: "string" }, value: { type: "string" } }, ["target", "value"]),
  fn("screenshot", "Capture a full-page screenshot for the report.", { label: { type: "string" } }, ["label"]),
  fn("finish", "End the test with a verdict. Call exactly once.", { verdict: { type: "string", enum: ["PASS", "FAILED"] }, reason: { type: "string" } }, ["verdict", "reason"]),
];

function fn(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): OllamaTool {
  return { type: "function", function: { name, description, parameters: { type: "object", properties, required } } };
}

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
}

/**
 * Run a test against a local Ollama model — no API key, no plan, fully local.
 * Requires the Ollama server running and a tool-capable model pulled
 * (e.g. `ollama pull qwen3:8b`). Override with MTA_OLLAMA_MODEL / MTA_OLLAMA_HOST.
 */
export async function runWithOllama(
  test: TestCase,
  body: string,
  opts: ExternalRunOptions,
): Promise<RunResult> {
  const artifactDir = makeArtifactDir(test.id);
  const log = opts.onStep ?? (() => {});
  const model = ollamaModel(opts.model);
  const host = ollamaHost();

  const browser = new BrowserSession({
    headed: opts.headed,
    timeout: opts.timeout,
    artifactDir,
    channel: process.env.MTA_BROWSER_CHANNEL || undefined,
  });

  let verdict: Verdict = "FAILED";
  let reason = "The model stopped before reaching a verdict.";

  await browser.start();
  try {
    const messages: OllamaMessage[] = [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Run this QA test${opts.url ? ` against ${opts.url}` : ""}. Wherever the test mentions the app, ` +
          `target URL, or "<target_url>", it means ${opts.url ?? "the URL in the test"}.\n\n--- TEST ---\n${body}`,
      },
    ];

    for (let turn = 0; turn < opts.maxSteps; turn++) {
      const res = await fetch(`${host}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, messages, tools: TOOLS, stream: false }),
      });
      if (!res.ok) {
        reason = `Ollama request failed: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 200);
        break;
      }
      const data = (await res.json()) as { message?: OllamaMessage };
      const msg = data.message;
      if (!msg) {
        reason = "Ollama returned no message.";
        break;
      }
      messages.push(msg);

      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        // No tool call — try to read a verdict from the prose, else nudge once.
        const m = /VERDICT:\s*(PASS|FAILED)\b[\s—:-]*(.*)/i.exec(msg.content);
        if (m) {
          verdict = m[1].toUpperCase() === "PASS" ? "PASS" : "FAILED";
          reason = m[2].trim() || (verdict === "PASS" ? "All checks passed." : "No reason given.");
          break;
        }
        messages.push({
          role: "user",
          content: "Use a tool to continue, or call finish with your verdict.",
        });
        continue;
      }

      let finished = false;
      for (const call of calls) {
        const name = call.function.name;
        const input = normalizeArgs(call.function.arguments);
        let result = "";
        switch (name) {
          case "navigate":
            log(`→ navigate ${String(input.url)}`);
            result = await browser.navigate(String(input.url));
            break;
          case "read_page": {
            log("→ read page");
            const snap = await browser.snapshot();
            result =
              `URL: ${snap.url}\nTitle: ${snap.title}\n\nVisible text:\n${snap.text}\n\n` +
              `Interactive elements:\n${snap.elements.map((e) => `- ${e}`).join("\n") || "(none found)"}`;
            break;
          }
          case "click":
            log(`→ click "${String(input.text)}"`);
            result = await browser.click(String(input.text));
            break;
          case "fill":
            log(`→ fill "${String(input.target)}"`);
            result = await browser.fill(String(input.target), String(input.value));
            break;
          case "screenshot":
            log(`→ screenshot "${String(input.label)}"`);
            result = await browser.screenshot(String(input.label));
            break;
          case "finish":
            verdict = input.verdict === "PASS" ? "PASS" : "FAILED";
            reason = String(input.reason ?? "");
            log(`✓ finish ${verdict}`);
            finished = true;
            result = "Recorded verdict.";
            break;
          default:
            result = `Unknown tool: ${name}`;
        }
        messages.push({ role: "tool", tool_name: name, content: result });
      }
      if (finished) break;
    }
  } catch (err) {
    verdict = "FAILED";
    reason = `Ollama run crashed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
  } finally {
    await browser.close();
  }

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

/** Ollama returns tool arguments as an object; tolerate a JSON string too. */
function normalizeArgs(args: Record<string, unknown> | string): Record<string, unknown> {
  if (typeof args === "string") {
    try {
      return JSON.parse(args) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return args ?? {};
}
