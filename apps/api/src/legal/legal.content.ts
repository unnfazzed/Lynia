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
 * STRUCTURE. The shape follows what a marketplace notice has to do that a single-sided app's does
 * not: state plainly that there are THREE kinds of user (customer, rider, restaurant partner) whose
 * data differs, and be explicit about what each one can see of the others. Chowdeck's Nigerian
 * food-delivery notice was read as a reference for the marketplace-specific sections it gets right —
 * vendor disclosure, order data, location-based matching. Where it is weaker we deliberately differ:
 *   • It applies a single blanket "7 years after last active use" retention to everything. We publish
 *     the real per-category schedule, because ours is code-enforced and a blanket window is neither
 *     data minimisation nor true of this system.
 *   • It bundles direct-marketing consent into signup. We run no marketing, so we say so instead.
 *   • It answers data-subject requests "as soon as possible". We commit to the CDPA's 30 days.
 *   • It requires location services to be on to use the platform. Our customers can type an address,
 *     so claiming otherwise would be false.
 *
 * ZIMBABWEAN LAW. Lynia is a data controller under the **Cyber and Data Protection Act, 2021**
 * ("CDPA"), enforced by POTRAZ. The Act shapes this notice in five concrete ways, each reflected
 * below: a lawful basis is stated per data category; national-ID and facial images are treated as
 * sensitive data requiring explicit consent; data subjects are told they may complain to POTRAZ; the
 * transfer of data outside Zimbabwe is disclosed (see CROSS_BORDER); and the breach-notification duty
 * is acknowledged. The Act's 2024 Licensing regulations additionally place duties on Lynia itself —
 * controller registration with POTRAZ and appointment of a Data Protection Officer — which are
 * founder actions, tracked in `docs/PLAY-STORE-SUBMISSION.md` §7.3, not code.
 *
 * FOUNDER RATIFICATION. This is an accurate engineering description of the system's data handling,
 * written to satisfy Play policy and the CDPA. It is NOT a substitute for counsel review of the
 * corporate identity, the controller's registered address, the DPO designation, and the POTRAZ
 * filings. Ratify before the production listing goes live.
 */

/** Stamped on both pages. Bump when the copy materially changes (Play re-reviews on listing update). */
export const LEGAL_LAST_UPDATED = "29 July 2026";

/**
 * Contact for privacy requests. Deliberately the SAME inbox the app already routes support to
 * (`SUPPORT_URL` in apps/mobile/src/config.ts) rather than a freshly-invented `privacy@` alias — an
 * unmonitored contact address on a published policy is worse than none, and Play/CDPA both require a
 * channel that actually answers. Replace with the registered DPO contact once one is designated.
 */
export const LEGAL_CONTACT_EMAIL = "support@lyniafinance.com";

/** Android application id — the identifier Play, and therefore the deletion page, refers to. */
export const ANDROID_PACKAGE = "zw.co.lynia";

/**
 * Where personal data physically sits. `infra/terraform/variables.tf` pins the primary region to
 * **africa-south1 (Johannesburg)** — the lowest-latency GCP region to Harare — which means every
 * database row, storage object and backup lives in **South Africa, outside Zimbabwe**.
 *
 * That makes ordinary operation a continuous cross-border transfer under the CDPA, which permits it
 * only where the destination affords adequate protection or another ground (such as the data
 * subject's consent, or necessity for a contract they are party to) applies, and requires POTRAZ to
 * be notified. Disclosing it is the part this file can do; establishing the ground and making the
 * filing is a founder action (docs/PLAY-STORE-SUBMISSION.md §7.3). Hiding it would be the one thing
 * guaranteed to be wrong — a notice that implies local-only storage while the database runs in
 * Johannesburg is a misrepresentation to every user and to the regulator.
 */
