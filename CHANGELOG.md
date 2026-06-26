# Changelog

All notable changes to this project are documented here.

## [0.1.0] — 2026-06-26

Initial release.

### Added

- **CLI** (`mta` / `mytesterarmy`): `run`, `mcp`, `auth`, `status`. Runs
  markdown tests, directories of tests, or inline prompts; CI-friendly exit
  codes (`0` pass / `1` fail) and `--json` output.
- **Four run modes** via `--provider`:
  - `api` — direct Anthropic SDK tool-use loop (metered key), no external CLI.
  - `claude-code` — Claude Agent SDK + browser MCP server, billed to your plan.
  - `codex` — `codex exec` + browser MCP server, billed to your ChatGPT plan.
  - `ollama` — fully local against an Ollama model, no API key.
- **Browser engine** (Playwright): `navigate`, `read_page`, `click`, `fill`,
  `screenshot`, deterministic PASS/FAILED verdict, screenshots + `result.json`
  artifacts under `.mytesterarmy/`.
- **Standalone browser MCP server** (`mta-browser-mcp`) reusable inside Claude
  Code / Codex sessions.
- **`MTA_BROWSER_CHANNEL`** — drive a system Chrome/Edge where bundled Chromium
  cannot be downloaded (CI, sandboxes).
- Agent skill + Claude plugin manifest, example scenarios, issue templates, docs.
