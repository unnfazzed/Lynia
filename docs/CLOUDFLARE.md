# Cloudflare (DNS)

Cloudflare is currently used **only for DNS**. This doc covers how the Cloudflare
agent tooling is wired into the repo so Claude Code sessions can manage DNS
records (and read Cloudflare docs) through the official Cloudflare MCP servers.

## What's set up

The Cloudflare MCP servers are registered at **project scope** in
[`.mcp.json`](../.mcp.json), so every Claude Code session opened in this repo
picks them up:

| Server            | URL                                    | Auth              | Why |
| ----------------- | -------------------------------------- | ----------------- | --- |
| `cloudflare`      | `https://mcp.cloudflare.com/mcp`       | OAuth (per user)  | Account / zone / **DNS record** management |
| `cloudflare-docs` | `https://docs.mcp.cloudflare.com/mcp`  | None (public)     | Search the Cloudflare docs |

The other Cloudflare servers (`cloudflare-bindings`, `cloudflare-builds`,
`cloudflare-observability`) are **intentionally not registered** — they're for
Workers/Pages builds and observability, which we don't use yet. Add them if that
changes (see below).

## First-time authorization (required, interactive)

The `cloudflare` server is OAuth-gated: authorization triggers on first tool use
and opens a browser to sign in to your Cloudflare account. This must be done in
an **interactive Claude Code session on your own machine** — it cannot be
completed in a headless/remote session.

1. Open this repo with `claude`.
2. Approve the project MCP servers when prompted (project-scoped servers are
   `Pending approval` until you accept them once).
3. The first time a Cloudflare tool runs, complete the OAuth flow in the browser.

`cloudflare-docs` is public and needs no authorization.

Check status any time with:

```bash
claude mcp list
```

## Skills (optional, per-developer)

Cloudflare also ships Claude Code skills. Like gstack, these are installed
per-developer (not vendored into the repo):

```bash
claude plugin marketplace add cloudflare/skills
claude plugin install cloudflare@cloudflare
```

Then run `/reload-plugins` in Claude. The MCP servers above are enough to manage
DNS on their own; the skills just add Cloudflare-specific guidance.

## Adding the Workers/observability servers later

```bash
claude mcp add --scope project --transport http cloudflare-bindings      https://bindings.mcp.cloudflare.com/mcp
claude mcp add --scope project --transport http cloudflare-builds        https://builds.mcp.cloudflare.com/mcp
claude mcp add --scope project --transport http cloudflare-observability https://observability.mcp.cloudflare.com/mcp
```

## Reference

- Official setup prompt: <https://developers.cloudflare.com/agent-setup/prompt.md>
