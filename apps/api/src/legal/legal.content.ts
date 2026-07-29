/**
 * Public legal copy (privacy notice + account/data deletion), rendered as self-contained HTML.
 *
 * WHY THIS LIVES IN THE API. Google Play requires two publicly reachable, unauthenticated,
 * non-geofenced URLs before a listing can be reviewed: a **privacy policy** (Play Console → App
 * content → Privacy policy) and an **account/data deletion** page (Play Console → Data safety →
 * Data deletion, mandatory for any app that lets users create an account). Lynia ships no marketing
 * site, so the already-live, CI-deployed API host is the only durable place to serve them from —
 * `https://lyniago.lyniafinance.com/legal/privacy` and `…/legal/account-deletion`.
 *
 * THE COPY IS DERIVED, NOT INVENTED. Every collection/retention claim below is traceable to what the
 * code actually does — `apps/api/src/privacy/pii-manifest.ts` (the declarative PII inventory whose
 * companion test fails when a new personal-data column appears) and `docs/DATA-RETENTION.md` (the
 * retention windows). If either changes, this copy changes with it: `legal.content.spec.ts` pins the
 * data categories against the manifest so a new PII column can't silently make this notice a lie.
 *
 * FOUNDER RATIFICATION. This is an accurate engineering description of the system's data handling,
 * written to satisfy Play policy and Zimbabwe's Cyber and Data Protection Act (2021). It is NOT a
 * substitute for counsel review of the corporate identity, the controller's registered address, and
 * the CDPA data-protection-officer designation — the three placeholders flagged in
 * `docs/PLAY-STORE-SUBMISSION.md` §7. Ratify before the production listing goes live.
 */

/** Stamped on both pages. Bump when the copy materially changes (Play re-reviews on listing update). */
export const LEGAL_LAST_UPDATED = "29 July 2026";

/**
 * Contact for privacy requests. Deliberately the SAME inbox the app already routes support to
 * (`SUPPORT_URL` in apps/mobile/src/config.ts) rather than a freshly-invented `privacy@` alias — an
 * unmonitored contact address on a published policy is worse than none, and Play/CDPA both require a
 * channel that actually answers.
 */
export const LEGAL_CONTACT_EMAIL = "support@lyniafinance.com";

/** Android application id — the identifier Play, and therefore the deletion page, refers to. */
export const ANDROID_PACKAGE = "zw.co.lynia";

/**
 * The data categories this notice declares, in the same shape as the Play Data safety form.
 *
 * `manifestKeys` cross-references `PII_MANIFEST` ids so the companion test can assert that every
 * declared category still corresponds to real columns, and — more importantly — that the manifest
 * has not grown a personal-data class this notice fails to mention. Keep the two in lockstep.
 */
export interface LegalDataCategory {
  /** Play Data-safety category → the label users see in the notice. */
  readonly label: string;
  /** Plain-language description of what is collected. */
  readonly collected: string;
  /** Why it is collected — Play requires a purpose per category. */
  readonly purpose: string;
  /** Retention window, mirroring docs/DATA-RETENTION.md. */
  readonly retention: string;
  /** Ids in PII_MANIFEST this category covers (empty for categories held outside the DB manifest). */
  readonly manifestKeys: readonly string[];
}

