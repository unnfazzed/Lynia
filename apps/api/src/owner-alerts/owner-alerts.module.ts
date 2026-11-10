import { Global, Module } from "@nestjs/common";
import { MerchantWhatsAppService } from "./merchant-whatsapp.service";
import { OwnerAlertsService } from "./owner-alerts.service";

/** The owner's phone alerts (Telegram) and the venue's new-order WhatsApp (Bird). Global, like NotificationsModule, so the auth, rider and order
 *  services inject it without import wiring. */
@Global()
@Module({
  providers: [OwnerAlertsService, MerchantWhatsAppService],
  exports: [OwnerAlertsService, MerchantWhatsAppService],
})
export class OwnerAlertsModule {}
