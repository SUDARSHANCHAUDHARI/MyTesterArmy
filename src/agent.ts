import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserSession } from "./browser.js";
import type { TestCase } from "./tests.js";

export type Verdict = "PASS" | "FAILED";

export interface RunResult {
  test: string;
  title: string;
  verdict: Verdict;
  reason: string;
  steps: number;
  artifactDir: string;
}

export interface RunOptions {
  apiKey: string;
  model: string;
  url?: string;
  headed: boolean;
  timeout: number;
  /** Hard cap on agent turns, to bound cost on a runaway test. */
  maxSteps: number;
  /** Called with a short progress line for each agent action. */
  onStep?: (line: string) => void;
}

const SYSTEM_PROMPT = `You are MyTesterArmy, an autonomous QA agent that drives a real web browser to verify whether a website behaves as expected — clicking, typing, and reading pages like a human tester would.

Work in a tight loop:
1. Use read_page to see the current page (its text and the interactive elements available) before deciding what to do.
2. Take one concrete action at a time: navigate, click, or fill.
3. After an action, read the page again to confirm the result before moving on.
4. Capture a screenshot at important checkpoints or when something looks wrong.
5. When you have enough evidence to decide, call finish exactly once.

Rules:
- Base every judgement on what you actually observe via tools — never assume a step worked without reading the page.
- Return PASS only if every required check in the test passes.
- Return FAILED the moment a required check fails. In the reason, name the exact step that broke and quote the visible error or unexpected state.
- Keep going until you can call finish. Do not ask the user questions — you are running autonomously.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "navigate",
    description: "Open a URL in the browser.",
    input_schema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL to open." },
      },
      required: ["url"],
    },
  },
  {
    name: "read_page",
    description:
      "Read the current page: returns its URL, title, visible text, and a list of interactive elements (links, buttons, inputs). Call this before deciding what to do next.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "click",
    description:
      "Click a link or button by its visible text or accessible name.",
    input_schema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Visible text / accessible name of the element to click.",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "fill",
    description: "Type a value into an input identified by its label or placeholder.",
    input_schema: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Label, placeholder, or accessible name of the field.",
        },
        value: { type: "string", description: "Text to type into the field." },
      },
      required: ["target", "value"],
    },
  },
  {
    name: "screenshot",
    description: "Capture a full-page screenshot for the report.",
    input_schema: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short label for the screenshot." },
      },
      required: ["label"],
    },
  },
  {
    name: "finish",
    description:
      "End the test with a verdict. Call exactly once when you have enough evidence.",
    input_schema: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["PASS", "FAILED"] },
        reason: {
          type: "string",
          description:
            "One or two sentences. On FAILED, name the broken step and quote the visible error.",
        },
      },
      required: ["verdict", "reason"],
    },
  },
];

/** Run a single test case end to end. */
export async function runTest(
  test: TestCase,
  body: string,
  opts: RunOptions,
): Promise<RunResult> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const artifactDir = join(process.cwd(), ".mytesterarmy", `${timestamp}-${test.id}`);
  mkdirSync(artifactDir, { recursive: true });

  const client = new Anthropic({ apiKey: opts.apiKey });
  const browser = new BrowserSession({
    headed: opts.headed,
    timeout: opts.timeout,
    artifactDir,
  });

  const log = opts.onStep ?? (() => {});
  let verdict: Verdict = "FAILED";
  let reason = "The agent stopped before reaching a verdict.";
  let steps = 0;

  await browser.start();
  try {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content:
          `Run this QA test${opts.url ? ` against ${opts.url}` : ""}.\n\n` +
          `When a step or the test mentions the app, target URL, or "<target_url>", it refers to ` +
          `${opts.url ?? "the URL given in the test"}.\n\n--- TEST ---\n${body}`,
      },
    ];

    for (let turn = 0; turn < opts.maxSteps; turn++) {
      const response = await client.messages.create({
        model: opts.model,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      messages.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      if (toolUses.length === 0) {
        // Model talked without acting; nudge it to use a tool.
        messages.push({
          role: "user",
          content:
            "Continue driving the browser with a tool, or call finish with a verdict.",
        });
        continue;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      let finished = false;

      for (const tool of toolUses) {
        steps++;
        const input = (tool.input ?? {}) as Record<string, unknown>;
        let result = "";

        switch (tool.name) {
          case "navigate":
            log(`→ navigate ${String(input.url)}`);
            result = await browser.navigate(String(input.url));
            break;
          case "read_page": {
            log("→ read page");
            const snap = await browser.snapshot();
            result =
              `URL: ${snap.url}\nTitle: ${snap.title}\n\n` +
              `Visible text:\n${snap.text}\n\n` +
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
            result = "Recorded verdict.";
            finished = true;
            break;
          default:
            result = `Unknown tool: ${tool.name}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: tool.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });
      if (finished) break;
    }
  } catch (err) {
    verdict = "FAILED";
    reason = `Test crashed: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
  } finally {
    await browser.close();
  }

  const result: RunResult = {
    test: test.id,
    title: test.title,
    verdict,
    reason,
    steps,
    artifactDir,
  };
  writeFileSync(join(artifactDir, "result.json"), JSON.stringify(result, null, 2));
  return result;
}
