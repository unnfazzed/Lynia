import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { DiditKycVendor } from "./didit-kyc-vendor";
import { StubKycVendor } from "./kyc-vendor";
import { selectKycVendor } from "./kyc.module";

describe("selectKycVendor (KYC-R26-04)", () => {
  const env = (over: Partial<Env>) => ({ KYC_PROVIDER: "didit", KYC_MODE: "auto", NODE_ENV: "development", ...over }) as Env;

  it("picks Didit when it has a key", () => {
    expect(selectKycVendor(env({ DIDIT_API_KEY: "k" }))).toBeInstanceOf(DiditKycVendor);
  });

  it("refuses to boot production auto-mode Didit with no key — never a silent stub", () => {
    expect(() => selectKycVendor(env({ NODE_ENV: "production" }))).toThrow(/DIDIT_API_KEY/);
  });

  it("keeps the logged stub fallback outside production, and in manual mode (no session is ever minted)", () => {
    expect(selectKycVendor(env({}))).toBeInstanceOf(StubKycVendor);
    expect(selectKycVendor(env({ NODE_ENV: "production", KYC_MODE: "manual" }))).toBeInstanceOf(StubKycVendor);
  });

  it("the stub provider is unchanged", () => {
    expect(selectKycVendor(env({ KYC_PROVIDER: "stub" }))).toBeInstanceOf(StubKycVendor);
  });
});
