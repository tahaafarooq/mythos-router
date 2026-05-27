# GitHub Action Example

Use this when a repository wants read-only Mythos CI checks on pull requests.

`mythos verify --ci` does not call a model provider and does not require API keys.

It reviews PR/diff changes for risk surfaces such as:

- package scripts and npm lifecycle hooks
- GitHub Actions workflows
- shell/deploy/Docker surfaces
- `.env`, `.npmrc`, private-key-like files, and high-confidence secrets
- `.mythos/policy.json` changes
- changed Mythos receipts

## Workflow

Copy [`mythos-verify.yml`](mythos-verify.yml) into:

```text
.github/workflows/mythos-verify.yml
```

The workflow uses:

```bash
npx -y mythos-router@latest verify --ci
```

For stricter repositories, change the final command to:

```bash
npx -y mythos-router@latest verify --ci --strict
```

`--strict` fails CI on warnings as well as high-severity findings.
