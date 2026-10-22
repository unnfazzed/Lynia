"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";
import { BANNER_MAX_BYTES, compressImage, SHOP_FRONT_PHOTO } from "../lib/image-compress";
import { REASONS } from "../lib/reasons";
import { saveMerchantShopFront, type ShopFrontChanges } from "./actions";

type PhotoKind = keyof typeof SHOP_FRONT_PHOTO;
type Picked = { blob: Blob; previewUrl: string };

const PHOTO_LABEL: Record<PhotoKind, string> = { logo: "Logo", cover: "Cover photo" };
const PRICE_LEVELS = [
  { value: "", label: "Not set" },
  { value: "1", label: "$" },
  { value: "2", label: "$$" },
  { value: "3", label: "$$$" },
];

const parseTags = (text: string): string[] =>
  text
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

/** What the form changes against what the business has now, or the first reason it can't be saved. */
export function shopFrontChanges(
  initial: { name: string; about: string | null; tags: string[]; priceLevel: number | null },
  form: { name: string; about: string; tags: string; priceLevel: string; removeLogo: boolean; removeCover: boolean },
): { changes: ShopFrontChanges; problem: string | null } {
  const name = form.name.trim();
  const about = form.about.trim();
  const tags = parseTags(form.tags);
  const priceLevel = form.priceLevel ? Number(form.priceLevel) : null;
  const changes: ShopFrontChanges = {};
  if (name !== initial.name) changes.name = name;
  if (about !== (initial.about ?? "")) changes.description = about;
  if (tags.join("\n") !== initial.tags.join("\n")) changes.cuisineTags = tags;
  if (priceLevel !== initial.priceLevel) changes.priceLevel = priceLevel;
  if (form.removeLogo) changes.removeLogo = true;
  if (form.removeCover) changes.removeCover = true;
  let problem: string | null = null;
  if (!name) problem = "The name can't be empty.";
  else if (name.length > 120) problem = "The name is longer than 120 characters.";
  else if (about.length > 500) problem = "The about is longer than 500 characters.";
  else if (tags.length > 3) problem = "Use at most 3 tags.";
  else if (tags.some((t) => t.length > 24)) problem = "Each tag is at most 24 characters.";
  // As on the merchant web (lib/shop-front.ts addTag): a duplicate, case and spaces ignored, is refused.
  else if (new Set(tags.map((t) => t.toLowerCase().replace(/\s+/g, ""))).size < tags.length) problem = "A tag is listed twice.";
  return { changes, problem };
}

/**
 * Admin assist: ops change a business's shop front on its behalf — name, about, tags, price level, logo and
 * cover — from the Shop front card. A picked photo is compressed here (the owner's 250 KB banner budget) and
 * uploaded by the server action; the save goes through the reason-coded ConfirmModal and the endpoint writes
 * the audit row with the change. Built from the kit's own primitives (D-106).
 */
