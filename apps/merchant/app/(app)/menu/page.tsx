"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantCategoryResponse, MerchantDishResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { CategoryEditorSheet, type CategorySave } from "../../components/menu/CategoryEditorSheet";
import { DishEditorSheet, type DishSave } from "../../components/menu/DishEditorSheet";
import { OosSheet } from "../../components/menu/OosSheet";
import { ApiError, isSessionExpiredError } from "../../lib/api-client";
import { formatMoney } from "../../lib/money-input";
import { groupDishesByCategory, menuSummary, STARTER_CATEGORY_NAMES } from "../../lib/menu-groups";
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
import { cardStyle, ghostButtonStyle, primaryButtonStyle } from "../../components/queue/styles";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; categories: MerchantCategoryResponse[]; dishes: MerchantDishResponse[] }
  | { status: "error"; message: string };

type Sheet =
  | { kind: "none" }
  | { kind: "category"; category: MerchantCategoryResponse | null }
  | { kind: "dish"; dish: MerchantDishResponse | null; defaultCategoryId?: string }
  | { kind: "oos"; dish: MerchantDishResponse };

export default function MenuPage() {
  const { actionsDisabled, signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [sheet, setSheet] = useState<Sheet>({ kind: "none" });
  const [submitting, setSubmitting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([listCategories(), listDishes()])
      .then(([categories, dishes]) => setState({ status: "ready", categories, dishes }))
      .catch((err: unknown) => {
        if (isSessionExpiredError(err)) {
          signOut();
          return;
        }
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your menu." });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function withSheet(fn: () => Promise<void>) {
    setSubmitting(true);
    setSheetError(null);
    try {
      await fn();
      setSheet({ kind: "none" });
      refresh();
    } catch (err) {
      if (isSessionExpiredError(err)) {
        signOut();
        return;
      }
      setSheetError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSaveCategory(body: CategorySave) {
    if (sheet.kind !== "category") return;
    await withSheet(async () => {
      if (sheet.category) await updateCategory(sheet.category.id, body);
      else await createCategory(body);
    });
  }

  async function onCreateStarterCategory(name: string) {
    setSubmitting(true);
    setListError(null);
    try {
      await createCategory({ name });
      refresh();
    } catch (err) {
      // D-D0e: this used to swallow the error entirely — a dropped connection mid-tap left the
      // starter chip tappable again with no indication the create actually failed.
      if (isSessionExpiredError(err)) {
        signOut();
        return;
      }
      setListError(err instanceof ApiError ? err.message : "Couldn't create the category — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onDeleteCategory() {
    if (sheet.kind !== "category" || !sheet.category) return;
    await withSheet(() => deleteCategory((sheet as { category: MerchantCategoryResponse }).category.id).then(() => undefined));
  }

  async function onSaveDish(body: DishSave) {
    if (sheet.kind !== "dish") return;
    await withSheet(async () => {
      if (sheet.dish) await updateDish(sheet.dish.id, body);
      else await createDish(body);
    });
  }

  async function onDeleteDish() {
    if (sheet.kind !== "dish" || !sheet.dish) return;
    await withSheet(() => deleteDish((sheet as { dish: MerchantDishResponse }).dish.id).then(() => undefined));
  }

  async function onConfirmOos() {
    if (sheet.kind !== "oos") return;
    await withSheet(() => setDishOutOfStock(sheet.dish.id).then(() => undefined));
  }

  async function onClearOos(dishId: string) {
    setSubmitting(true);
    setListError(null);
    try {
      await clearDishOutOfStock(dishId);
      refresh();
    } catch (err) {
      // LC-D04: this used to have no catch at all — a dropped connection mid-tap silently left the
      // dish marked out of stock with no indication the "back in stock" tap failed.
      if (isSessionExpiredError(err)) {
        signOut();
        return;
      }
      setListError(err instanceof ApiError ? err.message : "Couldn't update stock — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Kitchen active="catalog">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18, overflow: "auto", height: "100%" }}>
        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your menu…</div>}

        {state.status === "error" && (
          <div style={{ background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 16, padding: 20, maxWidth: 480 }}>
            <div>{state.message}</div>
            <button type="button" onClick={refresh} style={{ ...ghostButtonStyle, marginTop: 12 }}>
              Retry
            </button>
          </div>
        )}

        {state.status === "ready" && listError && (
          <div style={{ background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 12, padding: "12px 16px", fontSize: 13, fontWeight: 700 }}>
            {listError}
          </div>
        )}

        {state.status === "ready" && state.categories.length === 0 && (
          <div style={{ ...cardStyle, maxWidth: 520, textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Start with a category</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5, marginBottom: 20 }}>
              Dishes live inside categories — Mains, Sides, Drinks, whatever fits your kitchen. Create one and you can
              add dishes straight into it.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {STARTER_CATEGORY_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={actionsDisabled || submitting}
                  onClick={() => onCreateStarterCategory(name)}
                  style={{ ...ghostButtonStyle, opacity: actionsDisabled || submitting ? 0.5 : 1 }}
                >
                  + {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.status === "ready" && state.categories.length > 0 && (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 21, fontWeight: 800 }}>Menu</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{menuSummary(state.categories, state.dishes)}</div>
              </div>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => setSheet({ kind: "category", category: null })}
                style={{ ...ghostButtonStyle, opacity: actionsDisabled ? 0.5 : 1 }}
              >
                + New category
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => setSheet({ kind: "dish", dish: null, defaultCategoryId: state.categories[0]?.id })}
                style={{ ...primaryButtonStyle, opacity: actionsDisabled ? 0.5 : 1 }}
              >
                + Add a dish
              </button>
            </div>

            {groupDishesByCategory(state.categories, state.dishes).map(({ category, dishes }) => (
              <div key={category.id} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, fontSize: 16, fontWeight: 800, opacity: category.hidden ? 0.5 : 1 }}>
                    {category.name}
                    {category.hidden && <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", marginLeft: 8 }}>HIDDEN</span>}
                  </div>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {dishes.length} dish{dishes.length === 1 ? "" : "es"} ·{" "}
                    {category.availableFrom && category.availableTo ? `${category.availableFrom} – ${category.availableTo}` : "All day"}
                  </span>
                  <button
                    type="button"
                    disabled={actionsDisabled}
                    onClick={() => setSheet({ kind: "category", category })}
                    style={{ ...ghostButtonStyle, padding: "8px 14px", opacity: actionsDisabled ? 0.5 : 1 }}
                  >
                    Edit category
                  </button>
                </div>

                {dishes.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>No dishes yet.</div>}

                {dishes.map((dish) => (
                  <div key={dish.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 10,
                        background: "var(--surface)",
                        overflow: "hidden",
                        flexShrink: 0,
                        opacity: dish.outOfStock ? 0.4 : 1,
                      }}
                    >
                      {dish.photoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={dish.photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      )}
                    </div>
                    <div style={{ flex: 1, opacity: dish.outOfStock ? 0.55 : 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                        {dish.name}
                        {dish.isDraft && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "var(--highlight-ink)",
                              background: "var(--highlight-wash)",
                              borderRadius: 999,
                              padding: "2px 8px",
                              marginLeft: 8,
                            }}
                          >
                            DRAFT — NEEDS PHOTO
                          </span>
                        )}
                        {dish.outOfStock && (
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: "var(--muted)",
                              background: "var(--surface)",
                              borderRadius: 999,
                              padding: "2px 8px",
                              marginLeft: 8,
                            }}
                          >
                            OUT OF STOCK
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>${formatMoney(dish.priceUsd)}</div>
                    </div>
                    <button
                      type="button"
                      disabled={actionsDisabled || submitting}
                      onClick={() => (dish.outOfStock ? onClearOos(dish.id) : setSheet({ kind: "oos", dish }))}
                      style={{ ...ghostButtonStyle, padding: "8px 14px", opacity: actionsDisabled || submitting ? 0.5 : 1 }}
                    >
                      {dish.outOfStock ? "Back in stock" : "Mark out of stock"}
                    </button>
                    <button
                      type="button"
                      disabled={actionsDisabled}
                      onClick={() => setSheet({ kind: "dish", dish })}
                      style={{ ...ghostButtonStyle, padding: "8px 14px", opacity: actionsDisabled ? 0.5 : 1 }}
                    >
                      Edit
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  disabled={actionsDisabled}
                  onClick={() => setSheet({ kind: "dish", dish: null, defaultCategoryId: category.id })}
                  style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", background: "none", border: "none", cursor: "pointer", padding: "10px 0 0", opacity: actionsDisabled ? 0.5 : 1 }}
                >
                  + Add dish here
                </button>
              </div>
            ))}
          </>
        )}
      </div>

      {sheet.kind === "category" && (
        <CategoryEditorSheet
          category={sheet.category}
          disabled={actionsDisabled}
          submitting={submitting}
          error={sheetError}
          onSave={onSaveCategory}
          onDelete={sheet.category ? onDeleteCategory : undefined}
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
          onSave={onSaveDish}
          onDelete={sheet.dish ? onDeleteDish : undefined}
          onCancel={() => setSheet({ kind: "none" })}
        />
      )}

      {sheet.kind === "oos" && (
        <OosSheet
          dishName={sheet.dish.name}
          disabled={actionsDisabled}
          submitting={submitting}
          onConfirm={onConfirmOos}
          onCancel={() => setSheet({ kind: "none" })}
        />
      )}
    </Kitchen>
  );
}
