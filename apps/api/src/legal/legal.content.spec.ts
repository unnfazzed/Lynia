import { describe, expect, it } from "vitest";
import { PII_MANIFEST } from "../privacy/pii-manifest";
import {
  accountDeletionHtml,
  ANDROID_PACKAGE,
  HOSTING_COUNTRY,
  HOSTING_REGION,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DATA_CATEGORIES,
  privacyPolicyHtml,
  termsHtml,
} from "./legal.content";

/**
 * The published privacy notice is a PROMISE about what the system collects. The failure mode this
 * suite exists to stop is the same one `pii-manifest.spec.ts` stops one layer down: someone adds a
 * personal-data column, the manifest test forces them to record its erasure disposition, and the
 * public notice — which now under-declares what we hold — is silently left behind. An under-declared
 * Play Data-safety form is a policy violation that can pull the listing, so the notice is pinned to
 * the manifest in both directions here.
 */
describe("legal copy ↔ PII manifest", () => {
  const declared = new Set(LEGAL_DATA_CATEGORIES.flatMap((c) => c.manifestKeys));

  it("only claims manifest entries that actually exist", () => {
    const unknown = [...declared].filter((key) => !(key in PII_MANIFEST));
    expect(unknown).toEqual([]);
  });

  /**
   * The write-time guard. Adding a PII column to the schema forces a PII_MANIFEST entry; this then
   * forces that entry into a user-facing category, so the notice cannot fall behind the code. If you
   * are here because a new manifest key failed this test: put it in the right category in
   * LEGAL_DATA_CATEGORIES (and check whether the Play Data-safety form in
   * docs/PLAY-STORE-SUBMISSION.md §3 needs the same category ticked).
   */
  it("declares every personal-data entry the manifest tracks", () => {
    const undeclared = Object.keys(PII_MANIFEST).filter((key) => !declared.has(key));
    expect(undeclared).toEqual([]);
  });

  it("gives every category a purpose, a legal basis and a retention window", () => {
    // Play requires purpose + retention per category; the Cyber and Data Protection Act additionally
    // requires a stated lawful basis for each use, which is why `basis` is not optional.
    for (const category of LEGAL_DATA_CATEGORIES) {
      expect(category.purpose.trim().length).toBeGreaterThan(0);
      expect(category.basis.trim().length).toBeGreaterThan(0);
      expect(category.retention.trim().length).toBeGreaterThan(0);
    }
  });

  it("treats the rider's national ID and face photo as sensitive data resting on explicit consent", () => {
    // The Act singles out sensitive personal information (which these are) as needing the data
    // subject's explicit consent — a contract/legitimate-interest basis would not be lawful here, so
    // this category's basis must not silently drift to one.
    const kyc = LEGAL_DATA_CATEGORIES.find((c) => c.manifestKeys.includes("id_number"));
    expect(kyc).toBeDefined();
    expect(kyc!.basis).toMatch(/consent/i);
    expect(kyc!.basis).toMatch(/sensitive/i);
  });
});

describe("privacy notice page", () => {
  const html = privacyPolicyHtml();

  it("renders every declared category", () => {
    for (const category of LEGAL_DATA_CATEGORIES) {
      // The label is HTML-escaped on the way in, so compare against the escaped form.
      expect(html).toContain(category.label.replace(/&/g, "&amp;"));
    }
  });

  it("names the app, the controller's contact, and the deletion route Play checks for", () => {
    expect(html).toContain(ANDROID_PACKAGE);
    expect(html).toContain(LEGAL_CONTACT_EMAIL);
    expect(html).toContain("/legal/account-deletion");
  });

  it("states the background-location disclosure Play's sensitive-permission review looks for", () => {
    // Play rejects foreground-service location without a prominent in-policy disclosure of what is
    // collected in the background and when it stops.
    expect(html).toMatch(/background/i);
    expect(html).toMatch(/persistent (Android )?notification/i);
  });

  it("discloses that data leaves Zimbabwe, naming the hosting country", () => {
    // The single claim most likely to be quietly dropped in a future edit, and the one that would
    // turn this notice into a misrepresentation: the database runs in Azure South Africa North, so
    // ordinary operation is a continuous cross-border transfer under the Act.
    expect(html).toContain(HOSTING_COUNTRY);
    expect(html).toContain(HOSTING_REGION);
    // Pinned literally (C6), so the constants can't drift back to the pre-migration host unnoticed.
    expect(HOSTING_COUNTRY).toBe("South Africa");
    expect(HOSTING_REGION).toBe("South Africa North (Johannesburg)");
    expect(html).toContain("LyniaGo runs on Microsoft Azure in the");
    expect(html).not.toMatch(/Google Cloud|africa-south1/);
    // Google stays named for what it still does: push (FCM) and maps.
    expect(html).toContain("Firebase Cloud Messaging");
    expect(html).toContain("Google Maps");
    expect(html).toMatch(/cross-border/i);
    expect(html).toMatch(/not in Zimbabwe/i);
  });

  it("names POTRAZ as the authority a user can complain to", () => {
    expect(html).toMatch(/POTRAZ/);
    expect(html).toMatch(/complain/i);
  });

  it("tells restaurant customers what the shop does and does not see", () => {
    // The marketplace disclosure a single-sided notice has no need for: a third party (the shop) sees
    // part of the order, and the boundary of that has to be stated, not implied.
    expect(html).toMatch(/restaurant/i);
    expect(html).toMatch(/never see your national ID/i);
  });

  it("does not claim to process payment for goods or food", () => {
    // Getting this wrong would misdescribe the business AND drag the listing into Play's financial-
    // features review (docs/PLAY-STORE-SUBMISSION.md §4.7).
    expect(html).toMatch(/not the payment processor/i);
  });
});

