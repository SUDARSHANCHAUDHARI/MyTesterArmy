---
name: mytesterarmy-cli
description: Use MyTesterArmy CLI to validate web app behavior after changes with targeted markdown tests, real-browser checks, screenshots, and strict pass/fail reporting. Trigger when verifying a UI flow works end to end, adding regression coverage, or wiring a CI check.
license: MIT
metadata:
  author: SudarshanTechLabs
  tags: mytesterarmy, qa, cli, browser-testing, regression, ci
---

# MyTesterArmy CLI

Validate web app behavior with `mta` / `mytesterarmy`. It drives a real Chromium
browser with Claude and returns a deterministic PASS/FAILED verdict plus local
artifacts.

Prefer durable markdown tests under `tests/` for repeatable coverage. Use an
inline `mta run "..."` prompt only for quick one-off exploration.

## When to Use

- Confirm a UI flow (auth, checkout, onboarding) still works after a code change.
- Add regression coverage for a feature as a markdown scenario.
- Produce a CI-visible pass/fail gate for a PR or release.
- Hand a coding agent concrete validation instead of "looks done".

## Setup

Check whether a key and model are configured:

```bash
mta status --json
```

If not authenticated, set an env var (CI) or save a key:

```bash
export MYTESTERARMY_API_KEY=<key>
# or
mta auth
```

First-time only — install the browser:

```bash
npx playwright install chromium
```

## Running Tests

A single scenario:

```bash
mta run tests/01-landing-page.md --url http://localhost:3000 --json
```

A whole directory (each `.md` file is one test):

```bash
mta run tests/ --url http://localhost:3000 --json
```

An ad-hoc prompt (exploration only — prefer saved tests for durable coverage):

```bash
mta run "verify the pricing CTA starts the signup flow" --url https://example.com --json
```

Useful flags:

- `--url <url>` — target under test; substituted for the `<target_url>` placeholder.
- `--json` — machine-readable output; always use this when an agent consumes the result.
- `--headed` — visible browser, for local debugging.
- `--timeout <ms>` — per-action timeout (default 15000).
- `--max-steps <n>` — cap agent turns per test (default 40).
- `--model <model>` — override the Claude model (default `claude-opus-4-8`).

Exit code is `0` when all tests pass, `1` when any fail — gate CI on it.

## Writing a Test

Tests are plain markdown: a title, a goal, and numbered steps. Use
`<target_url>` for the app under test so the same file runs against any
environment.

```markdown
# Login flow

Goal: a user can sign in and reach the dashboard.

Steps:
1. Navigate to `<target_url>/sign-in`
2. Complete a valid sign-in with a test account
3. Confirm redirect to `/dashboard` and that a user menu/avatar is visible
4. Return failed with the exact first broken step if any check fails
```

Rules for good tests:

- Cover one user journey per file.
- Prefer 3-8 concrete, observable steps.
- Make assertions about visible outcomes, URLs, or persisted state — not internals.
- State the failure expectation so the agent names the broken step.
- Never put real passwords in a committed test — use env-provided test accounts.

## Output

`--json` returns:

```json
{
  "summary": { "total": 1, "passed": 1, "failed": 0 },
  "results": [
    {
      "test": "01-landing-page",
      "title": "Landing page smoke",
      "verdict": "PASS",
      "reason": "Hero references the product and the Get Started CTA is visible.",
      "steps": 6,
      "artifactDir": ".mytesterarmy/2026-06-26T..."
    }
  ]
}
```

Artifacts (screenshots, `result.json`) land under
`.mytesterarmy/<timestamp>-<test>/`.

## Reporting

When reporting a run, include:

- Exact command used (`mta run ...`)
- Target URL / environment
- Verdict (`PASS` / `FAILED`) and exit code
- For failures: the broken step and the visible error from `reason`
- Artifact path

Do not claim a flow works unless an `mta run` actually returned PASS.

## References

| File | Description |
| --- | --- |
| [reporting-template.md](references/reporting-template.md) | Run report template |
