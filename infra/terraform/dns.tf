# Cloudflare DNS for the lyniafinance.com zone.
#
# WHY THIS EXISTS
# The product's DNS was previously created by hand in the Cloudflare dashboard —
# every "create a DNS A record ..." note in lb.tf / staging.tf / admin.tf /
# outputs.tf described a manual step. This file brings those records under
# Terraform so they are reviewed, version-controlled, and always point at the
# live load-balancer IP instead of a value someone typed once.
#
# WHAT IT MANAGES
# Four A records, all resolving to the ONE shared global external HTTPS ALB
# static IP (google_compute_global_address.api / the load_balancer_ip output):
#   - api_domain          prod API          (always, when DNS is enabled)
#   - staging_api_domain  staging API       (only when staging_enabled)
#   - admin_domain        admin console     (only when admin_enabled)
#   - merchant_domain     merchant dashboard (only when merchant_enabled)
# There is no AAAA record: the LB address is IPv4-only (lb.tf, ip_version=IPV4).
#
# WHY proxied = false (grey-cloud / DNS-only) — DO NOT flip to true without a plan:
#   1. TLS is Google-managed at the ALB. A Google-managed cert only issues once the
#      hostname resolves to the LB IP; Cloudflare's orange-cloud proxy terminates
#      TLS at its edge and can break that issuance/renewal (lb.tf, outputs.tf).
#   2. The mobile app pins the leaf/intermediate cert for api_domain:443
#      (apps/mobile/plugins/with-certificate-pinning.js). Proxying presents
#      Cloudflare's cert instead and breaks the pins.
#   3. The API runs `trust proxy = 1` — exactly one hop, client -> ALB (lb.tf).
#      A Cloudflare proxy inserts a second hop and would corrupt client-IP
#      handling unless TRUST_PROXY is bumped in lockstep.
#
# ENABLEMENT
# Everything is gated by var.cloudflare_dns_enabled (default false), so a plain
# apply stays a no-op and existing hand-managed DNS is untouched until you opt in.
# To enable: set cloudflare_dns_enabled = true, cloudflare_zone_id, and
# cloudflare_api_token (in a VCS-ignored *.tfvars). Staging/admin records also
# follow their own tier flags, so a record never appears for a tier whose backend
# does not exist yet.

locals {
  # 1 = "automatic" TTL — Cloudflare serves DNS-only records at 300s.
  cloudflare_dns_ttl = 1
}

# Production API — managed whenever Cloudflare DNS is enabled.
resource "cloudflare_dns_record" "api" {
  count = var.cloudflare_dns_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.api_domain
  type    = "A"
  content = google_compute_global_address.api.address
  ttl     = local.cloudflare_dns_ttl
  proxied = false
  comment = "Prod API -> global external HTTPS LB. Managed by Terraform (dns.tf)."
}

# Staging API — only when the staging tier is armed (staging.tf).
resource "cloudflare_dns_record" "staging" {
  count = var.cloudflare_dns_enabled && var.staging_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.staging_api_domain
  type    = "A"
  content = google_compute_global_address.api.address
  ttl     = local.cloudflare_dns_ttl
  proxied = false
  comment = "Staging API -> shared ALB. Managed by Terraform (dns.tf)."
}

# Admin console — only when the admin tier is armed (admin.tf).
resource "cloudflare_dns_record" "admin" {
  count = var.cloudflare_dns_enabled && var.admin_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.admin_domain
  type    = "A"
  content = google_compute_global_address.api.address
  ttl     = local.cloudflare_dns_ttl
  proxied = false
  comment = "Admin console (IAP-gated) -> shared ALB. Managed by Terraform (dns.tf)."
}

# Merchant dashboard — only when the merchant tier is armed (merchant.tf).
resource "cloudflare_dns_record" "merchant" {
  count = var.cloudflare_dns_enabled && var.merchant_enabled ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = var.merchant_domain
  type    = "A"
  content = google_compute_global_address.api.address
  ttl     = local.cloudflare_dns_ttl
  proxied = false
  comment = "Merchant dashboard (public) -> shared ALB. Managed by Terraform (dns.tf)."
}
