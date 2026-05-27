# Project Policy Example

`.mythos/policy.json` is an enforced repo-local SWD policy.

It is not a prompt hint. It applies before filesystem mutation in:

- `mythos chat`
- `mythos run`
- `mythos swd apply`
- MCP `swd_apply`

Built-in sensitive path protection still wins. A project policy cannot allow `.env`, `.npmrc`, `.git`, private keys, wallet files, or secret-like paths.

## Install The Example Policy

From a disposable test directory:

```bash
cd examples/project-policy
TMP="$(mktemp -d)"
cp policy.json blocked-mainnet.json "$TMP/"
cd "$TMP"

mkdir -p .mythos
cp policy.json .mythos/policy.json
mythos init --check
```

## What This Policy Does

The example policy:

- blocks `contracts/mainnet/**`
- blocks `infra/prod/**`
- requires confirmation for `scripts/**`
- requires confirmation for `.github/workflows/**`
- requires confirmation for `src/payments/**`
- blocks deletes
- caps action batches at 20 actions
- caps single action content at 50,000 bytes

Path patterns are matched case-insensitively by path segment. `*` matches within one segment, and `**` matches across path segments.

## Try The Blocked Action

```bash
mythos swd apply --file blocked-mainnet.json --json
```

Expected behavior:

- returns `ok: false`
- reports that project policy blocked the write
- does not write `contracts/mainnet/Vault.sol`
