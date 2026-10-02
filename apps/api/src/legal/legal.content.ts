/**
 * Public legal copy (privacy notice + account/data deletion), rendered as self-contained HTML.
 *
 * WHY THIS LIVES IN THE API. Google Play requires two publicly reachable, unauthenticated,
 * non-geofenced URLs before a listing can be reviewed: a **privacy policy** (Play Console → App
 * content → Privacy policy) and an **account/data deletion** page (Play Console → Data safety →
 * Data deletion, mandatory for any app that lets users create an account). Lynia ships no marketing
 * site, so the already-live, CI-deployed API host is the only durable place to serve them from —
 * `https://api.lyniago.com/legal/privacy` and `…/legal/account-deletion`.
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
export const LEGAL_LAST_UPDATED = "29 September 2026";

/** Stamped on the terms page. Bump when the terms materially change, and tell users in the app. */
export const TERMS_LAST_UPDATED = "30 September 2026";

/** The company behind LyniaGo, as the website footer names it. */
export const OPERATOR_NAME = "FortyoneX Studio (Private) Limited";

/** The WhatsApp help line the website and the app route support to. */
export const HELP_WHATSAPP_DISPLAY = "+263 77 883 1938";
export const HELP_WHATSAPP_URL = "https://wa.me/263778831938";

/**
 * Contact for privacy requests. Deliberately the SAME inbox the app already routes support to
 * (`SUPPORT_URL` in apps/mobile/src/config.ts) rather than a freshly-invented `privacy@` alias — an
 * unmonitored contact address on a published policy is worse than none, and Play/CDPA both require a
 * channel that actually answers. Replace with the registered DPO contact once one is designated.
 *
 * On the lyniago.com brand domain by owner decision (2026-09-28): every public contact address is
 * hello@lyniago.com, replacing support@lyniafinance.com.
 */
export const LEGAL_CONTACT_EMAIL = "hello@lyniago.com";

/** Android application id — the identifier Play, and therefore the deletion page, refers to. */
export const ANDROID_PACKAGE = "zw.co.lynia";