export const HOSTING_COUNTRY = "South Africa";
export const HOSTING_REGION = "africa-south1 (Johannesburg)";

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
  /**
   * The CDPA lawful basis relied on. Sensitive data (national ID, facial images) needs the data
   * subject's explicit consent; most of the rest is necessary to perform the delivery contract the
   * user themselves initiated. Stating this per category is what the Act asks for and what a bare
   * "we collect X for Y" notice omits.
   */
  readonly basis: string;
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
      "To create and secure your account, sign you in by one-time code, and let the other party to an order identify who they are meeting.",
    basis: "Performance of your contract with us; your consent for the optional email address.",
    retention: "Kept for the life of your account; anonymised when you delete it.",
    manifestKeys: ["first_name", "last_name", "email", "phone"],
  },
  {
    label: "Government ID and vehicle details (riders only)",
    collected:
      "Your national ID number, a photo of your ID and of your face, and your motorbike's registration and vehicle details — collected only if you register as a rider.",
    purpose:
      "Identity verification (KYC) — a legal and safety requirement before anyone may carry another person's parcel or food — the signal used to stop a banned rider re-registering, and the vehicle record shown to the customer whose order you are carrying.",
    basis:
      "Your explicit consent, given when you start rider verification. Your national ID number and the photograph of your face are SENSITIVE personal information under the Cyber and Data Protection Act, so we ask for them only for verification and never use them for anything else. You can withdraw consent by deleting your rider account.",
    retention:
      "The ID number is encrypted at rest and cleared when you delete your account, along with your vehicle details. ID and face images are held for the legal minimum after a rider account goes inactive or is rejected, then deleted automatically.",
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
      "Your device's GPS position: the pickup and drop-off points you set, your saved addresses, and — for riders only, while an order is in progress — a live position trail. Rider location continues to update while the app is in the background so the customer can follow the delivery; this is shown by a persistent Android notification and stops when the delivery ends or you go offline.",
    purpose:
      "To match an order to nearby riders, show you restaurants near you, show the customer where their order is, price a trip by distance, and support safety and dispute investigations.",
    basis:
      "Performance of your contract with us — a delivery cannot be matched, priced or tracked without it. As a customer you may type an address instead of sharing GPS.",
    retention:
      "Coordinates on delivery events and SOS alerts are erased 90 days after the event. A rider's live position is cleared as soon as they go offline or delete their account. Saved addresses are deleted with your account.",
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
    label: "Food and shop orders",
    collected:
      "What you ordered from a restaurant or shop, any note you attached to a dish, and — if you tell us you paid the restaurant by another method — the mobile-money transaction reference you enter.",
    purpose:
      "To send your order to the restaurant's kitchen board, let them prepare it correctly, let them confirm they were paid, and resolve disputes about what was ordered or paid.",
    basis: "Performance of your contract with us and with the restaurant you ordered from.",
    retention:
      "Order contents are retained as a financial and dispute record. Your per-dish notes and the mobile-money reference are scrubbed when you delete your account — the reference is a handle into your own mobile-money history, so it is removed rather than kept.",
    manifestKeys: ["merchant_order_item_note", "merchant_payment_reference"],
  },
  {
    label: "Photos",
    collected:
      "Photos you choose to attach — an item photo on a delivery request, a pickup or proof-of-delivery photo, and a rider profile photo.",
    purpose: "To describe the parcel, evidence hand-over, and resolve disputes about what was delivered.",
    basis: "Performance of your contract with us; you choose whether to attach one.",
    retention: "Held for the life of the order; the stored images are deleted when you delete your account.",
    manifestKeys: ["item_photo_url", "pickup_photo_key", "delivery_proof_key"],
  },
  {
    label: "App activity and order history",
    collected:
      "Your orders, prices offered and accepted, ratings and free-text comments, support issues and reports you file.",
    purpose:
      "To run the marketplace, show your history, calculate earnings, and keep a record for disputes, fraud investigation and financial compliance.",
    basis:
      "Performance of your contract with us; our legitimate interest in preventing fraud and abuse; and our legal obligation to keep financial records.",
    retention:
      "Order, rating and audit records are retained as a financial and dispute record. Free text you wrote (rating comments, cancellation reasons, order notes, issue descriptions, reports) is scrubbed when you delete your account, and the records that remain no longer identify you.",
    manifestKeys: ["comment", "cancel_reason", "description", "report_note", "note"],
  },
  {
    label: "Financial information",
    collected:
      "For riders: the mobile-money number used to top up the prepaid commission wallet, and that wallet's transaction ledger. Lynia never takes payment for the goods being delivered — customers pay riders, or restaurants, directly.",
    purpose: "To credit wallet top-ups and charge the per-delivery commission.",
    basis:
      "Performance of your contract with us, and our legal obligation to keep accurate financial records.",
    retention:
      "The ledger is retained as a financial record; the stored mobile-money number is cleared when you delete your account.",
    // `phone` also covers profiles.phone (the contact category above) — the manifest entry is the
    // single record for a column that lives in BOTH tables, so both categories legitimately claim it.
    manifestKeys: ["phone"],
  },
  {
    label: "Device identifiers and diagnostics",
    collected:
      "A push-notification token for your device, your sign-in sessions, and crash/performance diagnostics (which may include the app version, device model and OS version).",
    purpose:
      "To deliver notifications about your orders, keep you signed in securely, and detect and fix crashes and slow screens.",
    basis:
      "Performance of your contract with us for notifications and sessions; our legitimate interest in a working, secure app for diagnostics.",
    retention:
      "The push token and your sessions are deleted when you sign out or delete your account. Diagnostic records are held by our processors on their standard retention schedules.",
    manifestKeys: ["device_token_store", "session_store"],
  },
];

