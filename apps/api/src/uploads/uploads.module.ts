import { Module } from "@nestjs/common";
import { UploadsController } from "./uploads.controller";

/** Client-direct uploads via signed URLs. The STORAGE adapter is @Global, so no import is needed. */
@Module({ controllers: [UploadsController] })
export class UploadsModule {}
