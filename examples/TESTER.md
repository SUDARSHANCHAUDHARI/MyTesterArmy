# Shared Test Instructions

Use `<target_url>` as the app under test.

## Scope

- Focus on functional regressions first.
- Ignore minor visual noise unless it blocks a core flow.

## Authentication

1. Open `<target_url>/sign-in`
2. Authenticate with a valid test account for this environment
3. Continue only after the dashboard / home is visible

## Reporting

- Return `PASS` only if all required checks pass.
- Return `FAILED` with a short, concrete reason naming the broken step when any
  check fails.
