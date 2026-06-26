import { relative } from "node:path";
import type { RunResult } from "./agent.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

/** Pretty per-test line for the terminal. */
export function formatResult(result: RunResult): string {
  const badge =
    result.verdict === "PASS"
      ? `${GREEN}PASS${RESET}`
      : `${RED}FAILED${RESET}`;
  const dir = relative(process.cwd(), result.artifactDir);
  return (
    `${badge}  ${BOLD}${result.title}${RESET}\n` +
    `      ${result.reason}\n` +
    `      ${DIM}${result.steps} steps · artifacts: ${dir}${RESET}`
  );
}

/** Final summary line. Returns the process exit code (0 = all passed). */
export function formatSummary(results: RunResult[]): { text: string; exitCode: number } {
  const passed = results.filter((r) => r.verdict === "PASS").length;
  const failed = results.length - passed;
  const exitCode = failed === 0 ? 0 : 1;
  const color = failed === 0 ? GREEN : RED;
  const text = `${color}${passed} passed, ${failed} failed${RESET} of ${results.length} test(s)`;
  return { text, exitCode };
}

/** Machine-readable output for CI / coding agents. */
export function formatJson(results: RunResult[]): string {
  const passed = results.filter((r) => r.verdict === "PASS").length;
  return JSON.stringify(
    {
      summary: {
        total: results.length,
        passed,
        failed: results.length - passed,
      },
      results,
    },
    null,
    2,
  );
}
