# --- Cloud Armor: WAF + per-IP rate limiting on the public API backend ---
#
# The external HTTPS ALB (lb.tf) previously fronted Cloud Run with NO edge security policy, so every
# request — including floods and injection probes — reached the app. This attaches a Cloud Armor
# security_policy to the backend service that:
#   1. rate-limits per client IP at the edge (throttle → 429), blunting brute-force / DoS before the
#      app's own per-route limiter (@Throttle) even runs;
#   2. runs the Google preconfigured OWASP rulesets (SQLi / XSS / LFI / RCE / scanner detection);
#   3. enables adaptive protection (L7 DDoS).
#
# The WAF rules default to PREVIEW (var.armor_waf_preview = true): they log matches without blocking,
# so a launch can observe false positives against real traffic before flipping to enforcement. Set
# armor_waf_preview = false to enforce (deny 403).

resource "google_compute_security_policy" "api" {
  name        = "lynia-api-armor"
  project     = local.project_id
  description = "WAF + per-IP rate limiting for the public Lynia API backend"

  # Layer-7 DDoS adaptive protection (learns normal traffic, auto-mitigates volumetric L7 attacks).
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }

  # --- Per-IP rate limit (always enforced) ---
  rule {
    action      = "throttle"
    priority    = 1000
    description = "Per-IP edge rate limit"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.armor_rate_limit_count
        interval_sec = var.armor_rate_limit_interval_sec
      }
    }
  }

  # --- OWASP preconfigured WAF rulesets (preview by default; flip via armor_waf_preview) ---
  rule {
    action      = "deny(403)"
    priority    = 2000
    preview     = var.armor_waf_preview
    description = "OWASP SQL injection"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-v33-stable')"
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 2001
    preview     = var.armor_waf_preview
    description = "OWASP cross-site scripting"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-v33-stable')"
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 2002
    preview     = var.armor_waf_preview
    description = "OWASP local file inclusion"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('lfi-v33-stable')"
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 2003
    preview     = var.armor_waf_preview
    description = "OWASP remote code execution"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('rce-v33-stable')"
      }
    }
  }

  rule {
    action      = "deny(403)"
    priority    = 2004
    preview     = var.armor_waf_preview
    description = "Scanner / recon detection"
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('scannerdetection-v33-stable')"
      }
    }
  }

  # --- Default rule (required, lowest priority) ---
  rule {
    action      = "allow"
    priority    = 2147483647
    description = "Default allow"
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }

  depends_on = [google_project_service.apis]
}
