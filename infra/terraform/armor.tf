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

locals {
  # The five preconfigured OWASP rulesets, as data rather than five near-identical `rule` blocks.
  # Priorities are load-bearing: above the per-IP throttle at 1000 so rate limiting is evaluated
  # first, below the default-allow at 2147483647.
  armor_waf_rules = [
    { priority = 2000, description = "OWASP SQL injection", ruleset = "sqli-v33-stable" },
    { priority = 2001, description = "OWASP cross-site scripting", ruleset = "xss-v33-stable" },
    { priority = 2002, description = "OWASP local file inclusion", ruleset = "lfi-v33-stable" },
    { priority = 2003, description = "OWASP remote code execution", ruleset = "rce-v33-stable" },
    { priority = 2004, description = "Scanner / recon detection", ruleset = "scannerdetection-v33-stable" },
  ]
}

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
  # --- OWASP preconfigured rulesets (gated by armor_waf_enabled, previewed by armor_waf_preview) ---
  # Was five near-identical `rule` blocks differing only in priority, description and ruleset name.
  # Collapsed over local.armor_waf_rules so the set gates as a unit and a sixth ruleset is one list
  # entry rather than another copy-paste.
  #
  # Gated OFF by default from 2026-09-16, on cost evidence: Cloud Armor bills ~$1/rule/month, and a
  # rule in PREVIEW blocks nothing — it only logs would-have-matched entries for tuning. Pre-launch
  # there is no traffic to tune against, so these five were ~$5/mo spent observing an empty road.
  # NOT a reduction in live protection: preview rules were already blocking nothing, and the per-IP
  # throttle above (priority 1000, always enforced) is untouched. Arm this at launch prep, BEFORE
  # real traffic, so the preview window has something to learn from.
  dynamic "rule" {
    for_each = var.armor_waf_enabled ? local.armor_waf_rules : []
    content {
      action      = "deny(403)"
      priority    = rule.value.priority
      preview     = var.armor_waf_preview
      description = rule.value.description
      match {
        expr {
          expression = "evaluatePreconfiguredExpr('${rule.value.ruleset}')"
        }
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
