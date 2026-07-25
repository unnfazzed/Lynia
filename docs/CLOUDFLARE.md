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

## DNS records (managed in Terraform)

The zone's DNS records are codified in [`infra/terraform/dns.tf`](../infra/terraform/dns.tf)
so they're reviewed and version-controlled instead of hand-edited in the
dashboard. Terraform manages **A records** for the product hostnames, all
pointing at the single shared load-balancer IP (`load_balancer_ip` output):

| Hostname (var)                          | When            |
| --------------------------------------- | --------------- |
| `lyniago.lyniafinance.com` (`api_domain`)        | always          |
| `staging.lyniafinance.com` (`staging_api_domain`) | when `staging_enabled` |
| `lyniagoadmin.lyniafinance.com` (`admin_domain`)  | when `admin_enabled`   |

Records are **DNS-only (grey-cloud, `proxied = false`)** on purpose: proxying
would break Google-managed TLS issuance at the load balancer, the mobile app's
certificate pinning, and the API's single-hop `trust proxy` contract. Do not flip
`proxied` to `true` without the coordinated changes described in the `dns.tf`
header.

This is **off by default** (`cloudflare_dns_enabled = false`) so a plain
`terraform apply` is a no-op and existing hand-managed DNS is untouched. To hand
DNS over to Terraform, set the following in a VCS-ignored `terraform.tfvars`
(see `infra/terraform/terraform.tfvars.example`) and apply:

```hcl
cloudflare_dns_enabled = true
cloudflare_zone_id     = "<lyniafinance.com zone id>"
cloudflare_api_token   = "<token scoped to Zone:DNS:Edit>"
```

A Google-managed certificate only issues once the hostname resolves to the LB IP,
so enabling DNS here is also what unblocks TLS for a newly-armed tier.

### No Cloudflare token needed when DNS is off

With `cloudflare_dns_enabled = false` you need **no** Cloudflare credentials to run
Terraform. Leave `cloudflare_api_token` unset and `terraform init` / `validate` /
`plan` / `import` all work against defaults.

That was not always true. Until 2026-07-25 the provider received the variable's
empty-string default directly, and its format validator rejected `""` at
provider-configuration time — which Terraform evaluates before *every* operation,
regardless of the `count = 0` on the DNS records. The result was that the whole
module was unusable without a token: `scripts/adopt-vendor-secrets.sh` failed 100%
of the time for anyone who did not have the production `terraform.tfvars`, with an
error naming Cloudflare while the actual task was importing GCP secrets. CI never
caught it because the nightly drift probe injects the real tfvars before running.

The token is now normalised to `null` when empty (`infra/terraform/versions.tf`),
and the `terraform validate · defaults only` CI job runs with no tfvars present so
the same class of breakage fails at PR time instead of in someone's shell.

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
