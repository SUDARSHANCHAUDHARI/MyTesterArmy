# MyTesterArmy

**AI QA agent that clicks through your website like a real human.**

[![npm version](https://img.shields.io/npm/v/mytesterarmy?logo=npm&color=cb3837)](https://www.npmjs.com/package/mytesterarmy)
[![npm downloads](https://img.shields.io/npm/dm/mytesterarmy?logo=npm)](https://www.npmjs.com/package/mytesterarmy)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![node](https://img.shields.io/node/v/mytesterarmy)](https://nodejs.org)

MyTesterArmy (`mta` / `mytesterarmy`) is an agent-first QA runner. It drives a
real browser with an LLM, reads each page like a tester would, and returns a
deterministic **PASS** / **FAILED** verdict plus local artifacts.

- Run browser checks from plain prompts.
- Run reusable markdown scenarios (`examples/tests/*.md`).
- Get deterministic pass/fail output plus screenshots and a `result.json`.
- Feed concrete validation back to coding agents (`--json`).
- Pick your runner: an Anthropic **API key**, your **Claude Code / Codex plan**,
  or a **local Ollama** model — no key required.

> Open-source, local-first replica of the [tester-army/cli](https://github.com/tester-army/cli)
> concept. No cloud account required — it runs entirely on your machine.

## How it works

```
mta run <test> --url <url>
        │
        ▼
  load markdown test / prompt   (src/tests.ts)
        │
        ▼
  Claude agent loop             (src/agent.ts)  ── tools ──▶  Playwright browser
   navigate · read_page · click · fill · screenshot · finish   (src/browser.ts)
        │
        ▼
  PASS / FAILED + artifacts     .mytesterarmy/<timestamp>/
```

The agent only judges from what it actually observes through the browser tools,
and stops the moment a required check fails — naming the broken step.

## Quickstart

Install globally from the npm registry with pnpm:

```bash
pnpm add -g mytesterarmy
pnpm exec playwright install chromium # or set MTA_BROWSER_CHANNEL=chrome
```

Or run from source:

```bash
git clone https://github.com/SUDARSHANCHAUDHARI/MyTesterArmy.git
cd MyTesterArmy && pnpm install && pnpm run build
```

Authenticate. Either use a metered API key, or skip this and run on your
existing Claude Code / Codex plan (see [Run modes](#run-modes-providers)):

```bash
mta auth                              # API key → ~/.mytesterarmy/config.json
# or, for CI:
export MYTESTERARMY_API_KEY=sk-ant-...
```

Run a scenario:

```bash
mta run examples/tests/01-landing-page.md --url "http://localhost:3000"
```

Run an ad-hoc prompt:

```bash
mta run "check the pricing page CTA opens the signup flow" --url "https://example.com"
```

Run a whole directory:

```bash
mta run examples/tests/ --url "http://localhost:3000"
```

## Run modes (providers)

Pick how the agent loop runs and how it's billed with `--provider`:

| Provider | Auth | Needs | Billed to |
| --- | --- | --- | --- |
| `api` (default) | Anthropic API key | nothing else | your API key (metered) |
| `claude-code` | your Claude Code login | `claude` logged in | your Claude/Max plan |
| `codex` | your Codex login | `codex login` | your ChatGPT plan |
| `ollama` | none — fully local | Ollama server + a tool-capable model | free / local compute |

```bash
# Direct API (default)
mta run examples/tests/02-auth-smoke.md --url http://localhost:3000

# Claude Code — uses your subscription (log in first: `claude`, then /login)
mta run examples/tests/02-auth-smoke.md --url http://localhost:3000 --provider claude-code

# Codex — uses your ChatGPT plan (log in first: `codex login`)
mta run examples/tests/02-auth-smoke.md --url http://localhost:3000 --provider codex

# Ollama — fully local, no key (needs the Ollama server + a tool-capable model)
ollama pull qwen3:8b
mta run examples/tests/02-auth-smoke.md --url http://localhost:3000 --provider ollama
```

The `ollama` provider runs the same in-process loop as `api` against a local
model — no key, no network, no plan. The model **must support structured tool
calling**: `qwen3` works well (default `qwen3:8b`); models that emit tool calls
as plain JSON text (e.g. `qwen2.5-coder`) won't drive the browser. Override with
`MTA_OLLAMA_MODEL` / `MTA_OLLAMA_HOST`.

Under the hood, the `claude-code` and `codex` providers drive a shared
**Playwright browser MCP server** (`mta-browser-mcp`); the host agent runs the
loop on your plan and ends with a `VERDICT: PASS/FAILED` line that `mta` parses.
The `api` provider runs its own Anthropic tool-use loop in-process (no external
CLI needed).

## Inside a Claude Code or Codex session

The same browser MCP server can be registered directly in your editor agent, so
you can ask it to test a page mid-session.

**Claude Code** — `.mcp.json` in your project:

```json
{
  "mcpServers": {
    "browser": { "command": "mta-browser-mcp" }
  }
}
```

**Codex** — `~/.codex/config.toml`:

```toml
[mcp_servers.browser]
command = "mta-browser-mcp"
```

Then ask the agent: *"Use the browser tools to open localhost:3000 and verify
the login flow works."* Screenshots land under `.mytesterarmy/` (set
`MTA_ARTIFACT_DIR` to change it). See `skills/mytesterarmy-cli/SKILL.md`.

## Usage

```
mta run <target> [options]

  <target>            A .md test file, a directory of tests, or a prompt string

  -u, --url <url>        Target URL under test (substituted for <target_url>)
  -p, --provider <name>  api | claude-code | codex (default api)
  --headed               Show the browser window
  --timeout <ms>         Per-action timeout (default 15000)
  --max-steps <n>        Max agent turns per test (default 40)
  --model <model>        Override the model (default depends on provider)
  --json                 Machine-readable output for CI / coding agents
```

Other commands:

```bash
mta status            # is a key + model configured?
mta auth              # save an API key
```

Exit code is `0` when every test passes, `1` when any fails — wire it straight
into CI.

## Writing tests

A test is plain markdown. Use `<target_url>` and `mta` substitutes `--url`:

```markdown
# Auth smoke

Goal: verify sign-in works and the user reaches the app shell.

Steps:
1. Navigate to `<target_url>/sign-in`
2. Complete a valid sign-in flow
3. Confirm redirect to an authenticated area (`/dashboard` or equivalent)
4. Return failed with the exact first broken step if any check fails
```

See `examples/` for more.

## Artifacts

Each run writes to `.mytesterarmy/<timestamp>-<test>/`:

- `NN-label.png` — screenshots the agent captured
- `result.json` — verdict, reason, step count

## Agent skill

`mta` ships with an agent skill so coding agents (Claude Code, etc.) know how to
call it for validation. See `skills/mytesterarmy-cli/SKILL.md`, installable as a
Claude plugin via `.claude-plugin/marketplace.json`.

## Configuration

| Source | Key |
| --- | --- |
| Env (CI) | `MYTESTERARMY_API_KEY` or `ANTHROPIC_API_KEY` |
| Env | `MYTESTERARMY_MODEL` |
| Env | `MTA_OLLAMA_MODEL` (default `qwen3:8b`) · `MTA_OLLAMA_HOST` (default `http://127.0.0.1:11434`) |
| Env | `MTA_BROWSER_CHANNEL` — drive a system browser (`chrome`, `msedge`) instead of bundled Chromium |
| File | `~/.mytesterarmy/config.json` (`mta auth`) |

### No bundled Chromium? Use a system browser

If `pnpm exec playwright install chromium` is blocked (locked-down CI, sandbox), point
`mta` at an installed Chrome/Edge instead — no download needed:

```bash
export MTA_BROWSER_CHANNEL=chrome
mta run examples/tests/01-landing-page.md --url http://localhost:3000
```

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) and the issue
templates in `.github/ISSUE_TEMPLATE/`.

## Author

Built by **Sudarshan Chaudhari** ([SudarshanTechLabs](https://github.com/SUDARSHANCHAUDHARI)).

Inspired by the [tester-army/cli](https://github.com/tester-army/cli) concept;
this is an independent, open-source, local-first implementation.

## License

[MIT](./LICENSE) © 2026 SudarshanTechLabs
