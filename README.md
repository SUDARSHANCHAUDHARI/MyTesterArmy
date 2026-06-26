# MyTesterArmy

**AI QA agent that clicks through your website like a real human.**

MyTesterArmy (`mta` / `mytesterarmy`) is an agent-first QA runner. It drives a
real Chromium browser with Claude, reads each page like a tester would, and
returns a deterministic **PASS** / **FAILED** verdict plus local artifacts.

- Run browser checks from plain prompts.
- Run reusable markdown scenarios (`examples/tests/*.md`).
- Get deterministic pass/fail output plus screenshots and a `result.json`.
- Feed concrete validation back to coding agents (`--json`).

> Open-source, local-first replica of the [tester-army/cli](https://github.com/tester-army/cli)
> concept. No cloud account required — it runs entirely on your machine against
> the Anthropic API with your own key.

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

Install dependencies and the browser, then build:

```bash
npm install
npx playwright install chromium
npm run build
```

Authenticate (stores the key in `~/.mytesterarmy/config.json`):

```bash
mta auth
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

## Usage

```
mta run <target> [options]

  <target>            A .md test file, a directory of tests, or a prompt string

  -u, --url <url>     Target URL under test (substituted for <target_url>)
  --headed            Show the browser window
  --timeout <ms>      Per-action timeout (default 15000)
  --max-steps <n>     Max agent turns per test (default 40)
  --model <model>     Override the Claude model (default claude-opus-4-8)
  --json              Machine-readable output for CI / coding agents
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
| File | `~/.mytesterarmy/config.json` (`mta auth`) |

## License

MIT
