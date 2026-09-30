"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DishOutOfStockFor, MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { CategoryEditorSheet, type CategorySave } from "../../components/menu/CategoryEditorSheet";
import { DishEditorSheet, type DishSave } from "../../components/menu/DishEditorSheet";
import { OosSheet } from "../../components/menu/OosSheet";
import { Switch } from "../../components/m/Switch";
import { useToast } from "../../components/m/Toast";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness, useBusiness } from "../../lib/business";
import { planCategoryMove, sortedCategories } from "../../lib/menu-groups";
import {
  clearDishOutOfStock,
  createCategory,
  createDish,
  deleteCategory,
  deleteDish,
  listCategories,
  listDishes,
  setDishOutOfStock,
  updateCategory,
  updateDish,
} from "../../lib/menu-api";
import { backOnLine, offLabel, searchDishes } from "../../lib/menu-view";
import { money } from "../../lib/orders-view";
import { useVocabulary } from "../../lib/vocabulary";

type LoadState =
  | { status: "loading" }
  // `staff` (L4): Staff turn items off and back on, and nothing else here (the permission table).
  | { status: "ready"; categories: MerchantCategoryResponse[]; dishes: MerchantDishResponse[]; staff: boolean }
  | { status: "error"; message: string | null };

type Sheet =
  | { kind: "none" }
  | { kind: "category"; category: MerchantCategoryResponse | null }
  | { kind: "dish"; dish: MerchantDishResponse | null; defaultCategoryId?: string }
  | { kind: "oos"; dish: MerchantDishResponse };

const LONG_PRESS_MS = 500;

/**
 * C1 · Menu and E1 · Items (packages/design/handoff/merchant-mobile, ledger D-48). A mint header with
 * the title and a search; category chips with counts (selected = ink; "+ Category" in mint); 64px rows
 * with an initial tile, name / price and a **stock switch** (off greys the row and says until when);
 * "+ Add a dish" pinned at the bottom. Turning a dish off opens C2; turning it on is one tap.
 *
 * README route map: "/menu/categories becomes category chips (long-press to reorder)" — a long-pressed
 * chip opens its category sheet, which moves it along the row, renames, hides or deletes it. Tapping a
 * row opens the dish editor ("editor not drawn"). A shop's Items screen is this one in its own words.
 */
