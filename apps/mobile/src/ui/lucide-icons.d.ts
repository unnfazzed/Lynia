/**
 * Ambient types for the lucide-react-native deep per-icon imports in ./Icon.tsx.
 *
 * Icon.tsx imports each glyph from its own file (dist/cjs/icons/<name>.js) so Metro bundles only the
 * used icons instead of the whole barrel (see the note there). Those files are real and resolve at
 * runtime, but they sit OUTSIDE the package's `exports` map — which declares only ".", "./icons" and
 * "./icons/*" — so under `moduleResolution: "bundler"` TypeScript refuses the deep dist path (TS2307).
 *
 * Every icon module default-exports a LucideIcon component, so declare that shape once with a wildcard
 * module. This types the deep imports without pulling the barrel's ~1,600-glyph declaration file into
 * the program, and keeps the icon list in Icon.tsx fully type-checked against `Record<_, LucideIcon>`.
 */
declare module "lucide-react-native/dist/cjs/icons/*" {
  import type { LucideIcon } from "lucide-react-native";
  const icon: LucideIcon;
  export default icon;
}
