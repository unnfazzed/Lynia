/**
 * Boot-graph-safe design-token entrypoint (MOB-BOOT-03-SIB-2) — `@lynia/shared/tokens`.
 *
 * The package barrel (`./index`) re-exports `contracts.ts`, so ANY value import from
 * `"@lynia/shared"` constructs all of the zod API schemas at module evaluation — ~202 KB / 41
 * modules on the mobile app's launch path, paid to read hex colour values. This entry re-exports
 * ONLY the (dependency-free) design tokens, so token consumers never touch zod.
 *
 * Import shape is identical to the barrel's (`import { tokens } from "@lynia/shared/tokens"`), so
 * repointing a consumer is a specifier-only change. Resolution is wired three ways because Metro
 * runs WITHOUT package `exports` (see apps/mobile/metro.config.js): the `./tokens` exports entry
 * (node/jest/vitest/webpack), the committed root `tokens.js`/`tokens.d.ts` shims (Metro, which
 * resolves `@lynia/shared/tokens` as a plain package-relative path), and the mobile tsconfig
 * `paths` mapping (typecheck).
 */
export * as tokens from "./design-tokens";
