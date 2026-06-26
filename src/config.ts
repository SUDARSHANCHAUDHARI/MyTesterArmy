import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface Config {
  apiKey?: string;
  model?: string;
}

const CONFIG_DIR = join(homedir(), ".mytesterarmy");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export const DEFAULT_MODEL = "claude-opus-4-8";

/** Read config from disk. Never throws — a missing/corrupt file yields {}. */
export function readConfig(): Config {
  try {
    if (!existsSync(CONFIG_PATH)) return {};
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

/**
 * Resolve the API key. Precedence: env vars first (CI-friendly), then the
 * saved config file. Returns undefined if none is set.
 */
export function resolveApiKey(): string | undefined {
  return (
    process.env.MYTESTERARMY_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    readConfig().apiKey ||
    undefined
  );
}

export function resolveModel(override?: string): string {
  return (
    override ||
    process.env.MYTESTERARMY_MODEL ||
    readConfig().model ||
    DEFAULT_MODEL
  );
}

export { CONFIG_PATH };