/** Third parties data reaches, and why. Declared here because Play's Data safety form asks about sharing. */
const SHARING: readonly { readonly who: string; readonly what: string }[] = [
  {
    who: "The other party to your order",
    what:
      "A customer sees the assigned rider's first name, photo, rating and live position; a rider sees the customer's first name, the pickup and drop-off points, and the contact number for that order. Neither sees your ID document or your account history.",
  },
  {
    who: "The restaurant or shop you ordered from",
    what:
      "A restaurant sees what you ordered, any note you attached to a dish, the delivery point, and — if you submitted one — your payment reference so they can confirm they were paid. They do not see your national ID, your saved addresses, your other orders, or your order history with any other shop.",
  },
  {
    who: "Google (Firebase Cloud Messaging, Google Maps, Google Cloud)",
    what:
      "Push notifications are delivered via Firebase; maps and address search are rendered by Google Maps Platform; the service, its database and its backups run on Google Cloud.",
  },
  {
    who: "Our identity-verification provider",
    what: "Rider ID documents and face photos are checked against the document by a KYC provider.",
  },
  {
    who: "Our diagnostics providers (Sentry, PostHog)",
    what: "Crash reports and anonymised product-usage events, used only to fix and improve the app.",
  },
  {
    who: "Law enforcement and regulators",
    what:
      "Only where we are legally required to disclose, or where disclosure is necessary to investigate a safety incident, fraud, or a crime involving an order.",
  },
];

