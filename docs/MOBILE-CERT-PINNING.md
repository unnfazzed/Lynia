# Mobile TLS certificate pinning — arming runbook (SECURITY §P3-1)

The config plugin `apps/mobile/plugins/with-certificate-pinning.js` adds TLS certificate pinning for the
API/WS host on Android (`network_security_config` `<pin-set>`) and iOS (`NSPinnedDomains`). It is
**gated**: a complete no-op until `LYNIA_TLS_PINS` is set, so an un-armed build is byte-identical to a
build without pinning. Merging the plugin is therefore safe — this runbook is how you *arm* it.

## ⚠️ Read this first — pinning can brick the app

The API is fronted by a **Google-managed certificate** on the HTTPS load balancer (`api_domain`). Google
rotates the **leaf** automatically. Two hard rules:

1. **Pin the intermediate and/or root SPKI (Google Trust Services), never the leaf.** A leaf pin breaks
   on the first rotation.
2. **Always ship at least two pins — a primary and a backup** (e.g. the current intermediate + the GTS
   root, or two roots). If the sole pinned CA changes, a backup-less app can no longer connect and the
   only fix is a forced app update. The plugin **refuses to build with fewer than two pins.**

The Android pin-set also carries an **`expiration` date** (`LYNIA_TLS_PIN_EXPIRATION`) — past it, Android
**stops enforcing** pinning (a safety valve so a missed rotation degrades to "unpinned" instead of
"bricked"). Keep it a few months out and refresh it every release. iOS has no equivalent valve, which is
exactly why the backup pin is mandatory.

Pinning is a **native** change: it is **not OTA-able** (the `fingerprint` runtimeVersion shifts), so
arming requires a new EAS build and a store release.

## 1. Extract the pins

Get the base64 SHA-256 of the **Subject Public Key Info** for the intermediate and root in the live
chain (not the leaf):

```sh
HOST=lyniago.lyniafinance.com

# Dump the full chain the server presents.
openssl s_client -connect "$HOST:443" -servername "$HOST" -showcerts </dev/null 2>/dev/null > chain.pem

# For EACH cert in the chain that is a CA (intermediate + root — skip the leaf, the first cert),
# compute its SPKI pin:
openssl x509 -in <one-ca-cert>.pem -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl enc -base64
```

Pick the **intermediate** (primary) and the **root** (backup) — or two roots if you prefer maximum
stability. Cross-check the Google Trust Services roots (GTS Root R1–R4) against
https://pki.goog/repository/ so a backup pin is a long-lived GTS root that GTS is committed to.

## 2. Set the env for the build

Set these as **EAS secrets** (or in the build environment / `eas.json` `env` for the profile you ship):

```sh
eas secret:create --scope project --name LYNIA_TLS_PINS \
  --value "sha256/<intermediate-spki>=,sha256/<root-spki>="        # >= 2, comma-separated
eas secret:create --scope project --name LYNIA_TLS_PIN_EXPIRATION \
  --value "2026-12-31"                                             # a few months out; refresh each release
```

(Local dev/QA builds normally stay **un-armed** — leave the env unset so Metro/dev talks to the API
without pinning. Arm only the release/staging profiles.)

## 3. Build natively + validate on a device

Pinning only exists after `expo prebuild` / an EAS **native** build (not `eas update`):

```sh
eas build --profile <release-or-internal> --platform all
```

On a real device:
- **Positive:** the app signs in, tracks an order, and streams the WS position — normal traffic works,
  proving the pins match the live chain.
- **Negative (proves pinning is live):** put the device behind an intercepting proxy (mitmproxy/Charles)
  with its own CA trusted by the device. An **un-pinned** build still works through the proxy; a correctly
  **pinned** build fails to connect to the API (TLS pin mismatch). If the pinned build still works through
  the proxy, pinning is not taking effect — do not ship.

## 4. Rotation & maintenance

- Before your CA's rotation window, add the **next** intermediate's pin alongside the current ones (pin
  both old and new across a transition release), then drop the retired one a release later.
- Bump `LYNIA_TLS_PIN_EXPIRATION` forward every release.
- Keep the backup pin a long-lived GTS **root** so an intermediate change never bricks the app.

## Rollback

Unset `LYNIA_TLS_PINS` (delete the EAS secret) and cut a new native build — the plugin self-disables and
the app is unpinned again. There is no OTA rollback for a pinning mistake, which is the whole reason to
validate on-device (§3) before a store release.

## Status

The plugin + wiring are merged and inert. **Arming (steps 1–3) is founder-executed** — it needs the real
production cert chain, deliberate primary/backup pin choices, and an on-device native-build validation
that can't be done from CI. Until armed, the app ships exactly as today (unpinned).
