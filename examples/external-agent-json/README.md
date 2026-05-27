# External Agent JSON Example

Use this when an external agent already decides what file actions it wants to perform and needs Mythos to act as the verified execution boundary.

No model provider key is required by Mythos in this path.

## Dry Run First

From a disposable test directory:

```bash
cd examples/external-agent-json
TMP="$(mktemp -d)"
cp actions.json blocked-env.json "$TMP/"
cd "$TMP"

mythos swd apply --file actions.json --dry-run --json
```

Expected behavior:

- validates the JSON action envelope
- reviews paths through the built-in security policy
- previews the write
- does not create files
- does not write receipts

## Apply And Inspect Receipt

```bash
mythos swd apply --file actions.json --json
mythos receipts show latest --markdown
mythos receipts verify latest --json
```

Expected behavior:

- creates `agent-output.md`
- verifies the actual filesystem state
- writes a local SWD receipt under `.mythos/receipts/`
- lets you paste the Markdown receipt into a PR or review thread

## Blocked Sensitive Path

```bash
mythos swd apply --file blocked-env.json --json
```

Expected behavior:

- returns `ok: false`
- rejects `apps/api/.env`
- does not write the file
- exits non-zero

This demonstrates the same nested sensitive path protection used by chat, run, SWD apply, and MCP apply.