export const LEGAL_DATA_CATEGORIES: readonly LegalDataCategory[] = [
  {
    label: "Name and contact details",
    collected: "Your first and last name, mobile phone number, and (optionally) email address.",
    purpose:
      "To create and secure your account, sign you in by one-time code, and let the other party to a delivery identify who they are meeting.",
    retention: "Kept for the life of your account; anonymised when you delete it.",
    manifestKeys: ["first_name", "last_name", "email", "phone"],
  },
  {
    label: "Government ID and vehicle details (riders only)",
    collected:
      "Your national ID number, a photo of your ID and face, and your motorbike's registration and vehicle details — collected only if you register as a rider.",
    purpose:
      "Identity verification (KYC) — a legal and safety requirement before anyone may carry another person's parcel — the signal used to stop a banned rider re-registering, and the vehicle record shown to a customer whose parcel you are carrying.",
    retention:
      "The ID number is encrypted at rest and cleared when you delete your account, along with your vehicle details. ID/selfie images are held for the legal minimum after a rider account goes inactive or is rejected, then deleted automatically.",
    manifestKeys: [
      "id_number",
      "id_number_hash",
      "photo_url",
      "kyc-object",
      "bike_reg",
      "vehicle_info",
      "kyc_ref",
      "kyc_decline_reason",
      "suspend_reason",
    ],
  },
  {
    label: "Precise location",
    collected:
      "Your device's GPS position: the pickup/drop-off points you set, and — for riders only, while a delivery is in progress — a live position trail. Rider location continues to update while the app is in the background so the customer can follow the delivery; this is shown by a persistent Android notification and stops when the delivery ends or you go offline.",
    purpose:
      "To match a delivery to nearby riders, show the customer where their parcel is, price a trip by distance, and support safety/dispute investigations.",
    retention:
      "Coordinates on delivery events and SOS alerts are erased 90 days after the event; a rider's live position is cleared as soon as they go offline or delete their account.",
    manifestKeys: [
      "lat",
      "lng",
      "sos_lat",
      "sos_lng",
      "current_lat",
      "current_lng",
      "geog",
      "position_updated_at",
      "pickup",
      "dropoff",
      "address_store",
      "delivery_proof_lat",
      "delivery_proof_lng",
      "delivery_proof_at",
    ],
  },
  {
    label: "Photos",
    collected:
      "Photos you choose to attach — an item photo on a delivery request, a pickup or proof-of-delivery photo, and a rider profile photo.",
    purpose: "To describe the parcel, evidence hand-over, and resolve disputes about what was delivered.",
    retention: "Held for the life of the order; the stored images are deleted when you delete your account.",
    manifestKeys: ["item_photo_url", "pickup_photo_key", "delivery_proof_key"],
  },
  {
    label: "App activity and delivery history",
    collected:
      "Your orders, prices offered and accepted, ratings and free-text comments, support issues and reports you file.",
    purpose:
      "To run the marketplace, show your history, calculate earnings, and keep a record for disputes, fraud investigation and financial compliance.",
    retention:
      "Order, rating and audit records are retained as a financial and dispute record. Free text you wrote (ratings, cancellation reasons, issue descriptions, reports) is scrubbed when you delete your account, and the records that remain no longer identify you.",
    manifestKeys: ["comment", "cancel_reason", "description", "report_note", "note", "merchant_order_item_note"],
  },
  {
    label: "Financial information",
    collected:
      "For riders: the mobile-money number used to top up the prepaid commission wallet, and the wallet's transaction ledger. Lynia never takes payment for the goods being delivered — customers pay riders in cash, directly.",
    purpose: "To credit wallet top-ups and charge the per-delivery commission.",
    retention:
      "The ledger is retained as a financial record; the stored mobile-money number is cleared when you delete your account.",
    // `phone` also covers profiles.phone (the contact category above) — the manifest entry is the
    // single record for a column that lives in BOTH tables, so both categories legitimately claim it.
    manifestKeys: ["phone"],
  },
  {
    label: "Device identifiers and diagnostics",
    collected:
      "A push-notification token for your device, and crash/performance diagnostics (which may include the app version, device model and OS version).",
    purpose:
      "To deliver notifications about your deliveries, and to detect and fix crashes and slow screens.",
    retention:
      "The push token is deleted when you sign out or delete your account. Diagnostic records are held by our processors on their standard retention schedules.",
    manifestKeys: ["device_token_store", "session_store"],
  },
];

