"use client";

import { useState } from "react";
import type { MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";
import { formatMoney, parseAmountInput } from "../../lib/money-input";
import { dangerGhostButtonStyle, ghostButtonStyle, primaryButtonStyle } from "../queue/styles";
import { PhotoPicker } from "./PhotoPicker";

// D-32's own budget for a dish photo (mirrors apps/api/src/uploads/uploads.controller.ts's
// MAX_DISH_PHOTO_BYTES — duplicated here since the client compresses to this target before the signed
// URL's own size range enforces it server-side).
const MAX_DISH_PHOTO_BYTES = 300 * 1024;

export interface DishSave {
  name: string;
  description?: string;
  priceUsd: number;
  categoryId: string;
  photoUrl?: string;
}

/** D-31: create or edit a dish. Category is a picker over the merchant's own list, never free text
 *  (mirrors the gallery's M4·2 edit-dish screen). A dish saved without a photo persists as a draft —
 *  visible to the kitchen, invisible to customers — surfaced here as a plain notice, not an error. */
export function DishEditorSheet({
  dish,
  categories,
  defaultCategoryId,
  disabled,
  submitting,
  error,
  onSave,
  onDelete,
  onCancel,
}: {
  dish: MerchantDishResponse | null;
  categories: MerchantCategoryResponse[];
  defaultCategoryId?: string;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSave: (body: DishSave) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(dish?.name ?? "");
  const [description, setDescription] = useState(dish?.description ?? "");
  const [priceText, setPriceText] = useState(dish ? formatMoney(dish.priceUsd) : "");
  const [categoryId, setCategoryId] = useState(dish?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "");
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(dish?.photoUrl ?? null);

  const price = parseAmountInput(priceText);
  const canSave = name.trim().length > 0 && price != null && !!categoryId && !disabled && !submitting;
  const isDraft = dish?.isDraft ?? (!photoKey && !dish?.photoUrl);

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{dish ? "Edit dish" : "Add a dish"}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          Changes apply to new orders only — never to an order already placed.
        </div>

        <div style={{ display: "flex", gap: 18 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={inputStyle} disabled={disabled || submitting} />
            </label>
            <label style={labelStyle}>
              Description
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                style={inputStyle}
                disabled={disabled || submitting}
              />
            </label>
            <label style={{ ...labelStyle, width: 140 }}>
              Price (USD)
              <input value={priceText} onChange={(e) => setPriceText(e.target.value)} inputMode="decimal" style={inputStyle} disabled={disabled || submitting} />
            </label>

            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)", margin: "8px 0 7px" }}>CATEGORY</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  disabled={disabled || submitting}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: `2px solid ${categoryId === c.id ? "var(--accent)" : "var(--line)"}`,
                    background: categoryId === c.id ? "var(--accent-wash)" : "#fff",
                    color: categoryId === c.id ? "var(--accent-text)" : "var(--ink)",
                    cursor: "pointer",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {isDraft && (
              <div style={{ display: "flex", gap: 10, marginTop: 14, padding: "12px 14px", background: "var(--highlight-wash)", borderRadius: 12 }}>
                <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", lineHeight: 1.4 }}>
                  Saved, but customers can&apos;t see it yet — every dish needs one photo before it goes live.
                </div>
              </div>
            )}

            {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginTop: 12, fontWeight: 700 }}>{error}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() =>
                  price != null &&
                  onSave({
                    name: name.trim(),
                    description: description.trim() || undefined,
                    priceUsd: price,
                    categoryId,
                    photoUrl: photoKey ?? undefined,
                  })
                }
                style={{ ...primaryButtonStyle, flex: 1, opacity: canSave ? 1 : 0.5 }}
              >
                {submitting ? "Saving…" : "Save changes"}
              </button>
            </div>

            {dish && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={disabled || submitting}
                style={{ ...dangerGhostButtonStyle, width: "100%", marginTop: 10, opacity: disabled || submitting ? 0.5 : 1 }}
              >
                Delete dish
              </button>
            )}
          </div>

          <div style={{ width: 260 }}>
            <PhotoPicker
              kind="dish"
              aspect={1}
              maxBytes={MAX_DISH_PHOTO_BYTES}
              currentUrl={photoPreviewUrl}
              required
              disabled={disabled || submitting}
              onUploaded={(key) => {
                setPhotoKey(key);
                setPhotoPreviewUrl(null);
              }}
            />
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginTop: 10 }}>
              Every dish needs one photo before it goes live — dishes with photos are ordered about twice as often. Pick the
              file from this tablet; we shrink it for you.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,24,27,.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 70,
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, width: 640, maxWidth: "94vw", maxHeight: "90vh", overflow: "auto" };

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
};
