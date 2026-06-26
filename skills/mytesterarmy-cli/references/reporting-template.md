# Run Report Template

Use this shape when reporting an `mta` run. Prefer `--json` output as the source.

```md
MyTesterArmy:
- Command: mta run tests/02-auth-smoke.md --url http://localhost:3000 --json
- Environment: http://localhost:3000
- Test: Auth smoke (02-auth-smoke)
- Result: PASS
- Exit code: 0
- Artifacts: .mytesterarmy/2026-06-26T10-04-12-000Z-02-auth-smoke/
```

If failed:

```md
MyTesterArmy:
- Command: mta run tests/02-auth-smoke.md --url http://localhost:3000 --json
- Environment: http://localhost:3000
- Test: Auth smoke (02-auth-smoke)
- Result: FAILED
- Exit code: 1
- Failure: "Step 3 — after submitting valid credentials the page stayed on /sign-in and showed 'Invalid email or password'."
- Artifacts: .mytesterarmy/2026-06-26T10-04-12-000Z-02-auth-smoke/
```
