import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CreateTopupRequest } from "@lynia/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { Throttle } from "../common/throttle.guard";
import { ZodBody } from "../common/zod.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WalletService } from "./wallet.service";

/**
 * Rider-facing prepaid commission wallet (design docs/plans/2026-rider-wallet-design.md). The signed-in
 * profile IS the rider (riderId == profileId). Every route is read-mostly; the one write, `POST topups`,
 * is throttled and creates a bounded, server-clamped intent. Money never moves through the client — the
 * per-ride debit and every credit are server-authoritative (the app only reads the ledger).
 */
@Controller("wallet")
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  /** The feature flag + policy (rate, floor, grace, top-up bounds) — server-authoritative. */
  @Get("config")
  config() {
    return this.wallet.getConfig();
  }

  /** The prepaid balance. */
  @Get()
  balance(@CurrentUser() id: string) {
    return this.wallet.getWallet(id);
  }

  /** A reverse-chronological page of ledger receipts. */
  @Get("ledger")
  ledger(@CurrentUser() id: string, @Query("cursor") cursor?: string) {
    return this.wallet.getLedger(id, cursor);
  }

  /** Start a self-serve top-up (EcoCash / InnBucks / O'mari). Amount is clamped server-side. */
  @Throttle({ limit: 10, windowSec: 3600, keyPrefix: "topup" })
  @Post("topups")
  createTopup(@Body(new ZodBody(CreateTopupRequest)) body: CreateTopupRequest, @CurrentUser() id: string) {
    return this.wallet.createTopup(id, body);
  }

  /** Poll a top-up intent until it reaches a terminal state (or expires at the 90s window). */
  @Get("topups/:id")
  topup(@Param("id") topupId: string, @CurrentUser() id: string) {
    return this.wallet.getTopup(id, topupId);
  }
}
