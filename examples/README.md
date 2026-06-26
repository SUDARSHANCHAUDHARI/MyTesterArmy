# Examples

Starter scenarios for `mta`.

## Layout

```text
examples/
├── TESTER.md                  shared instructions / conventions
├── prompts/
│   └── ad-hoc-regression.md   one-off exploration prompt
└── tests/
    ├── 01-landing-page.md
    ├── 02-auth-smoke.md
    └── 03-project-create.md
```

## Run

```bash
export MYTESTERARMY_API_KEY=sk-ant-...

# one test
mta run examples/tests/01-landing-page.md --url "http://localhost:3000"

# whole directory
mta run examples/tests/ --url "http://localhost:3000"

# ad-hoc prompt
mta run "$(cat examples/prompts/ad-hoc-regression.md)" --url "http://localhost:3000"
```