/** Third parties data reaches, and why. Declared here because Play's Data safety form asks about sharing. */
const SHARING: readonly { readonly who: string; readonly what: string }[] = [
  {
    who: "The other party to your delivery",
    what:
      "A customer sees the assigned rider's first name, photo, rating and live position; a rider sees the customer's first name, the pickup/drop-off points and the contact number for that delivery. Neither sees your ID document or your full account history.",
  },
  {
    who: "Google (Firebase Cloud Messaging, Google Maps, Google Cloud)",
    what:
      "Push notifications are delivered via Firebase; maps and address search are rendered by Google Maps Platform; the service and its database run on Google Cloud in a Google data centre.",
  },
  {
    who: "Our identity-verification provider",
    what: "Rider ID documents and selfies are checked against the document by a KYC provider.",
  },
  {
    who: "Our diagnostics providers (Sentry, PostHog)",
    what: "Crash reports and anonymised product-usage events, used only to fix and improve the app.",
  },
  {
    who: "Law enforcement and regulators",
    what:
      "Only where we are legally required to disclose, or where disclosure is necessary to investigate a safety incident, fraud, or a crime involving a delivery.",
  },
];

/** We do not sell data or run ads — stated explicitly because Play's form asks and users assume otherwise. */
const NOT_DONE: readonly string[] = [
  "We do not sell your personal data.",
  "We do not share your data with advertisers, data brokers, or for advertising or marketing by others.",
  "We do not track you across other companies' apps or websites.",
  "We do not collect background location beyond the delivery you are actively performing as a rider.",
];

/**
 * Minimal, self-contained page shell. No external stylesheet, font, script or image — the route sets a
 * matching `default-src 'none'` CSP, so anything remote would be blocked anyway, and a policy page
 * that depends on a CDN is a policy page that can 404 during Play review.
 */
