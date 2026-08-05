"use client";

import { useState } from "react";
import type { MerchantCategoryResponse } from "@lynia/shared";
import { isValidWindow } from "../../lib/hours";
import { dangerGhostButtonStyle, ghostButtonStyle, primaryButtonStyle } from "../queue/styles";

export interface CategorySave {
  name: string;
  availableFrom?: string;
  availableTo?: string;
  hidden?: boolean;
}

/**
 * D-29: create or edit a category — name, optional time-limited availability window (both-or-neither,
 * "Breakfast 07:00–11:00"), hide toggle, and delete (only once empty — the server 409s otherwise and
 * that message is surfaced verbatim). Consolidates the gallery's separate M4·7 "manage categories" list
 * screen and M4·8 create/rename dialog into one sheet per category, matching this app's existing
 * sheet-over-list convention (RejectSheet, PaymentConfirmSheet) rather than adding a second full page.
 */
export function CategoryEditorSheet({
  category,
  disabled,
  submitting,
  error,
  onSave,
  onDelete,
  onCancel,
}: {
  category: MerchantCategoryResponse | null;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onSave: (body: CategorySave) => void;
  onDelete?: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [timeLimited, setTimeLimited] = useState(!!category?.availableFrom);
  const [from, setFrom] = useState(category?.availableFrom ?? "07:00");
  const [to, setTo] = useState(category?.availableTo ?? "11:00");
  const [hidden, setHidden] = useState(category?.hidden ?? false);

  const windowValid = !timeLimited || isValidWindow({ open: from, close: to });
  const canSave = name.trim().length > 0 && windowValid && !disabled && !submitting;
  const canDelete = !!category && category.dishCount === 0 && !disabled && !submitting;

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        {/* M4·3/M4·4 carry different sub-lines for the create and the edit variants
         *  (r-merchant.jsx:1052-1053). */}
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{category ? "Edit category" : "New category"}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.45 }}>
          {category ? (
            <>
              Renaming changes the tab customers see straight away.
              {category.dishCount === 1
                ? " The 1 dish inside it stays where it is."
                : category.dishCount > 1
                  ? ` The ${category.dishCount} dishes inside it stay where they are.`
                  : ""}
            </>
          ) : (
            <>Customers see this name as a tab on your menu. Keep it short — &ldquo;Breakfast&rdquo;, &ldquo;Combos&rdquo;, &ldquo;Kids&rdquo;.</>
          )}
        </div>

        <label style={labelStyle}>
          Category name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} style={inputStyle} disabled={disabled || submitting} />
        </label>

        <button
          type="button"
          onClick={() => setTimeLimited((v) => !v)}
          disabled={disabled || submitting}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 0",
            border: "none",
            background: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span
            style={{
              width: 40,
              height: 24,
              borderRadius: 999,
              background: timeLimited ? "var(--accent)" : "var(--line)",
              position: "relative",
              flexShrink: 0,
            }}
          >
            <span style={{ position: "absolute", top: 2, left: timeLimited ? 18 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
          </span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Only available at certain times</span>
        </button>

        {timeLimited && (
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              From
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} disabled={disabled || submitting} />
            </label>
            <label style={{ ...labelStyle, flex: 1 }}>
              To
              <input type="time" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} disabled={disabled || submitting} />
            </label>
          </div>
        )}
        {timeLimited && !windowValid && (
          <div style={{ fontSize: 12.5, color: "var(--danger-ink)", marginTop: -8, marginBottom: 8 }}>The start time must be before the end time.</div>
        )}

        {category && (
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            disabled={disabled || submitting}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 0",
              border: "none",
              background: "none",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ width: 40, height: 24, borderRadius: 999, background: hidden ? "var(--danger)" : "var(--line)", position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", top: 2, left: hidden ? 18 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Hidden — customers don&apos;t see it or its dishes</span>
          </button>
        )}

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginTop: 8, marginBottom: 4, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                name: name.trim(),
                availableFrom: timeLimited ? from : undefined,
                availableTo: timeLimited ? to : undefined,
                ...(category ? { hidden } : {}),
              })
            }
            style={{ ...primaryButtonStyle, flex: 1, opacity: canSave ? 1 : 0.5 }}
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>

        {category && onDelete && (
          <>
            <div style={{ height: 1, background: "var(--line)", margin: "16px 0 12px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>
                {category.dishCount > 0
                  ? `Delete this category — available once it's empty. Move or delete its ${category.dishCount} dish${category.dishCount === 1 ? "" : "es"} first.`
                  : "Delete this category — it's empty."}
              </div>
              <button
                type="button"
                disabled={!canDelete}
                onClick={onDelete}
                style={{ ...dangerGhostButtonStyle, opacity: canDelete ? 1 : 0.5, whiteSpace: "nowrap" }}
              >
                Delete
              </button>
            </div>
          </>
        )}
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

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, width: 420, maxWidth: "92vw" };

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
