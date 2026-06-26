import { runTest } from "./agent.js";
import type { RunResult } from "./agent.js";
import type { TestCase } from "./tests.js";
import { runWithClaudeCode } from "./providers/claudeCode.js";
import { runWithCodex } from "./providers/codex.js";
import { resolveApiKey, resolveModel } from "./config.js";

export type ProviderName = "api" | "claude-code" | "codex";

export const PROVIDERS: ProviderName[] = ["api", "claude-code", "codex"];

export interface DispatchOptions {
  provider: ProviderName;
  url?: string;
  headed: boolean;
  timeout: number;
  maxSteps: number;
  /** Raw --model value; undefined means "use the provider/plan default". */
  modelOverride?: string;
  onStep?: (line: string) => void;
}

/** Only the direct-API provider needs a metered key; the others use plan auth. */
export function requiresApiKey(provider: ProviderName): boolean {
  return provider === "api";
}

/** Run a single test case through the selected provider. */
export async function runOne(
  test: TestCase,
  body: string,
  opts: DispatchOptions,
): Promise<RunResult> {
  const common = {
    url: opts.url,
    headed: opts.headed,
    timeout: opts.timeout,
    maxSteps: opts.maxSteps,
    onStep: opts.onStep,
  };

  switch (opts.provider) {
    case "api": {
      const apiKey = resolveApiKey();
      if (!apiKey) throw new Error("No API key found for the `api` provider.");
      return runTest(test, body, {
        ...common,
        apiKey,
        model: resolveModel(opts.modelOverride),
      });
    }
    case "claude-code":
      return runWithClaudeCode(test, body, { ...common, model: opts.modelOverride });
    case "codex":
      return runWithCodex(test, body, { ...common, model: opts.modelOverride });
    default: {
      const _exhaustive: never = opts.provider;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}