export function ShopFrontEditor({
  merchantId,
  name,
  about,
  tags,
  priceLevel,
  hasLogo,
  hasCover,
  shop,
  connected,
}: {
  merchantId: string;
  name: string;
  about: string | null;
  tags: string[];
  priceLevel: number | null;
  hasLogo: boolean;
  hasCover: boolean;
  shop: boolean;
  connected: boolean;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name, about: about ?? "", tags: tags.join(", "), priceLevel: priceLevel ? String(priceLevel) : "", removeLogo: false, removeCover: false });
  const [photos, setPhotos] = useState<Partial<Record<PhotoKind, Picked>>>({});
  const [preparing, setPreparing] = useState<PhotoKind | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Every preview's object URL, freed when the editor goes away (a replaced one is freed in `pick`).
  const previewUrls = useRef(new Set<string>());
  useEffect(() => {
    const urls = previewUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function reset() {
    setForm({ name, about: about ?? "", tags: tags.join(", "), priceLevel: priceLevel ? String(priceLevel) : "", removeLogo: false, removeCover: false });
    setPhotos({});
    setPhotoError(null);
  }

  async function pick(kind: PhotoKind, file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPreparing(kind);
    try {
      const blob = await compressImage(file, { ...SHOP_FRONT_PHOTO[kind], maxBytes: BANNER_MAX_BYTES });
      const previewUrl = URL.createObjectURL(blob);
      previewUrls.current.add(previewUrl);
      setPhotos((prev) => {
        const replaced = prev[kind]?.previewUrl;
        if (replaced) {
          URL.revokeObjectURL(replaced);
          previewUrls.current.delete(replaced);
        }
        return { ...prev, [kind]: { blob, previewUrl } };
      });
      setForm((f) => ({ ...f, [kind === "logo" ? "removeLogo" : "removeCover"]: false }));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Couldn't prepare the photo.");
    } finally {
      setPreparing(null);
    }
  }

  if (!open) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-md)" }}>
        <button
          type="button"
          className="btn ghost"
          disabled={!connected}
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          Edit shop front
        </button>
      </div>
    );
  }

  const { changes, problem } = shopFrontChanges({ name, about, tags, priceLevel }, form);
  const newPhotos = (Object.keys(photos) as PhotoKind[]).filter((k) => photos[k]);
  const dirty = Object.keys(changes).length > 0 || newPhotos.length > 0;
  const summary = [
    changes.name !== undefined ? "name" : null,
    changes.description !== undefined ? "about" : null,
    changes.cuisineTags !== undefined ? (shop ? "tags" : "cuisine") : null,
    changes.priceLevel !== undefined ? "price level" : null,
    photos.logo ? "logo" : changes.removeLogo ? "logo (removed)" : null,
    photos.cover ? "cover photo" : changes.removeCover ? "cover photo (removed)" : null,
  ].filter(Boolean);

  const field = (id: string, label: string, input: ReactNode, hint?: string) => (
    <div>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {input}
      {hint ? (
        <div className="mut" style={{ fontSize: 12, marginTop: "var(--space-xs)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );

  const photoField = (kind: PhotoKind, has: boolean) => {
    const removeKey = kind === "logo" ? "removeLogo" : "removeCover";
    const picked = photos[kind];
    return field(
      `${ids}-${kind}`,
      PHOTO_LABEL[kind],
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", flexWrap: "wrap" }}>
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview (object URL)
          <img
            src={picked.previewUrl}
            alt={`New ${PHOTO_LABEL[kind].toLowerCase()}`}
            style={kind === "logo" ? { width: 48, height: 48, borderRadius: "50%", objectFit: "cover" } : { width: 144, aspectRatio: "3 / 1", objectFit: "cover", borderRadius: "var(--radius-input)" }}
          />
        ) : null}
        <input id={`${ids}-${kind}`} type="file" accept="image/jpeg,image/png" disabled={preparing !== null} onChange={(e) => void pick(kind, e.target.files?.[0])} />
        {has && !picked ? (
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-xs)", fontSize: 12 }}>
            <input type="checkbox" checked={form[removeKey]} onChange={(e) => setForm((f) => ({ ...f, [removeKey]: e.target.checked }))} />
            Remove {PHOTO_LABEL[kind].toLowerCase()}
          </label>
        ) : null}
        {preparing === kind ? <span className="mut" style={{ fontSize: 12 }}>Preparing…</span> : null}
      </div>,
      kind === "logo" ? "Square. Compressed to fit 250 KB." : "Wide (3:1), cropped to the centre. Compressed to fit 250 KB.",
    );
  };

  return (
    <div aria-label="Edit shop front" role="group" style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)", marginBottom: "var(--space-lg)", paddingBottom: "var(--space-lg)", borderBottom: "1px solid var(--line)" }}>
      {field(`${ids}-name`, "Name", <input id={`${ids}-name`} className="field-input" style={{ width: "100%" }} value={form.name} maxLength={120} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />)}
      {field(
        `${ids}-about`,
        "About",
        <textarea id={`${ids}-about`} className="field-input" style={{ width: "100%", minHeight: 72 }} value={form.about} maxLength={500} onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))} />,
        `${form.about.trim().length}/500`,
      )}
      {field(
        `${ids}-tags`,
        shop ? "Tags" : "Cuisine",
        <input id={`${ids}-tags`} className="field-input" style={{ width: "100%" }} value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />,
        "Up to 3, separated by commas.",
      )}
      {field(
        `${ids}-price`,
        "Price level",
        <select id={`${ids}-price`} className="field-input" value={form.priceLevel} onChange={(e) => setForm((f) => ({ ...f, priceLevel: e.target.value }))}>
          {PRICE_LEVELS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>,
      )}
      {photoField("logo", hasLogo)}
      {photoField("cover", hasCover)}

      {problem || photoError ? (
        <div role="alert" style={{ background: "var(--danger-wash)", color: "var(--danger)", borderRadius: 12, padding: "8px 12px", fontSize: 12 }}>
          {photoError ?? problem}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "var(--space-sm)", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn quiet"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
        <ConfirmModal
          action="merchant.shop_front"
          auditInEndpoint
          target={merchantId}
          path={`/merchants/${merchantId}`}
          triggerLabel="Save changes…"
          triggerVariant="solid"
          disabled={!connected || !dirty || !!problem || preparing !== null}
          title={`Change ${name}'s shop front?`}
          consequence={`Customers will see the new ${summary.join(", ")} straight away. The owner sees it in the merchant app too.`}
          reasons={REASONS.merchantShopFront}
          notePlaceholder="Who asked? (optional)"
          confirmLabel="Save"
          onConfirm={async (r) => {
            const fd = new FormData();
            for (const k of newPhotos) fd.append(k, new File([photos[k]!.blob], `${k}.jpg`, { type: "image/jpeg" }));
            const res = await saveMerchantShopFront(merchantId, changes, fd, r.reasonCode, r.note);
            if (!res.ok) throw new Error(res.message);
            setPhotos({});
            setOpen(false);
          }}
        />
      </div>
    </div>
  );
}