/** We do not sell data or run ads — stated explicitly because Play's form asks and users assume otherwise. */
const NOT_DONE: readonly string[] = [
  "We do not sell or rent your personal data.",
  "We do not share your data with advertisers or data brokers, or for advertising or marketing by others.",
  "We do not track you across other companies' apps or websites.",
  "We do not send you marketing messages. The messages we send are about your own orders.",
  "We do not collect background location beyond the order you are actively delivering as a rider.",
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
      <td>${escapeHtml(c.basis)}</td>
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

<p>LyniaGo is an on-demand marketplace in Zimbabwe. You can <strong>send a parcel</strong> across town
by motorbike — naming your own price, with nearby riders accepting or countering and you choosing who
carries it — and you can <strong>order food from a restaurant</strong> and have a rider bring it to
you. This notice explains what personal data we collect to run that service, why, how long we keep
it, and how you can get it deleted.</p>

<p>It applies to the LyniaGo Android app (<code>${ANDROID_PACKAGE}</code>) and the Lynia service behind
it. Lynia is the <strong>data controller</strong> for the purposes of Zimbabwe's <strong>Cyber and Data
Protection Act, 2021</strong> ("the Act"), which is enforced by the Postal and Telecommunications
Regulatory Authority of Zimbabwe (POTRAZ).</p>

<div class="note">
  <strong>The short version.</strong> We collect what an order needs — who you are, where it is going,
  and where the rider is while carrying it — and nothing to sell on. We do not process payment for
  your goods or your food: you pay the rider or the restaurant directly. Our servers are in
  ${HOSTING_COUNTRY}. You can delete your account and its personal data from inside the app at any
  time: <strong>Account → Settings → Delete account</strong>.
</div>

<h2>1. Which kind of user you are</h2>
<p>Three different people use LyniaGo, and we hold different data about each. Read the row that
applies to you — one person can be more than one.</p>
<ul>
  <li><strong>Customers</strong> send parcels and order food. We hold your name, phone number, the
  points you set, your orders, and any photos or notes you attach.</li>
  <li><strong>Riders</strong> carry those orders. In addition to the above we hold your identity
  documents, your vehicle details, your live position while you are on an order, and your commission
  wallet.</li>
  <li><strong>Restaurant and shop partners</strong> sell through LyniaGo. What we hold about a shop —
  its name, menu, hours, cover photo, location — is <em>business</em> information, not personal data.
  The personal data we hold about the owner is their account: name, phone number, sign-in. Where a
  shop's own phone number is shown to customers it is masked.</li>
</ul>

<h2>2. What we collect, why, and on what legal basis</h2>
<p>The Act requires us to have a lawful basis for each use of your data, so we state it per category
rather than in the abstract.</p>
<div class="wrap">
<table>
  <thead>
    <tr>
      <th scope="col">Category</th><th scope="col">What</th><th scope="col">Why</th>
      <th scope="col">Legal basis</th><th scope="col">How long</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</div>

<h3>Location, specifically</h3>
<p>Location is the most sensitive thing we handle routinely, so it is worth being precise:</p>
<ul>
  <li><strong>As a customer</strong>, we use your location only to help you set pickup and drop-off
  points and to show you nearby restaurants, and only while the app is open. You can type an address
  instead — location is not required to use LyniaGo.</li>
  <li><strong>As a rider</strong>, we use your location to show you nearby orders while you are
  online, and to stream your position to the customer <em>while you are carrying their order</em>.
  That streaming continues when the app is in the background — otherwise the customer loses the rider
  the moment they switch to their maps app for directions — and Android shows a persistent
  notification the whole time it is happening. It stops when the order completes or you go offline.</li>
  <li>We never request Android's "all the time" background location permission, and we do not collect
  your location when you are offline or not on an order.</li>
  <li>Position trails attached to order events and SOS alerts are automatically erased 90 days after
  the event.</li>
</ul>

<h3>Food orders, specifically</h3>
<p>When you order from a restaurant, the restaurant needs enough to cook and hand over your order,
and no more. Their kitchen board shows the dishes, your per-dish notes, and the delivery point. If
you use "I paid another way" and enter a mobile-money reference, the restaurant sees that reference
so they can match it against their own statement. They never see your national ID, your saved
addresses, or any order you placed with anyone else.</p>
<p><strong>We are not the payment processor.</strong> Money for your food, and money for the goods in
a parcel, moves directly between you and the restaurant or the rider. Lynia's only charge is a
commission it takes from riders through their prepaid wallet.</p>

<h2>3. Who your data is shared with</h2>
<ul>
${sharing}
</ul>

<h2>4. Where your data is stored, and transfers outside Zimbabwe</h2>
<p>LyniaGo runs on Google Cloud in the <strong>${HOSTING_REGION}</strong> region. That means your
personal data — the database, uploaded images, and backups — is stored in
<strong>${HOSTING_COUNTRY}</strong>, not in Zimbabwe. We use that region because it is the closest
to Harare, which makes the app faster and cheaper to use on a mobile connection.</p>
<p>Some of our providers (for push notifications, crash reporting and analytics) also process data
outside Zimbabwe. This is a <strong>cross-border transfer of personal data</strong> under the Act. It
is necessary to provide the service you asked us for, our providers are bound by contract to protect
your data and to process it only on our instructions, and everything is encrypted in transit. If you
would rather your data were not transferred, you cannot use LyniaGo — we have no local-only mode, and
we would rather say so than imply otherwise.</p>

<h2>5. What we never do</h2>
<ul>
${notDone}
</ul>

<h2>6. How your data is protected</h2>
<ul>
  <li>All traffic between the app and our service is encrypted in transit (HTTPS/TLS).</li>
  <li>National ID numbers are encrypted at rest; a one-way hash is used for duplicate detection so the
  raw number never has to be read back for that check.</li>
  <li>ID and face images are held in private storage that is never publicly readable; access is
  granted per request, for a short window, to the person who needs it.</li>
  <li>Access to personal data by our staff is role-restricted and written to an audit log.</li>
  <li>If a breach puts your personal data at risk, we are required to notify POTRAZ promptly — within
  24 hours of becoming aware of it — and we will tell you where the breach is likely to affect you.</li>
</ul>

<h2>7. Your rights</h2>
<p>Under the Act you have the right to:</p>
<ul>
  <li>be <strong>informed</strong> about how your personal data is used — that is what this notice is for;</li>
  <li><strong>access</strong> the personal data we hold about you;</li>
  <li><strong>correct</strong> it where it is inaccurate or misleading;</li>
  <li><strong>object to</strong> a particular use of it;</li>
  <li>have it <strong>deleted</strong> — see <a href="/legal/account-deletion">Delete your account and
  data</a>. You can do this yourself in the app; you do not need to ask us;</li>
  <li><strong>withdraw consent</strong> where we relied on it (for example rider ID verification), at
  any time and as easily as you gave it.</li>
</ul>
<p>Write to <a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> to exercise any of
these. We answer within <strong>30 days</strong>. We may ask you to confirm your identity first, so
that nobody else can obtain or delete your data by pretending to be you.</p>
<p>If you are not satisfied with how we handle your request, you may complain to <strong>POTRAZ</strong>,
Zimbabwe's data protection authority.</p>

<h2>8. Children</h2>
<p>LyniaGo is not intended for anyone under 18, and riders must pass identity verification. We do not
knowingly collect data from children. If you believe a child has created an account, contact us and we
will remove it.</p>

<h2>9. Changes to this notice</h2>
<p>If we change what we collect or why, we update this page and change the date at the top. Material
changes are announced in the app before they take effect.</p>

<h2>10. Contact and governing law</h2>
<p>Questions, complaints, or a data request:
<a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a>.</p>
<p>This notice is governed by the laws of Zimbabwe, and in particular the Cyber and Data Protection
Act, 2021.</p>`,
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
(<code>${ANDROID_PACKAGE}</code>) and what happens to your data when you do. It applies whether you
use LyniaGo to send parcels, to order food, to ride, or all three.</p>

<h2>Option 1 — delete it yourself, in the app</h2>
<ol>
  <li>Open LyniaGo and sign in.</li>
  <li>Go to <strong>Account → Settings</strong>.</li>
  <li>Tap <strong>Delete account</strong> and confirm.</li>
</ol>
<p>Deletion happens immediately. You are signed out of every device and cannot sign in again with that
account.</p>

<div class="note">
  <strong>Finish or cancel any live order first.</strong> If you have an order in progress — as the
  customer or the rider — deletion is refused until it is completed or cancelled, so that nobody is
  left stranded mid-delivery.
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
  <li>Your national ID number and any ID or face photographs.</li>
  <li>Your profile photo, saved addresses, and rider vehicle details.</li>
  <li>Your last known position, and the GPS trail on all of your orders.</li>
  <li>Item, pickup and proof-of-delivery photos.</li>
  <li>Free text you wrote — order notes, per-dish notes on food orders, rating comments, cancellation
  reasons, support issue descriptions, reports.</li>
  <li>Any mobile-money references you submitted — the transaction reference for a restaurant payment,
  and the number used to top up a rider commission wallet.</li>
  <li>Your push-notification tokens and all sign-in sessions on every device.</li>
</ul>

<h2>What is kept, and why</h2>
<p>A small amount of data survives deletion because removing it would break records we are required to
keep. None of it identifies you after your profile is anonymised:</p>
<ul>
  <li><strong>Order, rating and wallet records</strong> — retained as a financial, tax and dispute
  record. They point at an anonymised account with no name, number or ID attached.</li>
  <li><strong>The audit log</strong> — retained as a security and compliance record.</li>
  <li><strong>A one-way hash of your national ID</strong> — retained so that someone banned for a safety
  offence cannot simply delete their account and register again. It is a hash, not your ID number: it
  cannot be reversed, and it does not stop <em>you</em> registering again with your own ID.</li>
</ul>

<h2>Retention periods</h2>
<ul>
  <li>Personal data listed under "what is deleted": removed immediately on deletion.</li>
  <li>GPS coordinates on order and SOS events: erased automatically 90 days after the event, whether
  or not you delete your account.</li>
  <li>Rider ID and face images: deleted automatically after the legally required KYC retention period
  once a rider account is inactive or rejected.</li>
  <li>Anonymised financial and audit records: retained for as long as the law requires us to keep them.</li>
</ul>

<h2>Contact</h2>
<p><a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a> · See also our
<a href="/legal/privacy">privacy notice</a>.</p>`,
  );
}
