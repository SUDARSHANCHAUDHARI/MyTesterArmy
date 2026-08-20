# Contributing

Thanks for helping improve MyTesterArmy.

## Dev setup

```bash
pnpm install
pnpm exec playwright install chromium # or set MTA_BROWSER_CHANNEL=chrome
pnpm run build
```

## Workflow

- `pnpm run dev -- run <test> --url <url>` — run the CLI from source via tsx.
- `pnpm run typecheck` — must pass before opening a PR.
- `pnpm run build` — compiles `src/` to `dist/`.

## Project layout

```
src/
├── cli.ts            commander entry (run / mcp / auth / status)
├── run.ts            provider dispatcher
├── agent.ts          `api` provider — Anthropic tool-use loop
├── browser.ts        Playwright wrapper (the only place browser behavior lives)
├── mcp-server.ts     standalone browser MCP server (claude-code / codex / sessions)
├── tests.ts          markdown / prompt loader
├── report.ts         pretty + JSON output
└── providers/
    ├── claudeCode.ts Claude Agent SDK runner (plan auth)
    ├── codex.ts      `codex exec` runner (plan auth)
    ├── ollama.ts     local Ollama runner (no key)
    └── shared.ts     prompt + verdict helpers
```

## Guidelines

- Keep all browser behavior in `browser.ts` so every provider stays consistent.
- New providers go in `src/providers/` and register in `src/run.ts` (`PROVIDERS`).
- Match the existing style; run `pnpm run typecheck` before committing.
- Never commit secrets, `.env`, or `.mytesterarmy/` run artifacts (all gitignored).

## Filing issues

Use the templates in `.github/ISSUE_TEMPLATE/`. Include the exact `mta run`
command, target URL, verdict + exit code, and the artifact path. See
`docs/BUG_BOARD.md`.