/**
 * Where personal data physically sits. The service is hosted on **Microsoft Azure, South Africa North
 * (Johannesburg)** — the lowest-latency Azure region to Harare (docs/plans/2026-09-24-gcp-to-azure-migration.md
 * C6) — which means every database row, storage object and backup lives in **South Africa, outside
 * Zimbabwe**.
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
export const HOSTING_REGION = "South Africa North (Johannesburg)";

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
    label: "Prescriptions (pharmacy orders)",
    collected:
      "When you order a medicine that needs a prescription: photos of the prescription, the patient's name, your agreement to show the original to the rider, and the pharmacist's decision and note.",
    purpose:
      "So the pharmacy's pharmacist can check the prescription before packing the medicine, and the rider can confirm the original at your door.",
    basis:
      "Your explicit consent, given when you add the prescription. A prescription is health information — SENSITIVE personal information under the Cyber and Data Protection Act — so only you, the pharmacy you ordered from and LyniaGo support can open the photos, through links that expire after a few minutes.",
    retention: "Held with the order as a dispute record; the photos, the patient's name and the pharmacist's note are deleted when you delete your account.",
    manifestKeys: ["rx_photo_keys", "rx_patient_name", "rx_decline_note"],
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
    label: "Riders a business calls its own",
    collected:
      "A business on LyniaGo can add a rider's mobile number to its own list of riders, under the name it knows them by. The rider does not have to be on LyniaGo yet.",
    purpose:
      "To offer that business's deliveries to its own riders first — only when they are eligible and nearby — and to show the business whether the number belongs to a LyniaGo rider who can take jobs.",
    basis:
      "Our and the business's legitimate interest in matching a business with riders it already works with. The business sees only whether the number is a LyniaGo rider who can take jobs right now, never why, and sees the rider's LyniaGo name and photo only after they have delivered for it.",
    retention: "Kept until the business removes the number; deleted from every business's list when the rider deletes their LyniaGo account.",
    manifestKeys: ["preferred_rider_store"],
  },
  {
    label: "Working at a business on LyniaGo",
    collected:
      "If a business adds you to its team, the name it gave you, the mobile number it invited, when you joined and when you accepted the merchant terms. An invite you haven't answered is kept for 14 days.",
    purpose:
      "To let you sign in to that business's LyniaGo tablet or phone with your own number and code, and to show the business's owner who is on the team.",
    basis:
      "Performance of your contract with us, which you accept when you join. The owner sees your name and a masked number on the team page, never your orders or your account history.",
    retention:
      "Kept while you are on the team. It is deleted when you leave, when the owner removes you, or when you delete your LyniaGo account; an unanswered invite is deleted when you say Not me or after 14 days.",
    manifestKeys: ["merchant_member_name", "merchant_invite_store", "merchant_invite_name"],
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
    who: "A business that lists you as one of its riders",
    what:
      "Whether your number belongs to a LyniaGo rider who can take jobs right now (never why), and — once you have delivered for that business — your name, photo, how many of its deliveries you have made and your rating from them.",
  },
  {
    who: "The business you work at",
    what:
      "Its owner sees your name, a masked version of your number and when you joined. When you book a rider or act on an order for the business, the business can see it was you.",
  },
  {
    who: "Google (Firebase Cloud Messaging, Google Maps)",
    what: "Push notifications are delivered via Firebase; maps and address search are rendered by Google Maps Platform.",
  },
  {
    who: "Microsoft (Azure)",
    what: "The service, its database and its backups run on Microsoft Azure.",
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
  <p><a href="/legal/terms">Terms &amp; conditions</a> · <a href="/legal/privacy">Privacy notice</a> · <a href="/legal/account-deletion">Delete your account &amp; data</a></p>
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
<p>LyniaGo runs on Microsoft Azure in the <strong>${HOSTING_REGION}</strong> region. That means your
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

/**
 * `GET /legal/terms` — one set of terms for all three kinds of user (customers, riders, businesses).
 *
 * Owner instruction (2026-09-30): *"create a Terms which is combined for both merchants, riders and
 * customers. dont make it sophisticated. learn from the privacy [notice], our business at lyniago.com
 * and chowdeck nigeria."* So: plain words, short sections, one shared part for everyone and one part per
 * kind of user. Chowdeck's terms of use were read for the sections a delivery marketplace needs
 * (orders, taking delivery, restricted activities, liability, termination, governing law); the
 * facts are ours:
 *
 *   • Lynia is a matchmaker, not a carrier, restaurant or payment processor. The customer names the
 *     parcel price and picks a rider (docs/PRICING.md); money for goods, food and delivery moves
 *     directly between the people involved (docs/CONCEPT.md §6).
 *   • Declared value cap US$150 and the prohibited-items list (packages/shared contracts, CONCEPT §3.5).
 *   • Riders: KYC before going online; a rider cancellation is a strike and every third strike takes the
 *     rider offline for 2 hours (order-lifecycle.service.ts); commission comes from a prepaid wallet and
 *     is 0% today (COMMISSION.ratePct), so the terms promise notice before it applies instead of a rate.
 *   • Food cash: the rider collects the food money at the door and returns it to the restaurant, keeping
 *     the delivery fee; not returning it gets the rider suspended (food-debt.service.ts, R-06/R-07).
 *   • A failed food delivery: the food goes back to the restaurant and the rider keeps the delivery fee
 *     (RESTAURANTS-DECISIONS N-11).
 *
 * Like the privacy notice, this is written to be accurate, not by counsel. Have it reviewed before the
 * public production listing.
 */