export default function MenuPage() {
  const { actionsDisabled, signOut } = useKitchenConnection();
  const v = useVocabulary();
  const business = useBusiness();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // Synchronous double-submit guard (CF-01 class): createCategory/createDish are NOT idempotent.
  const submittingRef = useRef(false);
  const shop = business?.businessType === "shop";

  const refresh = useCallback(() => {
    // The business rides along (cached, never rejects) so the list first renders in the right words.
    Promise.all([listCategories(), listDishes(), loadBusiness()])
      .then(([categories, dishes, b]) => setState({ status: "ready", categories, dishes, staff: b?.myRole === "staff" }))
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : null });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const categories = useMemo(() => (state.status === "ready" ? sortedCategories(state.categories) : []), [state]);
  // E1 draws an "All" chip first on a shop's Items (C1 draws none for a restaurant), chosen to start with.
  const all = shop && selected === null;
  const current = all ? null : (categories.find((c) => c.id === selected) ?? categories[0] ?? null);
  const rows = useMemo(() => {
    if (state.status !== "ready") return [];
    if (query.trim()) return searchDishes(state.dishes, query);
    if (all) {
      const order = new Map(categories.map((c, i) => [c.id, i]));
      return [...state.dishes].sort((a, b) => (order.get(a.categoryId) ?? 0) - (order.get(b.categoryId) ?? 0) || a.sortOrder - b.sortOrder);
    }
    return current ? state.dishes.filter((d) => d.categoryId === current.id).sort((a, b) => a.sortOrder - b.sortOrder) : [];
  }, [state, query, current, all, categories]);

  async function guarded(fn: () => Promise<void>, fallback: string, onError: (m: string) => void): Promise<boolean> {
    if (submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);
    onError("");
    try {
      await fn();
      return true;
    } catch (err) {
      if (!redirectIfSessionExpired(err, signOut)) onError(err instanceof ApiError ? err.message : fallback);
      return false;
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  async function withSheet(fn: () => Promise<void>, done?: string) {
    const ok = await guarded(fn, "Something went wrong — try again.", (m) => setSheetError(m || null));
    if (!ok) return;
    setSheet({ kind: "none" });
    if (done) toast(done);
    refresh();
  }

  async function onStarter(name: string) {
    if (await guarded(() => createCategory({ name }).then(() => undefined), "Couldn't create the category — try again.", (m) => setListError(m || null))) refresh();
  }

  async function onTurnOn(dish: MerchantDishResponse) {
    const ok = await guarded(() => clearDishOutOfStock(dish.id).then(() => undefined), "Couldn't update stock — try again.", (m) => setListError(m || null));
    if (!ok) return;
    toast(`${dish.name} is back on`);
    refresh();
  }

  async function onTurnOff(forHowLong: DishOutOfStockFor) {
    if (sheet.kind !== "oos") return;
    const { dish } = sheet;
    const back = backOnLine(business, new Date()).match(/\d\d:\d\d/)?.[0];
    await withSheet(
      () => setDishOutOfStock(dish.id, forHowLong).then(() => undefined),
      forHowLong === "rest_of_today" ? `${dish.name} off until ${back ?? "tomorrow"}` : `${dish.name} is off`,
    );
  }

  async function onMove(delta: -1 | 1) {
    if (sheet.kind !== "category" || !sheet.category || state.status !== "ready") return;
    const { patches } = planCategoryMove(state.categories, sheet.category.id, delta);
    if (patches.length === 0) return;
    await withSheet(async () => {
      // Sequential: a mid-sequence failure leaves a coherent prefix, and the refetch shows it.
      for (const patch of patches) await updateCategory(patch.id, { sortOrder: patch.sortOrder });
    }, delta < 0 ? "Moved earlier" : "Moved later");
  }

  const staff = state.status === "ready" && state.staff;
  const disabled = actionsDisabled || submitting;

  return (
    <Kitchen active="catalog">
      <div className="m-page">
        <div className="m-hd">
          <div className="m-hdt">
            <div className="m-biz">
              <b style={{ fontSize: 24 }}>{v.catalog}</b>
            </div>
          </div>
          {state.status === "ready" && state.categories.length > 0 && (
            <label className="m-in m-srch">
              <Icon name="search" size={18} color="var(--muted)" />
              <input type="search" placeholder={`Search ${v.items}`} aria-label={`Search ${v.items}`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
          )}
        </div>

        <div className="m-bd" style={{ paddingTop: 12 }}>
          {state.status === "loading" && <div className="m-hint">Loading your {v.catalogLower}…</div>}
          {state.status === "error" && <RetryableError message={state.message ?? `Couldn't load your ${v.catalogLower}.`} onRetry={refresh} />}
          {listError && (
            <div className="m-alert" role="alert">
              {listError}
            </div>
          )}

          {state.status === "ready" && state.categories.length === 0 && (
            // README route map: "`/menu` empty — not redrawn: EmptyState with the four starter-category chips".
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 10, paddingTop: 40 }}>
              <Icon name="utensils" size={32} color="var(--muted)" />
              <b style={{ fontSize: 17 }}>{staff ? `No ${v.items} yet` : "Start with a category"}</b>
              <p className="m-sub">{staff ? `The owner adds the ${v.items} here. You turn them off and back on.` : v.emptyCatalogHint}</p>
              {!staff && (
                <div className="m-chips" style={{ flexWrap: "wrap", justifyContent: "center" }}>
                  {v.starterCategories.map((name) => (
                    <button key={name} type="button" className="m-chip m-g" disabled={disabled} onClick={() => void onStarter(name)}>
                      + {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {state.status === "ready" && state.categories.length > 0 && (
            <>
              {!query.trim() && (
                <div className="m-chips" role="tablist" aria-label="Categories">
                  {shop && (
                    <button type="button" role="tab" aria-selected={all} className={`m-chip${all ? " m-on" : ""}`} onClick={() => setSelected(null)}>
                      All
                    </button>
                  )}
                  {categories.map((c) => (
                    <CategoryChip
                      key={c.id}
                      category={c}
                      on={c.id === current?.id}
                      onSelect={() => setSelected(c.id)}
                      onLongPress={staff ? undefined : () => setSheet({ kind: "category", category: c })}
                    />
                  ))}
                  {!staff && (
                    <button type="button" className="m-chip m-g" disabled={actionsDisabled} onClick={() => setSheet({ kind: "category", category: null })}>
                      <Icon name="plus" size={16} /> Category
                    </button>
                  )}
                </div>
              )}

              <div>
                {rows.length === 0 && <div className="m-hint" style={{ padding: "12px 0" }}>{query.trim() ? `No ${v.items} match “${query.trim()}”` : `No ${v.items} here yet`}</div>}
                {rows.map((dish) => (
                  <DishRow
                    key={dish.id}
                    dish={dish}
                    shop={shop}
                    editable={!staff}
                    disabled={disabled}
                    onEdit={() => setSheet({ kind: "dish", dish })}
                    onToggle={(on) => (on ? void onTurnOn(dish) : setSheet({ kind: "oos", dish }))}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {state.status === "ready" && state.categories.length > 0 && !staff && (
          <div className="m-foot">
            <button type="button" className="m-btn" disabled={actionsDisabled} onClick={() => setSheet({ kind: "dish", dish: null, defaultCategoryId: current?.id ?? categories[0]?.id })}>
              <Icon name="plus" size={20} /> Add {v.anItem}
            </button>
          </div>
        )}
      </div>

      {sheet.kind === "category" && (
        <CategoryEditorSheet
          category={sheet.category}
          disabled={actionsDisabled}
          submitting={submitting}
          error={sheetError}
          onSave={(body: CategorySave) =>
            void withSheet(async () => {
              if (sheet.category) await updateCategory(sheet.category.id, body);
              else await createCategory(body);
            })
          }
          onDelete={sheet.category ? () => void withSheet(() => deleteCategory(sheet.category!.id).then(() => undefined)) : undefined}
          onMove={(d) => void onMove(d)}
          position={sheet.category ? { index: categories.findIndex((c) => c.id === sheet.category!.id), count: categories.length } : undefined}
          onCancel={() => setSheet({ kind: "none" })}
        />
      )}

      {sheet.kind === "dish" && state.status === "ready" && (
        <DishEditorSheet
          dish={sheet.dish}
          categories={state.categories}
          defaultCategoryId={sheet.defaultCategoryId}
          disabled={actionsDisabled}
          submitting={submitting}
          error={sheetError}
          onSave={(body: DishSave) =>
            void withSheet(async () => {
              if (sheet.dish) await updateDish(sheet.dish.id, body);
              else await createDish(body);
            })
          }
          onDelete={sheet.dish ? () => void withSheet(() => deleteDish(sheet.dish!.id).then(() => undefined)) : undefined}
          onCancel={() => setSheet({ kind: "none" })}
        />
      )}

      {sheet.kind === "oos" && (
        <OosSheet
          dishName={sheet.dish.name}
          backOn={backOnLine(business, new Date())}
          disabled={actionsDisabled}
          submitting={submitting}
          onConfirm={(f) => void onTurnOff(f)}
          onCancel={() => setSheet({ kind: "none" })}
        />
      )}
    </Kitchen>
  );
}

/** A category chip: "Mains 3". A long press (or a right click) opens its sheet, where it reorders. */
function CategoryChip({
  category,
  on,
  onSelect,
  onLongPress,
}: {
  category: MerchantCategoryResponse;
  on: boolean;
  onSelect: () => void;
  onLongPress?: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <button
      type="button"
      role="tab"
      aria-selected={on}
      className={`m-chip${on ? " m-on" : ""}`}
      style={category.hidden ? { opacity: 0.55 } : undefined}
      onPointerDown={() => {
        fired.current = false;
        if (!onLongPress) return;
        timer.current = setTimeout(() => {
          fired.current = true;
          onLongPress();
        }, LONG_PRESS_MS);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => {
        if (!onLongPress) return;
        e.preventDefault();
        clear();
        if (!fired.current) onLongPress();
        fired.current = true;
      }}
      onClick={() => {
        if (fired.current) return;
        onSelect();
      }}
    >
      {category.name} <span className="m-num">{category.dishCount}</span>
    </button>
  );
}

function DishRow({
  dish,
  shop,
  editable,
  disabled,
  onEdit,
  onToggle,
}: {
  dish: MerchantDishResponse;
  shop: boolean;
  editable: boolean;
  disabled: boolean;
  onEdit: () => void;
  onToggle: (on: boolean) => void;
}) {
  const off = offLabel(dish, new Date());
  const body = (
    <>
      <div className={`m-th ${shop ? "m-tile-shop" : "m-tile-food"}`}>{dish.name.trim().charAt(0).toUpperCase()}</div>
      <div className="m-t">
        <b>{dish.name}</b>
        {off ? (
          <span className="m-gold-ink">{off}</span>
        ) : dish.isDraft ? (
          // Not drawn: a draft is saved but hidden until it has a photo, and the owner needs to know why.
          <span className="m-gold-ink">Draft · add a photo to go live</span>
        ) : (
          <span className="m-num">{money(dish.priceUsd)}</span>
        )}
      </div>
    </>
  );
  return (
    <div className={`m-li m-dish${dish.outOfStock ? " m-off" : ""}`}>
      {editable ? (
        <button type="button" onClick={onEdit} aria-label={`Edit ${dish.name}`} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" }}>
          {body}
        </button>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>{body}</div>
      )}
      <Switch checked={!dish.outOfStock} label={`${dish.name} in stock`} disabled={disabled} onChange={onToggle} />
    </div>
  );
}
