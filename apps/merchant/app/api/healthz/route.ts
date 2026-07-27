import { NextResponse } from "next/server";

/** Liveness probe for the future Cloud Run service (deploy wiring is P3). Static by design —
 *  this app has no DB/Redis of its own; real dependency health lives on the API's /healthz. */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok", app: "merchant" });
}
