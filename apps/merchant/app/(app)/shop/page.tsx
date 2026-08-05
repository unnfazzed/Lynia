"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantCashRule, MerchantProfileResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { PhotoPicker } from "../../components/menu/PhotoPicker";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle, primaryButtonStyle } from "../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { getMerchantProfile, updateCashRule, updateProfile } from "../../lib/menu-api";

// D-32's own budget for the shop's cover banner/logo (mirrors MAX_BANNER_PHOTO_BYTES in
// apps/api/src/uploads/uploads.controller.ts).
const MAX_BANNER_PHOTO_BYTES = 250 * 1024;

type LoadState = { status: "loading" } | { status: "ready"; profile: MerchantProfileResponse } | { status: "error"; message: string };

// M5·4 "How riders pay you" (packages/design/explorations/restaurants/r-merchant.jsx:816-838): each
// rule states the deal in one line, then the trade-off it carries, in the kit's own words.
const CASH_RULES: { value: MerchantCashRule; title: string; recommended?: boolean; body: string; note: string }[] = [
  {
    value: "collect_and_return",
    title: "Collect and return",
    recommended: true,
    body: "The rider takes the food, collects at the door, and rides your food money back — usually within 30 minutes. Every rider can take your orders, so food leaves faster.",
    note: "The risk is yours for that window: if the cash never returns, the loss is yours and the rider is suspended and named.",
  },
  {
    value: "pay_upfront",
    title: "Pay me upfront",
    body: "The rider hands you the food money before anything leaves the counter. No risk window at all.",
    note: "Only riders carrying enough cash can take the job — pickups can be slower, and big orders sometimes find no rider.",
  },
];