export function termsHtml(): string {
  return page(
    "Terms and conditions",
    `<h1>LyniaGo terms and conditions</h1>
<p class="meta">Last updated ${TERMS_LAST_UPDATED}</p>

<p>These terms are the agreement between you and LyniaGo when you use the LyniaGo app, the LyniaGo
Merchant app or lyniago.com. LyniaGo is operated by <strong>${OPERATOR_NAME}</strong> in Zimbabwe
("LyniaGo", "we", "us").</p>

<div class="note">
  <strong>The short version.</strong> LyniaGo connects people who need something delivered with
  independent riders, and connects hungry customers with restaurants and shops. We do not carry the
  parcel, cook the food or take your money for it: you agree the price and pay the rider or the business
  directly. Be honest, be safe, be respectful, and pay what you agreed.
</div>

<p>Part A applies to everyone. Then read the part for how you use LyniaGo: <a href="#customers">Part B
for customers</a>, <a href="#riders">Part C for riders</a> and <a href="#businesses">Part D for
businesses</a>. One person can be more than one of these.</p>

<h2>Part A · For everyone</h2>

<h3>1. Accepting these terms</h3>
<p>By creating an account or using LyniaGo you accept these terms and our
<a href="/legal/privacy">privacy notice</a>. If you do not accept them, do not use LyniaGo.</p>

<h3>2. What LyniaGo is</h3>
<p>LyniaGo is a marketplace. We provide the app that lets customers, riders and businesses find each
other, agree a price and follow a delivery. Riders are independent: they are not our employees or agents.
Restaurants and shops sell their own food and goods. The agreement to carry a parcel is between the
customer and the rider, and the sale of food or goods is between the customer and the business.</p>

<h3>3. Your account</h3>
<ul>
  <li>You must be <strong>18 or older</strong> to use LyniaGo.</li>
  <li>You sign in with your mobile number and a one-time code. Keep your phone and your codes to
  yourself: you are responsible for what happens on your account.</li>
  <li>Give us true details and keep them up to date. One person, one account.</li>
  <li>You can delete your account at any time in the app (Account → Settings → Delete account). See
  <a href="/legal/account-deletion">Delete your account &amp; data</a>.</li>
</ul>

<h3>4. Prices and payment</h3>
<ul>
  <li>For parcels, <strong>you set the price</strong>. We show a suggested fare, riders accept it or
  counter, and you choose. The price you choose is the agreed price.</li>
  <li>For food and shop orders, the business sets the item prices and the app shows the delivery fee
  before you order.</li>
  <li><strong>LyniaGo does not take payment for parcels, food or goods.</strong> You pay the rider or
  the business directly, in cash or by mobile money, as the order shows. Pay the agreed amount.</li>
  <li>Any fee LyniaGo charges you is shown in the app before it applies.</li>
</ul>

<h3>5. Rules for everyone</h3>
<p>Do not use LyniaGo to:</p>
<ul>
  <li>break the law, or send, sell or carry anything illegal or dangerous;</li>
  <li>cheat, including fake orders, fake accounts, fake ratings or not paying what you agreed;</li>
  <li>threaten, harass, abuse or discriminate against anyone;</li>
  <li>use someone else's account or number;</li>
  <li>copy, scrape, hack or interfere with the app or its data.</li>
</ul>

<h3>6. Ratings and reports</h3>
<p>After an order, customers and riders rate each other. Ratings must be honest. If something goes wrong,
report it in the app or contact us (section 12). We will look into it and may ask everyone involved
for their side.</p>

<h3>7. Suspending or closing accounts</h3>
<p>We may warn you, limit your account, suspend it or close it if you break these terms, if we suspect
fraud or a safety risk, or if the law requires it. Where it is safe to do so, we will tell you why. If
you think we got it wrong, contact us.</p>

<h3>8. The app</h3>
<p>We work to keep LyniaGo running, but it can be slow or unavailable, for example when the network is
down. We may change, add or remove features. The LyniaGo name, logo and app belong to us; you may use
the app, but not copy or resell it.</p>

<h3>9. Our responsibility</h3>
<ul>
  <li>We are responsible for running the app with reasonable care.</li>
  <li>We are <strong>not</strong> responsible for the quality, safety or legality of food, goods or
  parcels, or for what riders, customers or businesses do or fail to do. The rider is responsible for
  the parcel while carrying it; the business is responsible for its food and goods.</li>
  <li>We are not responsible for losses we could not reasonably foresee, or for lost profits or lost
  business.</li>
  <li>If we are found responsible for a loss, the most we will pay is the total fees you paid LyniaGo in
  the 3 months before the claim.</li>
  <li>Nothing in these terms takes away rights you have under Zimbabwean law that cannot be taken
  away.</li>
</ul>
<p>If you break these terms and it causes us a loss or a claim against us, you are responsible for it.</p>

<h3>10. Your data</h3>
<p>How we collect and use personal data is explained in our <a href="/legal/privacy">privacy notice</a>.</p>

<h3>11. Changes to these terms</h3>
<p>We may update these terms. We change the date at the top when we do, and we tell you in the app
before a big change takes effect. If you keep using LyniaGo after that, you accept the new terms.</p>

<h3>12. Contact, complaints and law</h3>
<p>Help: WhatsApp <a href="${HELP_WHATSAPP_URL}">${HELP_WHATSAPP_DISPLAY}</a>, or email
<a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a>. These terms are governed by the
laws of Zimbabwe, and the courts of Zimbabwe decide any dispute. If part of these terms cannot be
enforced, the rest still applies.</p>

<h2 id="customers">Part B · For customers</h2>

<h3>13. Sending a parcel</h3>
<ul>
  <li>Describe the item honestly, and add a photo if asked. The declared value of a parcel may not be
  more than <strong>US$150</strong>.</li>
  <li><strong>Do not send:</strong> cash, weapons, drugs, prescription medicine, stolen goods, anything
  illegal or dangerous (such as fuel, gas or explosives), live animals, or anything worth more than the
  cap. A rider may refuse or cancel a parcel that breaks these rules.</li>
  <li>Pack it properly, be ready at the pickup point, and make sure someone is at the drop-off point
  to receive it.</li>
  <li>The receiver gives the rider the delivery code. Only share it when the parcel is in your hands
  (or theirs).</li>
</ul>

<h3>14. Ordering food and shop items</h3>
<ul>
  <li>The restaurant or shop prepares your order and is responsible for it, including what is in it.
  If you have an allergy, tell the business in the note before you order.</li>
  <li>Once the business starts preparing your order, you may not be able to cancel it.</li>
  <li>Be at the delivery point and answer your phone. If the rider cannot reach you, or you refuse the
  order at the door without a good reason, the order goes back to the business, the rider keeps the
  delivery fee and you may not get a refund.</li>
  <li>If something is missing or wrong, report it in the app or contact us straight away.</li>
</ul>

<h2 id="riders">Part C · For riders</h2>

<h3>15. Becoming a rider</h3>
<ul>
  <li>You must pass our ID check (your national ID and a selfie) before you can go online.</li>
  <li>You must hold a valid driving licence, and your motorbike must be registered, roadworthy and
  insured as the law requires.</li>
  <li>You are an independent rider. You choose when to go online and which jobs to take. You are
  responsible for your own taxes, fuel, phone and equipment.</li>
</ul>

<h3>16. On the job</h3>
<ul>
  <li>Only accept a job you can do. Collect it, carry it carefully and deliver it to the right person
  with the delivery code. Obey the road rules.</li>
  <li>You are responsible for a parcel or order from pickup until handover.</li>
  <li>Do not open, swap or keep anything you carry. Refuse any item on the list in section 13 and report
  it.</li>
  <li>Cancelling a job after you have been chosen counts as a strike. Every third strike takes you
  offline for 2 hours.</li>
  <li>Your location is shared with the customer while you are on a job, as explained in the
  <a href="/legal/privacy">privacy notice</a>.</li>
</ul>

<h3>17. Money you collect</h3>
<ul>
  <li>The customer pays you the agreed fare directly.</li>
  <li>For a cash food order, you collect the amount the app shows at the door, keep the delivery fee
  and return the rest to the restaurant as the app tells you. <strong>Not returning a business's money
  is theft</strong>: we will suspend your account and may report it.</li>
</ul>

<h3>18. Commission and your wallet</h3>
<p>LyniaGo may charge riders a commission on completed jobs, taken from a prepaid wallet you top up.
<strong>The commission is 0% today.</strong> Before it changes, we will tell you the rate in the app.
When a commission applies, you may not be able to go online while your wallet balance is too low.</p>

<h2 id="businesses">Part D · For businesses</h2>

<h3>19. Your business on LyniaGo</h3>
<ul>
  <li>You must be allowed to run your business and sell what you list. Only list items you can legally
  sell; a pharmacy lists over-the-counter products only.</li>
  <li>Keep your menu or items, prices, photos, opening hours and location accurate. Do not charge
  LyniaGo customers more than the price you listed.</li>
  <li>Food must be safe, prepared hygienically and packed so it travels well.</li>
  <li>Accept or decline orders promptly, and have them ready when the rider arrives.</li>
  <li>You are responsible for your food and goods, and for the people you add to your team. Remove
  anyone who should no longer have access.</li>
</ul>

<h3>20. Payment and riders</h3>
<ul>
  <li>Customers pay you directly, or pay the rider, who returns your money to you. Check the amount and
  confirm it in the app.</li>
  <li>If a rider does not return your money, report it in the app straight away.</li>
  <li>When you book a rider for your own deliveries, you pay the rider the agreed fare.</li>
  <li>Any fee LyniaGo charges your business is shown to you in the app, or agreed in writing, before it
  applies.</li>
</ul>

<p style="margin-top:2.5rem">Questions about these terms? WhatsApp
<a href="${HELP_WHATSAPP_URL}">${HELP_WHATSAPP_DISPLAY}</a> or email
<a href="mailto:${LEGAL_CONTACT_EMAIL}">${LEGAL_CONTACT_EMAIL}</a>.</p>`,
  );
}
