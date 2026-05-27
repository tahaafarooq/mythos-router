# MCP Stdio Example

`mythos mcp` exposes Mythos as a local Model Context Protocol stdio server.

It does not:

- start an HTTP daemon
- open a port
- call Anthropic, OpenAI, or DeepSeek
- duplicate SWD logic

The MCP client launches `mythos mcp` as a subprocess and calls tools over stdin/stdout.

## Print Client Config

```bash
mythos mcp config generic
mythos mcp config claude
mythos mcp config cursor
mythos mcp config cursor --json
```

The generic shape is:

```json
{
  "mcpServers": {
    "mythos-router": {
      "command": "mythos",
      "args": ["mcp"]
    }
  }
}
```

Run the MCP client from the repository you want Mythos to guard, or use a project-scoped MCP config when the client supports it.

## Exposed Tools

| Tool | Purpose |
|------|---------|
| `swd_dry_run` | Preview external-agent file actions without writing files or receipts |
| `swd_apply` | Apply file actions through SWD, verify disk state, roll back failed writes, and write receipts |
| `receipts_list` | List recent local SWD receipts |
| `receipts_show` | Show a receipt as JSON or PR-ready Markdown |
| `receipts_verify` | Re-check current files and receipt integrity |
| `skills_list` | List visible project/global skill packs |
| `skills_check` | Validate skill packs |

## Optional Manual Smoke

Most users should let their MCP client call the server. For a low-level smoke test:

```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-smoke","version":"0.0.0"}}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
| mythos mcp
```

You should see `swd_dry_run`, `swd_apply`, receipt tools, and skill tools in the response.
