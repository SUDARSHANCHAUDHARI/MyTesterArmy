import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserSession } from "./browser.js";

/**
 * Standalone stdio MCP server exposing the Playwright browser tools.
 *
 * Used by the `claude-code` and `codex` providers (and consumable directly
 * inside a Claude Code or Codex session). The host agent runs the QA loop and
 * drives these tools; the verdict is emitted by the host as text, so there is
 * no `finish` tool here.
 *
 * Configuration comes from env vars so any MCP host can set them:
 *   MTA_ARTIFACT_DIR  where screenshots are written
 *   MTA_HEADED=1      show the browser window
 *   MTA_TIMEOUT       per-action timeout in ms (default 15000)
 *
 * stdout is reserved for the MCP protocol — all logging goes to stderr.
 */
export async function startMcpServer(): Promise<void> {
  const artifactDir =
    process.env.MTA_ARTIFACT_DIR ||
    join(process.cwd(), ".mytesterarmy", `mcp-${Date.now()}`);
  mkdirSync(artifactDir, { recursive: true });

  const browser = new BrowserSession({
    headed: process.env.MTA_HEADED === "1",
    timeout: Number(process.env.MTA_TIMEOUT ?? 15000),
    artifactDir,
  });

  let started = false;
  const ensureStarted = async () => {
    if (!started) {
      await browser.start();
      started = true;
    }
  };
  const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

  const server = new McpServer({ name: "mta-browser", version: "0.1.0" });

  server.registerTool(
    "navigate",
    { description: "Open a URL in the browser.", inputSchema: { url: z.string() } },
    async ({ url }) => {
      await ensureStarted();
      return text(await browser.navigate(url));
    },
  );

  server.registerTool(
    "read_page",
    {
      description:
        "Read the current page: its URL, title, visible text, and interactive elements (links, buttons, inputs). Call before deciding what to do next.",
      inputSchema: {},
    },
    async () => {
      await ensureStarted();
      const snap = await browser.snapshot();
      return text(
        `URL: ${snap.url}\nTitle: ${snap.title}\n\n` +
          `Visible text:\n${snap.text}\n\n` +
          `Interactive elements:\n${snap.elements.map((e) => `- ${e}`).join("\n") || "(none found)"}`,
      );
    },
  );

  server.registerTool(
    "click",
    {
      description: "Click a link or button by its visible text or accessible name.",
      inputSchema: { text: z.string() },
    },
    async ({ text: t }) => {
      await ensureStarted();
      return text(await browser.click(t));
    },
  );

  server.registerTool(
    "fill",
    {
      description: "Type a value into an input identified by its label or placeholder.",
      inputSchema: { target: z.string(), value: z.string() },
    },
    async ({ target, value }) => {
      await ensureStarted();
      return text(await browser.fill(target, value));
    },
  );

  server.registerTool(
    "screenshot",
    {
      description: "Capture a full-page screenshot for the report.",
      inputSchema: { label: z.string() },
    },
    async ({ label }) => {
      await ensureStarted();
      return text(await browser.screenshot(label));
    },
  );

  const shutdown = async () => {
    await browser.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.error(`[mta-browser-mcp] ready · artifacts: ${artifactDir}`);
  await server.connect(new StdioServerTransport());
}
