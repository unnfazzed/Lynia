# Merchant dashboard tier (docs/plans/2026-merchant-console-deployment.md) — a third Cloud Run
# service (lynia-merchant) in the SAME project/VPC, exposed through the EXISTING external ALB under
# var.merchant_domain. Companion to lb.tf (the API) and admin.tf (the admin console).
#
# WHY THIS IS SIMPLER THAN admin.tf: the merchant dashboard is a PUBLIC, client-driven app — a
# merchant signs in with their own phone+OTP session (the same apps/api auth riders/customers use)
# and the browser itself holds the bearer token (apps/merchant/app/lib/session.ts), not this server.
# There is no privileged shared secret for this service to hold, so unlike the admin console there is
# no IAP, no OAuth client, and no Secret Manager container here: Cloud Armor + Google-managed TLS at
# the edge is the perimeter, and the app's own fail-closed middleware
# (apps/merchant/middleware.ts + app/lib/merchant-access.ts) is the auth boundary — it redirects an
# unauthenticated tablet to /login rather than 401ing like IAP does for admin. The real authorization
# boundary stays server-side on every apps/api merchant route (RestaurantsEnabledGuard →
# JwtAuthGuard → MerchantGuard), same as always.
#
# GATED OFF BY DEFAULT: every resource is behind var.merchant_enabled (false), so this file is a
# zero-diff no-op until the founder sets merchant_enabled = true and applies. Like prod/staging/admin,
# the Cloud Run SERVICE itself is created by CI (deploy-merchant.yml); Terraform provisions the edge
# (NEG, backend, cert) and the runtime SA.
#
# Ownership split (mirrors the API and admin): deploy-merchant.yml owns the Cloud Run service;
# Terraform owns the edge + runtime SA. The url-map host rule and the cert on the HTTPS proxy live in
# lb.tf (a url map and proxy are single resources), gated on the same var.merchant_enabled.
#
# Deploying this tier does NOT launch the merchant vertical — apps/api's RESTAURANTS_ENABLED /
# MERCHANT_* kill switches (deploy-staging.yml, release.yml) stay OFF in prod independently of this.
# Standing up the URL is the "dark launch" step (docs/plans/2026-07-26-merchant-verticals-plan.md
# §5): reachable by nobody useful until a merchant is onboarded AND the API flags flip.

# --- Merchant runtime SA (least privilege: run only — no secrets, no Cloud SQL, no bucket) ---
resource "google_service_account" "merchant_runtime" {
  count        = var.merchant_enabled ? 1 : 0
  account_id   = "lynia-run-merchant"
  display_name = "Lynia Cloud Run runtime (merchant dashboard)"
  project      = local.project_id
}

# CI deployer must be able to set the merchant SA on the merchant service.
resource "google_service_account_iam_member" "deployer_actas_merchant_runtime" {
  count               = var.merchant_enabled ? 1 : 0
  service_account_id  = google_service_account.merchant_runtime[0].name
  role                = "roles/iam.serviceAccountUser"
  member              = "serviceAccount:${google_service_account.deployer.email}"
}

# --- LB exposure: merchant NEG + backend (public — no IAP); host rule + cert attach live in lb.tf ---
resource "google_compute_region_network_endpoint_group" "merchant" {
  count                 = var.merchant_enabled ? 1 : 0
  name                  = "lynia-merchant-neg"
  region                = var.region
  project               = local.project_id
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = var.merchant_cloud_run_service
  }

  depends_on = [google_project_service.apis]
}

resource "google_compute_backend_service" "merchant" {
  count                 = var.merchant_enabled ? 1 : 0
  name                  = "lynia-merchant-backend"
  project               = local.project_id
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  # Same Cloud Armor perimeter as the API and admin edges. No `iap` block: this backend is public,
  # gated by the app's own OTP-session middleware rather than an identity-aware proxy.
  security_policy = google_compute_security_policy.api.id

  backend {
    group = google_compute_region_network_endpoint_group.merchant[0].id
  }

  log_config {
    enable      = true
    sample_rate = 1.0
  }
}

# Separate managed cert (attached alongside prod's + admin's on the HTTPS proxy in lb.tf) — adding
# the merchant domain to the EXISTING prod cert would force-replace it and churn prod TLS.
resource "google_compute_managed_ssl_certificate" "merchant" {
  count   = var.merchant_enabled ? 1 : 0
  name    = "lynia-merchant-cert"
  project = local.project_id

  managed {
    domains = [var.merchant_domain]
  }
}

# --- Arming outputs ---
output "MERCHANT_CLOUD_RUN_SERVICE" {
  value = var.merchant_enabled ? var.merchant_cloud_run_service : null
}

output "MERCHANT_CLOUD_RUN_SERVICE_ACCOUNT" {
  description = "Set as the MERCHANT_CLOUD_RUN_SERVICE_ACCOUNT repo Variable (deploy-merchant.yml --service-account)."
  value       = var.merchant_enabled ? google_service_account.merchant_runtime[0].email : null
}

output "merchant_endpoint" {
  description = "Point a DNS A record for merchant_domain at the SAME load_balancer_ip as prod (or set cloudflare_dns_enabled = true and let Terraform manage it — dns.tf)."
  value       = var.merchant_enabled ? "https://${var.merchant_domain}" : null
}