function page(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — LyniaGo</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0 auto; padding: 2rem 1.25rem 4rem; max-width: 46rem;
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #14181f; background: #fff; overflow-wrap: break-word;
}
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 .35rem; }
h2 { font-size: 1.15rem; margin: 2.25rem 0 .6rem; }
h3 { font-size: 1rem; margin: 1.5rem 0 .35rem; }
.meta { color: #5c6470; font-size: .875rem; margin: 0 0 2rem; }
a { color: #00803a; }
ul { padding-left: 1.25rem; }
li { margin: .35rem 0; }
table { border-collapse: collapse; width: 100%; margin: .75rem 0 1.25rem; font-size: .9375rem; }
th, td { text-align: left; vertical-align: top; padding: .6rem .7rem; border-bottom: 1px solid #e4e7ec; }
th { background: #f6f8fa; font-weight: 600; }
.wrap { overflow-x: auto; }
.note { background: #f6f8fa; border-left: 3px solid #00B14F; padding: .85rem 1rem; margin: 1.25rem 0; }
footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid #e4e7ec; color: #5c6470; font-size: .875rem; }
@media (prefers-color-scheme: dark) {
  body { color: #e6e9ee; background: #14181f; }
  a { color: #4ade8a; }
  th { background: #1c222b; }
  th, td, footer { border-color: #2a313c; }
  .note { background: #1c222b; }
  .meta, footer { color: #9aa3b0; }
}
</style>
</head>
<body>
${bodyHtml}
<footer>
  <p>Lynia (LyniaGo), Zimbabwe · Android package <code>${ANDROID_PACKAGE}</code></p>
  <p><a href="/legal/privacy">Privacy notice</a> · <a href="/legal/account-deletion">Delete your account &amp; data</a></p>
</footer>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `GET /legal/privacy` — the URL entered in Play Console → App content → Privacy policy. */
export function privacyPolicyHtml(): string {
  const rows = LEGAL_DATA_CATEGORIES.map(
    (c) => `<tr>
      <th scope="row">${escapeHtml(c.label)}</th>
      <td>${escapeHtml(c.collected)}</td>
      <td>${escapeHtml(c.purpose)}</td>
      <td>${escapeHtml(c.retention)}</td>
    </tr>`,
  ).join("\n");

  const sharing = SHARING.map(
    (s) => `<li><strong>${escapeHtml(s.who)}.</strong> ${escapeHtml(s.what)}</li>`,
  ).join("\n");

  const notDone = NOT_DONE.map((n) => `<li>${escapeHtml(n)}</li>`).join("\n");

  return page(
    "Privacy notice",
    `<h1>LyniaGo privacy notice</h1>
<p class="meta">Last updated ${LEGAL_LAST_UPDATED}</p>

<p>LyniaGo is an on-demand motorbike courier marketplace operating in Zimbabwe. A customer posts a
parcel to be moved from one point to another and names a price; nearby riders accept or counter; the
customer picks a rider. This notice explains what personal data we collect to run that service, why,
how long we keep it, and how you can get it deleted.</p>

<p>It applies to the LyniaGo Android app (<code>${ANDROID_PACKAGE}</code>) and the Lynia service behind it.
Lynia is the data controller for the purposes of Zimbabwe's <strong>Cyber and Data Protection Act, 2021</strong>.</p>

<div class="note">
  <strong>The short version.</strong> We collect what a delivery needs — who you are, where the parcel
  goes, and where the rider is while carrying it — and nothing to sell on. We do not process payment
  for the goods: customers pay riders in cash, directly. You can delete your account and its personal
  data from inside the app at any time: <strong>Account → Settings → Delete account</strong>.
</div>

<h2>1. What we collect, and why</h2>
<div class="wrap">
<table>
  <thead>
    <tr><th scope="col">Category</th><th scope="col">What</th><th scope="col">Why</th><th scope="col">How long</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>

<h3>Location, specifically</h3>
<p>Location is the most sensitive thing we handle, so it is worth being precise:</p>
<ul>
  <li><strong>As a customer</strong>, we use your location only to help you set the pickup and drop-off
  points, and only while the app is open. You can type an address instead.</li>
  <li><strong>As a rider</strong>, we use your location to show you nearby delivery requests while you
  are online, and to stream your position to the customer <em>while you are carrying their parcel</em>.
  That streaming continues when the app is in the background — otherwise the customer loses the rider
  the moment they switch to their maps app for directions — and Android shows a persistent notification
  the whole time it is happening. It stops when the delivery completes or you go offline.</li>
  <li>We never request Android's "all the time" background location permission, and we do not collect
  your location when you are offline or not on a delivery.</li>
  <li>Position trails attached to delivery events and SOS alerts are automatically erased 90 days after
  the event.</li>
</ul>

<h2>2. Who your data is shared with</h2>
<ul>
${sharing}
</ul>

<h2>3. What we never do</h2>
<ul>
${notDone}
</ul>

<h2>4. How your data is protected</h2>
<ul>
  <li>All traffic between the app and our service is encrypted in transit (HTTPS/TLS).</li>
  <li>National ID numbers are encrypted at rest; a one-way hash is used for duplicate detection so the
  raw number never has to be read back for that check.</li>
  <li>ID and selfie images are held in private storage that is never publicly readable; access is
  granted per request, for a short window, to the person who needs it.</li>
  <li>Access to personal data by our staff is role-restricted and written to an audit log.</li>
</ul>

<h2>5. Your rights</h2>
<p>Under the Cyber and Data Protection Act you may ask us to:</p>
<ul>
  <li><strong>Access</strong> the personal data we hold about you.</li>
  <li><strong>Correct</strong> it if it is wrong.</li>
  <li><strong>Erase</strong> it — see <a href="/legal/account-deletion">Delete your account and data</a>.
  You can do this yourself in the app; you do not need to ask us.</li>
  <li><strong>Object to or restrict</strong> a particular use of it.</li>
</ul>
<p>Write to <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> for any of these. We answer
within 30 days.</p>

<h2>6. Children</h2>
<p>LyniaGo is not intended for anyone under 18, and riders must pass identity verification. We do not
knowingly collect data from children. If you believe a child has created an account, contact us and we
will remove it.</p>

<h2>7. Changes to this notice</h2>
<p>If we change what we collect or why, we update this page and change the date at the top. Material
changes are announced in the app before they take effect.</p>

<h2>8. Contact</h2>
<p>Questions, complaints, or a data request: <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a>.</p>`,
  );
}

/**
 * `GET /legal/account-deletion` — the URL entered in Play Console → Data safety → Data deletion.
 *
 * Play's requirement is specific: the page must be reachable without signing in, must name the app,
 * must explain how to request deletion *and* what is deleted versus retained. It is deliberately a
 * separate page from the privacy notice (Play asks for its own URL) and repeats the in-app route,
 * because a user who has already uninstalled cannot use the in-app path.
 */
export function accountDeletionHtml(): string {
  return page(
    "Delete your account and data",
    `<h1>Delete your LyniaGo account and data</h1>
<p class="meta">Last updated ${LEGAL_LAST_UPDATED}</p>

<p>This page explains how to delete your account for the LyniaGo Android app
(<code>${ANDROID_PACKAGE}</code>) and what happens to your data when you do.</p>

<h2>Option 1 — delete it yourself, in the app</h2>
<ol>
  <li>Open LyniaGo and sign in.</li>
  <li>Go to <strong>Account → Settings</strong>.</li>
  <li>Tap <strong>Delete account</strong> and confirm.</li>
</ol>
<p>Deletion happens immediately. You are signed out of every device and cannot sign in again with that
account.</p>

<div class="note">
  <strong>Finish or cancel any live delivery first.</strong> If you have a delivery in progress — as the
  customer or the rider — deletion is refused until it is completed or cancelled, so that nobody is left
  stranded mid-delivery.
</div>

<h2>Option 2 — ask us to delete it</h2>
<p>If you have already uninstalled the app, or cannot sign in, email
<a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> from the address on your account, or
include the phone number you registered with. We verify the request is genuinely yours and complete it
within 30 days.</p>

<h2>What is deleted</h2>
<ul>
  <li>Your name, email address, and phone number (your number is released so it can be used for a new
  account).</li>
  <li>Your national ID number and any ID or selfie photographs.</li>
  <li>Your profile photo, saved addresses, and rider vehicle details.</li>
  <li>Your last known position, and the GPS trail on all of your deliveries.</li>
  <li>Item, pickup and proof-of-delivery photos.</li>
  <li>Free text you wrote — rating comments, cancellation reasons, support issue descriptions, reports.</li>
  <li>Your push-notification tokens and all sign-in sessions on every device.</li>
</ul>

<h2>What is kept, and why</h2>
<p>A small amount of data survives deletion because removing it would break records we are required to
keep. None of it identifies you after your profile is anonymised:</p>
<ul>
  <li><strong>Delivery, rating and wallet records</strong> — retained as a financial, tax and dispute
  record. They point at an anonymised account with no name, number or ID attached.</li>
  <li><strong>The audit log</strong> — retained as a security and compliance record.</li>
  <li><strong>A one-way hash of your national ID</strong> — retained so that someone banned for a safety
  offence cannot simply delete their account and register again. It is a hash, not your ID number: it
  cannot be reversed, and it does not stop <em>you</em> registering again with your own ID.</li>
</ul>

<h2>Retention periods</h2>
<ul>
  <li>Personal data listed under "what is deleted": removed immediately on deletion.</li>
  <li>GPS coordinates on delivery and SOS events: erased automatically 90 days after the event, whether
  or not you delete your account.</li>
  <li>Rider ID and selfie images: deleted automatically after the legally required KYC retention period
  once a rider account is inactive or rejected.</li>
  <li>Anonymised financial and audit records: retained for as long as the law requires us to keep them.</li>
</ul>

<h2>Contact</h2>
<p><a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> · See also our
<a href="/legal/privacy">privacy notice</a>.</p>`,
  );
}
