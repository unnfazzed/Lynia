# Didit branding: make the ID check look like LyniaGo

The rider's ID check runs Didit's hosted pages inside our in-app sheet (`apps/mobile/src/kyc/KycCheckHost.tsx`,
ledger D-37). The pixels inside the sheet (document capture, selfie, progress) are Didit's, and the ledger exempts them
from pixel parity. The owner's instruction still applies: *the check must look like the app* (2026-08-20, reaffirmed
2026-08-22), and *never name the vendor* (D-38). Didit's own branding settings are how we get there.

## Where it stands (read 2026-10-12 through the Didit connector)

Both applications, **LyniaGo (Sandbox)** (`3ffa8074-…`) and the live **My Application** (`ae2a0e9f-…`), are on
Didit's defaults:

| Setting | Now | Problem |
|---|---|---|
| `color_button_1` / `color_panel` | `#2567FF` (Didit blue) | Our CTA is green `#00812F` |
| `color_primary` / `color_on_background` | `#000000` | Our ink is `#14181B` |
| `logo_square`, `logo_rectangular`, `favicon`, `app_public_name` | none | Nothing says LyniaGo |
| `skip_welcome_screen` | `false` | Didit's own welcome page shows before our rider starts |
| `disable_login_with_didit` | `false` | Offers "Login with Didit", naming the vendor (breaks D-38) |
| `completion_display_mode` | `decision` | Probably shows Didit's own result page before the rider returns to our F1–F8 pages (not yet tested on a device) |
| `privacy_policy_url` | none | Should be our privacy policy |
| `sms_sender_name` | none | |
| Workflows `is_white_label_enabled` | `false` on every workflow, both apps | |

## Target values (Calm Mint v2 tokens, `packages/shared/src/design-tokens.ts`)

| Didit setting | Value | Token |
|---|---|---|
| `color_button_1` | `#00812F` | `cta` |
| `color_button_text_1` | `#FFFFFF` | white on CTA (≈4.7:1) |
| `color_button_2` | `#F6F7F8` | `surface` |
| `color_button_text_2` | `#14181B` | `ink` |
| `color_primary` | `#14181B` | `ink` |
| `color_secondary` | `#5B6670` | `muted` |
| `color_background` | `#FFFFFF` | `bg` |
| `color_on_background` | `#14181B` | `ink` |
| `color_panel` | `#E9F8EF` | `mint` |
| `color_panel_10` | `#006630` | `greenText` |
| `color_on_panel_1` | `#5B6670` | `muted` |
| `color_on_panel_2` | `#F6F7F8` | `surface` |
| `color_pill_text` | `#006630` | `greenText` |
| `border_radius_buttons` | max allowed (ours are full pills, `radius.button` 999) | `radius.button` |
| `border_radius_panel` | `16` | `radius.card` |
| `font_family` | Inter (already) | `font.family` |
| `app_public_name` | `LyniaGo` | |
| `logo_square` | `packages/design/assets/brand/lyniago-icon.svg` rendered to PNG (256×256) | |
| `logo_rectangular` | `packages/design/assets/brand/lyniago-wordmark.svg` rendered to PNG (480×128) | |
| `favicon` | `packages/design/assets/brand/icon/lyniago-icon-32.png` | |
| `sms_sender_name` | `LyniaGo` | |
| `skip_welcome_screen` | `true` | R1 is our welcome |
| `disable_login_with_didit` | `true` | D-38 |
| `completion_display_mode` | the option that returns straight to the app without showing a result | F1–F8 are our result pages |
| `privacy_policy_url` | our privacy policy URL | |
| Workflow `is_white_label_enabled` | `true` on the workflow the API launches | Check first whether Didit bills extra for it |

## How to apply

- **The Didit connector** can set only the three logos and `sms_sender_name` (`didit_branding_update`), and the
  workflow's `is_white_label_enabled` (`didit_workflow_update`).
- **Everything else** (colours, radii, welcome screen, Login with Didit, completion mode, privacy URL) is in the
  Didit Business Console → the application → Settings → Branding / White label.

Do it in this order:

1. Apply everything above to **LyniaGo (Sandbox)** first.
2. Run one sandbox check on a phone through the in-app sheet. Confirm:
   - green buttons;
   - the LyniaGo logo;
   - no Didit welcome page;
   - no "Login with Didit";
   - on finishing, the sheet closes straight to F8 / R2.
3. Apply the same settings to the live app.

A write to the live app changes what real riders see on their next check.

Each change is a write to an outside service, so it needs the owner's explicit go-ahead.