describe("account deletion page", () => {
  const html = accountDeletionHtml();

  it("covers Play's four required elements", () => {
    expect(html).toContain(ANDROID_PACKAGE); // 1. names the app
    expect(html).toMatch(/Account → Settings/); // 2. the in-app route
    expect(html).toContain(LEGAL_CONTACT_EMAIL); // 3. an off-app request channel
    expect(html).toMatch(/What is kept/i); // 4. deleted vs retained
  });

  it("lists the mobile-money references among what is deleted, matching what erasure now does", () => {
    // PrivacyService.eraseAccount scrubs orders.merchantPaymentReference (the restaurant payment
    // handle) alongside top_ups.phone. This page is the public promise of that behaviour; if the
    // scrub is ever removed, the promise here becomes false.
    expect(html).toMatch(/mobile-money references/i);
    expect(html).toMatch(/transaction reference for a restaurant payment/i);
  });
});

describe("every legal page is self-contained", () => {
  /**
   * The routes serve `default-src 'none'; style-src 'unsafe-inline'` — a remote stylesheet, font,
   * script or image would be blocked by that CSP and render a broken policy page to a Play reviewer.
   * Pinned here so nobody "improves" the markup with a CDN reference. Anchors are exempt: `href` on
   * `<a>` is navigation, not a subresource fetch, and `mailto:` links are required by the copy.
   */
  it.each([
    ["privacy", privacyPolicyHtml()],
    ["account-deletion", accountDeletionHtml()],
    ["terms", termsHtml()],
  ])("%s loads no remote subresource", (_name, html) => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<(link|img|iframe|source)\b/i);
    expect(html).not.toMatch(/\bsrc\s*=/i);
    expect(html).not.toMatch(/url\(\s*['"]?https?:/i);
  });

  it.each([
    ["privacy", privacyPolicyHtml()],
    ["account-deletion", accountDeletionHtml()],
    ["terms", termsHtml()],
  ])("%s is a complete, viewport-tagged document", (_name, html) => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('name="viewport"'); // Play reviews on a phone.
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});

describe("contact address on every legal page", () => {
  /**
   * The public contact is on the lyniago.com brand domain (owner decision 2026-09-28). Pinned
   * literally, like the hosting region, so it can't drift back to support@lyniafinance.com unnoticed.
   */
  it.each([
    ["privacy", privacyPolicyHtml()],
    ["account-deletion", accountDeletionHtml()],
    ["terms", termsHtml()],
  ])("%s lists hello@lyniago.com as the contact, and no lyniafinance.com address", (_name, html) => {
    expect(LEGAL_CONTACT_EMAIL).toBe("hello@lyniago.com");
    expect(html).toContain('href="mailto:hello@lyniago.com"');
    expect(html).not.toMatch(/lyniafinance/i);
  });
});

describe("terms page", () => {
  const html = termsHtml();

  it("is one set of terms with a part for each kind of user", () => {
    // Owner instruction 2026-09-30: combined terms for customers, riders and businesses.
    expect(html).toContain('id="customers"');
    expect(html).toContain('id="riders"');
    expect(html).toContain('id="businesses"');
  });

  it("describes LyniaGo as a marketplace that does not take payment for goods, food or parcels", () => {
    // Same fact the privacy notice pins: a terms page that implied we process the payment would
    // misdescribe the business and invite Play's financial-features review.
    expect(html).toMatch(/does not take payment for parcels, food or goods/i);
    expect(html).toMatch(/independent/i);
  });

  it("matches the policy the code enforces", () => {
    expect(html).toContain("US$150"); // declaredValue .max(150) in @lynia/shared contracts
    expect(html).toMatch(/third strike takes you\s+offline for 2 hours/); // RIDER_STRIKE_LIMIT / COOLDOWN
    expect(html).toMatch(/commission is 0% today/i); // COMMISSION.ratePct
  });

  it("links the privacy notice and deletion page, and names Zimbabwean law", () => {
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain('href="/legal/account-deletion"');
    expect(html).toMatch(/laws of Zimbabwe/);
  });

  it("is linked from the shared footer of every legal page", () => {
    for (const page of [privacyPolicyHtml(), accountDeletionHtml(), html]) {
      expect(page).toContain('href="/legal/terms"');
    }
  });
});
