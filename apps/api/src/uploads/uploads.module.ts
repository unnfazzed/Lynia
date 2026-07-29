import { Module } from "@nestjs/common";
import { MerchantModule } from "../merchant/merchant.module";
import { UploadsController } from "./uploads.controller";

/** Client-direct uploads via signed URLs. The STORAGE adapter is @Global, so no import is needed.
 *  MerchantModule is imported only for its exported RestaurantsEnabledGuard/MerchantGuard, reused
 *  on the merchant dish/banner photo mints (D-32) so the Restaurants kill switch covers uploads too. */
@Module({ imports: [MerchantModule], controllers: [UploadsController] })
export class UploadsModule {}
