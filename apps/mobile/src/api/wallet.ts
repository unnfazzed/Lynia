import type { CommissionConfig, CreateTopupRequest, Topup, Wallet, WalletLedgerPage } from "@lynia/shared";
import { apiFetch } from "./client";

/** The commission feature flag + policy (server-authoritative — the app never hardcodes a rate). */
export function getWalletConfig(): Promise<CommissionConfig> {
  return apiFetch("/wallet/config");
}

/** The rider's prepaid commission balance. */
export function getWallet(): Promise<Wallet> {
  return apiFetch("/wallet");
}

/** A reverse-chronological page of ledger receipts; pass the previous page's `nextCursor` to page on. */
export function getWalletLedger(cursor?: string): Promise<WalletLedgerPage> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch(`/wallet/ledger${qs}`);
}

/** Start a self-serve top-up (EcoCash / InnBucks / O'mari); the amount is clamped server-side. */
export function createTopup(body: CreateTopupRequest): Promise<Topup> {
  return apiFetch("/wallet/topups", { method: "POST", body });
}

/** Poll a top-up intent until it reaches a terminal state (confirmed / declined / expired). */
export function getTopup(id: string): Promise<Topup> {
  return apiFetch(`/wallet/topups/${id}`);
}