export default function ShopPage() {
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [priceLevel, setPriceLevel] = useState<number | null>(null);
  const [coverKey, setCoverKey] = useState<string | undefined>(undefined);
  const [logoKey, setLogoKey] = useState<string | undefined>(undefined);

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    getMerchantProfile()
      .then((profile) => {
        setState({ status: "ready", profile });
        setName(profile.name);
        setDescription(profile.description ?? "");
        setTags(profile.cuisineTags);
        setPriceLevel(profile.priceLevel);
      })
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your shop profile." });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function addTag() {
    const t = tagDraft.trim();
    if (!t || tags.length >= 3 || tags.includes(t)) return;
    setTags([...tags, t.slice(0, 24)]);
    setTagDraft("");
  }

  async function onSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const profile = await updateProfile({
        name: name.trim(),
        description: description.trim(),
        cuisineTags: tags,
        priceLevel: priceLevel ?? undefined,
        ...(coverKey ? { coverPhotoUrl: coverKey } : {}),
        ...(logoKey ? { logoUrl: logoKey } : {}),
      });
      setState({ status: "ready", profile });
      setCoverKey(undefined);
      setLogoKey(undefined);
      setSavedTick((t) => t + 1);
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onChooseCashRule(value: MerchantCashRule) {
    if (state.status !== "ready" || value === state.profile.cashRule) return;
    setSaving(true);
    try {
      const profile = await updateCashRule({ cashRule: value });
      setState({ status: "ready", profile });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setSaveError(err instanceof ApiError ? err.message : "Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  const disabled = actionsDisabled || saving;

  return (
    <Kitchen active="shop">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, overflow: "auto", height: "100%" }}>
        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your shop profile…</div>}

        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}

        {state.status === "ready" && (
          <>
            <div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Shop profile</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>This is your shop front. Changes go live straight away.</div>
            </div>

            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ ...cardStyle, flex: 1 }}>
                <div style={{ display: "flex", gap: 24 }}>
                  <div style={{ width: 200 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>COVER BANNER · 3:1</div>
                    <PhotoPicker
                      kind="banner"
                      aspect={3}
                      maxBytes={MAX_BANNER_PHOTO_BYTES}
                      currentUrl={state.profile.coverPhotoUrl}
                      disabled={disabled}
                      onUploaded={setCoverKey}
                    />
                  </div>
                  <div style={{ width: 140 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>LOGO · 1:1</div>
                    <PhotoPicker
                      kind="logo"
                      aspect={1}
                      maxBytes={MAX_BANNER_PHOTO_BYTES}
                      currentUrl={state.profile.logoUrl}
                      disabled={disabled}
                      onUploaded={setLogoKey}
                    />
                  </div>
                </div>

                <div style={{ height: 1, background: "var(--line)", margin: "16px 0" }} />

                <label style={labelStyle}>
                  Shop name
                  <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} style={inputStyle} disabled={disabled} />
                </label>
                <label style={labelStyle}>
                  One line customers read
                  <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} style={inputStyle} disabled={disabled} />
                </label>

                <div style={{ display: "flex", gap: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 7 }}>WHAT YOU COOK · up to 3</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                      {tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                            fontWeight: 700,
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: "2px solid var(--accent)",
                            background: "var(--accent-wash)",
                            color: "var(--accent-text)",
                          }}
                        >
                          {t}
                          <button
                            type="button"
                            onClick={() => setTags(tags.filter((x) => x !== t))}
                            disabled={disabled}
                            style={{ border: "none", background: "none", cursor: "pointer", color: "var(--accent-text)", fontWeight: 800 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    {tags.length < 3 && (
                      <input
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === ",") {
                            e.preventDefault();
                            addTag();
                          }
                        }}
                        onBlur={addTag}
                        placeholder="Type a tag, press Enter"
                        style={inputStyle}
                        disabled={disabled}
                      />
                    )}
                  </div>
                  <div style={{ width: 180 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 7 }}>PRICE LEVEL</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[1, 2, 3].map((level) => (
                        <button
                          key={level}
                          type="button"
                          disabled={disabled}
                          onClick={() => setPriceLevel(level)}
                          style={{
                            flex: 1,
                            minHeight: 40,
                            fontSize: 15,
                            fontWeight: 800,
                            borderRadius: 999,
                            border: `2px solid ${priceLevel === level ? "var(--accent)" : "var(--line)"}`,
                            background: priceLevel === level ? "var(--accent-wash)" : "#fff",
                            color: priceLevel === level ? "var(--accent-text)" : "var(--ink)",
                            cursor: "pointer",
                          }}
                        >
                          {"$".repeat(level)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {saveError && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginTop: 12, fontWeight: 700 }}>{saveError}</div>}

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                  <button type="button" disabled={disabled || !name.trim()} onClick={onSave} style={{ ...primaryButtonStyle, opacity: disabled || !name.trim() ? 0.5 : 1 }}>
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                  {savedTick > 0 && !saving && <span style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700 }}>Saved</span>}
                </div>
              </div>

              <div style={{ width: 300, flexShrink: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", marginBottom: 8 }}>WHAT CUSTOMERS SEE</div>
                <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
                  <div style={{ height: 78, background: "var(--surface)", position: "relative" }}>
                    {state.profile.coverPhotoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={state.profile.coverPhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    )}
                  </div>
                  <div style={{ padding: "24px 14px 14px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{name || "Your shop"}</span>
                      {priceLevel != null && <span style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)" }}>{"$".repeat(priceLevel)}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>{description || "One line customers read"}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      {tags.map((t) => (
                        <span key={t} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", borderRadius: 999, padding: "4px 9px" }}>
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>
                  A real photo of your food beats a logo on the banner. Shoot in daylight, no flash — and keep the left
                  edge clear, your logo sits there.
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>How riders pay you</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, marginBottom: 14 }}>
                Applies to every cash order · mobile-money orders are unaffected
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {CASH_RULES.map((rule) => {
                  const on = state.profile.cashRule === rule.value;
                  return (
                    <button
                      key={rule.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => onChooseCashRule(rule.value)}
                      aria-pressed={on}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        padding: "16px 18px",
                        borderRadius: 14,
                        border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                        background: on ? "var(--accent-wash)" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                            background: on ? "var(--accent)" : "#fff",
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 17, fontWeight: 800 }}>{rule.title}</span>
                        {rule.recommended && (
                          <span
                            style={{
                              fontSize: 11.5,
                              fontWeight: 800,
                              letterSpacing: ".04em",
                              color: "var(--accent-text)",
                              // Kit sits this pill on the selected card's accent wash; invert it when
                              // the card itself is white so the pill never disappears into it.
                              background: on ? "var(--bg)" : "var(--accent-wash)",
                              borderRadius: 999,
                              padding: "3px 10px",
                            }}
                          >
                            RECOMMENDED
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 13.5, color: "var(--ink)", marginTop: 8, lineHeight: 1.55 }}>{rule.body}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>{rule.note}</div>
                    </button>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12, padding: "12px 14px", background: "var(--surface)", borderRadius: 12 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  Changes apply from your next order. Riders see your rule on the offer before they accept.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Kitchen>
  );
}

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--muted)",
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  color: "var(--ink)",
  width: "100%",
};
