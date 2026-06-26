#!/usr/bin/env node
import { Command } from "commander";
import { createInterface } from "node:readline/promises";
import { runTest } from "./agent.js";
import type { RunResult } from "./agent.js";
import { loadTests, applyTargetUrl } from "./tests.js";
import { formatResult, formatSummary, formatJson } from "./report.js";
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
  .option("--headed", "Run with a visible browser window", false)
  .option("--timeout <ms>", "Per-action timeout in milliseconds", "15000")
  .option("--max-steps <n>", "Max agent turns per test", "40")
  .option("--model <model>", "Override the Claude model")
  .option("--json", "Emit machine-readable JSON instead of pretty output", false)
  .action(async (target: string, options) => {
    const apiKey = resolveApiKey();
    if (!apiKey) {
      fail(
        "No API key found. Run `mta auth`, or set MYTESTERARMY_API_KEY / ANTHROPIC_API_KEY.",
      );
    }

    let tests;
    try {
      tests = loadTests(target);
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }

    const json = options.json as boolean;
    const model = resolveModel(options.model);
    const results: RunResult[] = [];

    for (const test of tests) {
      if (!json) console.error(`\n▶ ${test.title}`);
      const body = applyTargetUrl(test.body, options.url);
      const result = await runTest(test, body, {
        apiKey: apiKey!,
        model,
        url: options.url,
        headed: options.headed,
        timeout: Number(options.timeout),
        maxSteps: Number(options.maxSteps),
        onStep: json ? undefined : (line) => console.error(`  ${line}`),
      });
      results.push(result);
      if (!json) console.error(formatResult(result));
    }

    if (json) {
      console.log(formatJson(results));
    } else {
      const { text } = formatSummary(results);
      console.error(`\n${text}`);
    }
    process.exit(formatSummary(results).exitCode);
  });

program
  .command("auth")
  .description("Save your Anthropic API key for future runs.")
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
  .description("Show whether an API key and model are configured.")
  .option("--json", "Emit JSON", false)
  .action((options) => {
    const status = {
      authenticated: Boolean(resolveApiKey()),
      model: resolveModel(),
      configPath: CONFIG_PATH,
    };
    if (options.json) {
      console.log(JSON.stringify(status, null, 2));
    } else {
      console.log(`Authenticated: ${status.authenticated ? "yes" : "no"}`);
      console.log(`Model:         ${status.model}`);
      console.log(`Config:        ${status.configPath}`);
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
