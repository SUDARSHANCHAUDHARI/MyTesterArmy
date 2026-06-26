# Public Bug Board

This repo uses GitHub Issues as a public bug board for the MyTesterArmy CLI.

## Issue Types

- `bug`: CLI behavior bug or a broken documented flow
- `regression`: previously working behavior now broken
- `feature`: missing capability or DX improvement

Use the issue templates in `.github/ISSUE_TEMPLATE/`.

## Required Data for Actionable Triage

Always include:

1. Exact command run (`mta run ...`)
2. Target URL / environment
3. Result (`PASS` / `FAILED`) and exit code
4. Artifact path under `.mytesterarmy/<timestamp>-<test>/`
5. Expected vs actual behavior

## Triage States

- `needs-info`: missing reproduction detail
- `confirmed`: reproduced
- `in-progress`: fix started
- `blocked`: waiting on a dependency
- `shipped`: fixed and released

## Fast Repro Checklist

```bash
mta status --json
mta run examples/tests/ --url "http://localhost:3000" --json
```

Attach the artifact directory from the failing run.
