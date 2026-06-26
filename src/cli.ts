#!/usr/bin/env node
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import type { RunResult } from "./agent.js";
import { loadTests, applyTargetUrl } from "./tests.js";
import { formatResult, formatSummary, formatJson } from "./report.js";
import { runOne, requiresApiKey, PROVIDERS } from "./run.js";
import type { ProviderName } from "./run.js";
import { startMcpServer } from "./mcp-server.js";
import {
  resolveApiKey,
  resolveModel,
  readConfig,
  writeConfig,
  CONFIG_PATH,
} from "./config.js";

const program = new Command();

program
  .name("mta")
  .description("AI QA agent that clicks through your website like a real human.")
  .version("0.1.0");

program
  .command("run")
  .description("Run a test scenario (markdown file, directory, or inline prompt).")
  .argument("<target>", "Path to a .md test, a directory of tests, or a prompt string")
  .option("-u, --url <url>", "Target URL under test")
  .option(
    "-p, --provider <name>",
    `Runner: ${PROVIDERS.join(" | ")} (api uses a key; claude-code/codex use your plan)`,
    "api",
  )
  .option("--headed", "Run with a visible browser window", false)
  .option("--timeout <ms>", "Per-action timeout in milliseconds", "15000")
  .option("--max-steps <n>", "Max agent turns per test", "40")
  .option("--model <model>", "Override the model (default depends on provider)")
  .option("--json", "Emit machine-readable JSON instead of pretty output", false)
  .action(async (target: string, options) => {
    const provider = options.provider as ProviderName;
    if (!PROVIDERS.includes(provider)) {
      return fail(`Unknown provider "${provider}". Use one of: ${PROVIDERS.join(", ")}`);
    }

    if (requiresApiKey(provider) && !resolveApiKey()) {
      fail(
        "No API key found for the `api` provider. Run `mta auth`, set MYTESTERARMY_API_KEY / ANTHROPIC_API_KEY, " +
          "or use `--provider claude-code` / `--provider codex` to run on your plan.",
      );
    }

    let tests;
    try {
      tests = loadTests(target);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }

    const json = options.json as boolean;
    const results: RunResult[] = [];

    for (const test of tests) {
      if (!json) console.error(`\n▶ [${provider}] ${test.title}`);
      const body = applyTargetUrl(test.body, options.url);
      const result = await runOne(test, body, {
        provider,
        url: options.url,
        headed: options.headed,
        timeout: Number(options.timeout),
        maxSteps: Number(options.maxSteps),
        modelOverride: options.model,
        onStep: json ? undefined : (line) => console.error(`  ${line}`),
      });
      results.push(result);
      if (!json) console.error(formatResult(result));
    }

    if (json) {
      console.log(formatJson(results));
    } else {
      console.error(`\n${formatSummary(results).text}`);
    }
    process.exit(formatSummary(results).exitCode);
  });

program
  .command("mcp")
  .description("Run the Playwright browser MCP server on stdio (for Claude Code / Codex).")
  .action(async () => {
    await startMcpServer();
  });

program
  .command("auth")
  .description("Save your Anthropic API key for the `api` provider.")
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const key = (await rl.question("Anthropic API key (sk-ant-...): ")).trim();
      if (!key) return fail("No key entered.");
      const config = readConfig();
      config.apiKey = key;
      writeConfig(config);
      console.log(`Saved to ${CONFIG_PATH}`);
    } finally {
      rl.close();
    }
  });

program
  .command("status")
  .description("Show provider availability and configuration.")
  .option("--json", "Emit JSON", false)
  .action((options) => {
    const status = {
      apiKey: Boolean(resolveApiKey()),
      model: resolveModel(),
      configPath: CONFIG_PATH,
      providers: {
        api: Boolean(resolveApiKey()),
        "claude-code": "requires `claude` login (plan)",
        codex: "requires `codex login` (plan)",
      },
    };
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(`api provider:   ${status.apiKey ? "key configured" : "no key"}`);
      console.log(`claude-code:    uses your Claude Code login (run \`claude\` to log in)`);
      console.log(`codex:          uses your Codex login (run \`codex login\`)`);
      console.log(`api model:      ${status.model}`);
      console.log(`config:         ${status.configPath}`);
    }
  });

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(2);
}

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
