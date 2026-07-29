import { Module } from "@nestjs/common";
import { LegalController } from "./legal.controller";

/**
 * Public legal pages required by the Google Play listing (privacy notice + account/data deletion).
 * Controller-only — the copy is static, so there is no service, no dependency and nothing to inject.
 * See `legal.content.ts` for why these live in the API rather than on a marketing site.
 */
@Module({ controllers: [LegalController] })
export class LegalModule {}
