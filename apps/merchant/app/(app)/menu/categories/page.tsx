"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { MerchantCategoryResponse } from "@lynia/shared";
import { Kitchen } from "../../../components/Kitchen";
import { useKitchenConnection } from "../../../components/KitchenConnectionProvider";
import { Icon } from "../../../components/icons";
import { CategoryEditorSheet, type CategorySave } from "../../../components/menu/CategoryEditorSheet";
import { RetryableError } from "../../../components/RetryableError";
import { cardStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "../../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../../lib/api-client";
import { planCategoryMove, sortedCategories } from "../../../lib/menu-groups";
import { createCategory, deleteCategory, listCategories, updateCategory } from "../../../lib/menu-api";

/**
 * M4·2 `category_manage` (r-merchant.jsx:998-1040) — "This is exactly what customers see as the tabs
 * on your menu — same names, same order." Reorder with the up/down pair and the ordinal, flip
 * Showing/Hidden inline, rename, delete once empty, all against the live customer-tab preview.
 *
 * Every control here is a real persisted write: `PATCH /merchant/categories/:id` already accepts both
 * `sortOrder` and `hidden`, and `listCategories` orders by `sortOrder` server-side. A reorder writes
 * the whole 0..n-1 sequence rather than just the swapped pair — see `planCategoryMove` for why.
 */
type LoadState = { status: "loading" } | { status: "ready"; categories: MerchantCategoryResponse[] } | { status: "error"; message: string };

type Sheet = { kind: "none" } | { kind: "category"; category: MerchantCategoryResponse | null };

export default function CategoryManagePage() {
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Synchronous double-submit guard (CF-01 class) — see menu/page.tsx: createCategory is NOT
  // idempotent, so a same-tick double-tap on "Save" genuinely creates two categories.
  const submittingRef = useRef(false);
  // CF-02-SIB-5 (crash-fuzz 2026-08-23): `run()` below — the shared helper behind move/toggle/delete —
  // guarded only with `busyId` (React state), the same async-state-only race CF-02 fixed elsewhere.
  // A SINGLE global in-flight flag, not per-id: `rowDisabled` below already treats the whole list as
  // one-mutation-at-a-time (`busyId !== null` disables every row, not just the busy one), because a
  // reorder writes MULTIPLE rows' sortOrder in one `run()` call — a per-id guard would only block a
  // same-tick double-tap on the SAME row and let two DIFFERENT rows' reorders race each other with
  // overlapping patch sets (caught in review). Matches this file's own `submittingRef` shape.
  const runInFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const categories = await listCategories();
      setState({ status: "ready", categories });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your categories." });
    }
  }, [signOut]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Every mutation refetches — on success AND on failure — so the list always shows what the server
   *  actually holds. A reorder is several writes; if one fails halfway the merchant must see the real
   *  half-applied order, not an optimistic one that never landed. */
  async function run(id: string | null, fn: () => Promise<unknown>, fallback: string) {
    if (runInFlightRef.current) return;
    runInFlightRef.current = true;
    setBusyId(id);
    setListError(null);
    let signedOut = false;
    try {
      await fn();
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) {
        signedOut = true;
        return;
      }
      setListError(err instanceof ApiError ? err.message : fallback);
    } finally {
      runInFlightRef.current = false;
      // A dead session is already on its way to /login — don't fire a doomed refetch behind it.
      if (!signedOut) await refresh();
      setBusyId(null);
    }
  }

  async function onMove(category: MerchantCategoryResponse, delta: number) {
    if (state.status !== "ready") return;
    const { patches } = planCategoryMove(state.categories, category.id, delta);
    if (patches.length === 0) return;
    await run(
      category.id,
      async () => {
        // Sequential, not Promise.all: a kitchen tablet on a 300-600ms link fires these one at a time
        // anyway, and a serial run means a mid-sequence failure leaves a prefix that's coherent rather
        // than an arbitrary subset.
        for (const patch of patches) await updateCategory(patch.id, { sortOrder: patch.sortOrder });
      },
      "Couldn't save the new order — try again.",
    );
  }

  async function onToggleHidden(category: MerchantCategoryResponse) {
    await run(category.id, () => updateCategory(category.id, { hidden: !category.hidden }), "Couldn't change that — try again.");
  }

  async function onDelete(category: MerchantCategoryResponse) {
    // The server is the real gate (409 "Remove all dishes from this category before deleting it") —
    // this only avoids offering a tap that is certain to fail.
    await run(category.id, () => deleteCategory(category.id), "Couldn't delete that category — try again.");
  }

  async function onSaveSheet(body: CategorySave) {
    if (sheet.kind !== "category") return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSheetError(null);
    try {
      if (sheet.category) await updateCategory(sheet.category.id, body);
      else await createCategory(body);
      setSheet({ kind: "none" });
      await refresh();
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setSheetError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  const ordered = state.status === "ready" ? sortedCategories(state.categories) : [];
  const visible = ordered.filter((c) => !c.hidden);

  return (
    <Kitchen active="catalog">
      <div className="kitchen-page" style={{ display: "flex", flexDirection: "column", gap: 16, overflow: "auto", height: "100%" }}>
        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your categories…</div>}

        {state.status === "error" && <RetryableError message={state.message} onRetry={() => void refresh()} />}

        {state.status === "ready" && (
          <>
            <div className="kitchen-head">
              <div className="kitchen-head-title">
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-.01em" }}>Categories</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
                  This is exactly what customers see as the tabs on your menu — same names, same order.
                </div>
              </div>
              <Link href="/menu" className="kitchen-head-action" style={{ ...ghostButtonStyle, textDecoration: "none", display: "inline-block" }}>
                Back to the menu
              </Link>
              <button
                type="button"
                className="kitchen-head-action"
                disabled={actionsDisabled}
                onClick={() => setSheet({ kind: "category", category: null })}
                style={{ ...primaryButtonStyle, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, ...disabledStyle(actionsDisabled) }}
              >
                <Icon name="plus" size={16} color="#fff" />
                New category
              </button>
            </div>

            {listError && (
              <div style={{ background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700 }}>
                {listError}
              </div>
            )}

            <div className="kitchen-split">
              {/* min() so the 420px floor never becomes a horizontal scroll on a narrower screen. */}
              <div style={{ ...cardStyle, flex: 1, minWidth: "min(420px, 100%)", padding: "4px 18px" }}>
                {ordered.length === 0 && (
                  <div style={{ fontSize: 13.5, color: "var(--muted)", padding: "18px 0" }}>
                    No categories yet. Create one and your dishes get somewhere to live.
                  </div>
                )}
                {ordered.map((c, idx) => {
                  const rowBusy = busyId === c.id;
                  const rowDisabled = actionsDisabled || busyId !== null;
                  return (
                    <div
                      key={c.id}
                      className="kitchen-row"
                      style={{
                        padding: "14px 0",
                        borderBottom: idx === ordered.length - 1 ? "none" : "1px solid var(--line)",
                        opacity: rowBusy ? 0.55 : 1,
                      }}
                    >
                      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <button
                          type="button"
                          aria-label={`Move ${c.name} up`}
                          disabled={rowDisabled || idx === 0}
                          onClick={() => void onMove(c, -1)}
                          style={arrowButtonStyle(rowDisabled || idx === 0)}
                        >
                          <Icon name="chevron-up" size={15} color="var(--muted)" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${c.name} down`}
                          disabled={rowDisabled || idx === ordered.length - 1}
                          onClick={() => void onMove(c, 1)}
                          style={arrowButtonStyle(rowDisabled || idx === ordered.length - 1)}
                        >
                          <Icon name="chevron-down" size={15} color="var(--muted)" />
                        </button>
                      </span>
                      <span style={{ minWidth: 26, fontSize: 15, fontWeight: 800, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{idx + 1}</span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: c.hidden ? "var(--muted)" : "var(--ink)" }}>{c.name}</div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                          {c.dishCount} dish{c.dishCount === 1 ? "" : "es"} ·{" "}
                          {c.availableFrom && c.availableTo ? `${c.availableFrom}–${c.availableTo}` : "All day"}
                        </div>
                      </div>

                      <span className="kitchen-row-actions">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!c.hidden}
                          aria-label={`${c.name} — showing to customers`}
                          disabled={rowDisabled}
                          onClick={() => void onToggleHidden(c)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 13,
                            fontWeight: 700,
                            color: c.hidden ? "var(--muted)" : "var(--accent-text)",
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            ...disabledStyle(rowDisabled),
                          }}
                        >
                          <span style={{ width: 44, height: 26, borderRadius: 999, background: c.hidden ? "var(--line)" : "var(--accent)", position: "relative", flexShrink: 0 }}>
                            <span style={{ position: "absolute", top: 3, left: c.hidden ? 3 : 21, width: 20, height: 20, borderRadius: "50%", background: "#fff" }} />
                          </span>
                          {c.hidden ? "Hidden" : "Showing"}
                        </button>

                        <button
                          type="button"
                          aria-label={`Rename ${c.name}`}
                          disabled={rowDisabled}
                          onClick={() => setSheet({ kind: "category", category: c })}
                          style={iconButtonStyle(rowDisabled)}
                        >
                          <Icon name="pencil" size={17} color="var(--muted)" />
                        </button>

                        {/* M4·2 gates delete on emptiness (r-merchant.jsx:1024): the glyph greys out
                         *  while dishes remain. The server 409s regardless — this is the same rule stated
                         *  before the tap, not instead of it. */}
                        <button
                          type="button"
                          aria-label={c.dishCount > 0 ? `Delete ${c.name} — move or delete its ${c.dishCount} dishes first` : `Delete ${c.name}`}
                          title={c.dishCount > 0 ? "Move or delete its dishes first" : "Delete this empty category"}
                          disabled={rowDisabled || c.dishCount > 0}
                          onClick={() => void onDelete(c)}
                          style={iconButtonStyle(rowDisabled || c.dishCount > 0)}
                        >
                          <Icon name="trash-2" size={17} color={c.dishCount > 0 ? "var(--line)" : "var(--danger-ink)"} />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="kitchen-aside" style={{ ...cardStyle, padding: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>How customers see it</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                  {visible.length === 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Nothing is showing — your menu has no tabs right now.</span>}
                  {visible.map((c, i) => (
                    <span
                      key={c.id}
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        padding: "7px 12px",
                        borderRadius: 999,
                        background: i === 0 ? "var(--accent-wash)" : "var(--surface)",
                        color: i === 0 ? "var(--accent-text)" : "var(--muted)",
                        border: `1px solid ${i === 0 ? "var(--accent)" : "var(--line)"}`,
                      }}
                    >
                      {c.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  A hidden category and its dishes disappear from the app immediately — orders already placed are untouched. Deleting is
                  only possible once a category is empty.
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {sheet.kind === "category" && (
        <CategoryEditorSheet
          category={sheet.category}
          disabled={actionsDisabled}
          submitting={submitting}
          error={sheetError}
          onSave={onSaveSheet}
          onCancel={() => {
            setSheet({ kind: "none" });
            setSheetError(null);
          }}
        />
      )}
    </Kitchen>
  );
}

function arrowButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "grid",
    placeItems: "center",
    width: 30,
    height: 22,
    border: "1px solid var(--line)",
    borderRadius: 7,
    background: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    padding: 0,
  };
}

function iconButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "grid",
    placeItems: "center",
    width: 38,
    height: 38,
    border: "none",
    borderRadius: 999,
    background: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    flexShrink: 0,
  };
}
