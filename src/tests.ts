import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

export interface TestCase {
  /** Stable id derived from the file name, or "prompt" for ad-hoc runs. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** The full instruction text handed to the agent. */
  body: string;
  /** Source path, or null for an inline prompt. */
  source: string | null;
}

const TEST_EXTENSIONS = new Set([".md", ".markdown", ".txt"]);

/**
 * Resolve a run target into one or more test cases.
 *
 * The target is either:
 *  - a path to a markdown file        -> one test case
 *  - a path to a directory            -> every markdown file inside (sorted)
 *  - any other string                 -> treated as an inline prompt
 */
export function loadTests(target: string): TestCase[] {
  let stat: ReturnType<typeof statSync> | null = null;
  try {
    stat = statSync(target);
  } catch {
    stat = null;
  }

  if (stat?.isDirectory()) {
    const files = readdirSync(target)
      .filter((f) => TEST_EXTENSIONS.has(extname(f).toLowerCase()))
      .sort();
    if (files.length === 0) {
      throw new Error(`No test files (.md/.txt) found in ${target}`);
    }
    return files.map((f) => fileToTest(join(target, f)));
  }

  if (stat?.isFile()) {
    return [fileToTest(target)];
  }

  // Inline prompt.
  return [
    {
      id: "prompt",
      title: firstLine(target),
      body: target,
      source: null,
    },
  ];
}

function fileToTest(path: string): TestCase {
  const body = readFileSync(path, "utf8");
  const name = basename(path).replace(/\.(md|markdown|txt)$/i, "");
  return {
    id: name,
    title: extractTitle(body) || name,
    body,
    source: path,
  };
}

/** Pull the first markdown H1, or the first non-empty line. */
function extractTitle(body: string): string | null {
  const h1 = body.match(/^#\s+(.+)$/m);
  if (h1) return h1[1].trim();
  return firstLine(body) || null;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim().length > 0);
  return (line ?? "").trim().slice(0, 80);
}

/**
 * Substitute the target URL into a test body. Supports the `<target_url>`
 * placeholder convention used by the example scenarios.
 */
export function applyTargetUrl(body: string, url: string | undefined): string {
  if (!url) return body;
  return body.replaceAll("<target_url>", url);
}
