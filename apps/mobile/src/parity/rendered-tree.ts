/**
 * App-side half of the rendered-conformance normal form: react-test-renderer JSON → the same
 * { role, text, children } shape the mock extractor produces (tools/parity/lib/rendered-tree.mjs).
 *
 * Only the RENDERER-specific classification lives here. Pruning, collapsing, text flattening and
 * grouping are imported from the shared module, so the side that writes the expectation and the side
 * that checks it can never normalize differently.
 */

export type RawNode =
  | { role: "text"; text: string }
  | { role: "image"; text?: string }
  | { role: "input"; text?: string }
  | { role: "container"; children: RawNode[] };

/** A react-test-renderer JSON node (the shape `renderer.create(...).toJSON()` returns). */
export interface TestNode {
  type: string;
  props: Record<string, unknown>;
  children: (TestNode | string)[] | null;
}

/** RN host types that carry copy. `Text` is the RN primitive; `RCTText` is the older host name. */
const TEXT_TYPES = new Set(["Text", "RCTText", "RCTVirtualText"]);
const INPUT_TYPES = new Set(["TextInput", "RCTTextInput", "AndroidTextInput"]);
/** Replaced content: an <Image>, or anything react-native-svg / lucide draws (icons, maps). */
const IMAGE_TYPES = new Set(["Image", "RCTImageView", "Svg", "SvgUri", "ActivityIndicator"]);
const IMAGE_PREFIXES = ["RNSVG", "AIRMap", "RNCMap"];

function isImageType(type: string): boolean {
  return IMAGE_TYPES.has(type) || IMAGE_PREFIXES.some((p) => type.startsWith(p));
}

/** Concatenate every string descendant — a <Text> may nest <Text> for inline emphasis. */
function textOf(node: TestNode | string): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (!node || !node.children) return "";
  return node.children.map(textOf).join("");
}

function firstString(...vals: unknown[]): string | undefined {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return undefined;
}

/**
 * Walk the test tree into the raw normal form. Nodes the RN renderer emits but the user never sees
 * (a `display:none` style, an unrendered Modal) are dropped.
 */
export function fromTestTree(node: TestNode | string | null | undefined): RawNode | null {
  if (node == null || typeof node === "boolean") return null;
  if (typeof node === "string" || typeof node === "number") {
    return { role: "text", text: String(node) };
  }
  const type = String(node.type || "");
  const props = node.props || {};

  const style = flattenStyle(props.style);
  if (style.display === "none") return null;
  // A Modal only paints when visible; RN still renders it into the tree.
  if (type === "Modal" && props.visible === false) return null;

  if (INPUT_TYPES.has(type)) {
    const t = firstString(props.value, props.placeholder);
    return t ? { role: "input", text: t } : { role: "input" };
  }
  if (TEXT_TYPES.has(type)) {
    const t = textOf(node);
    return t.trim() ? { role: "text", text: t } : null;
  }
  if (isImageType(type)) {
    const t = firstString(props.accessibilityLabel, props["aria-label"]);
    return t ? { role: "image", text: t } : { role: "image" };
  }

  const children: RawNode[] = [];
  for (const c of node.children || []) {
    const k = fromTestTree(c);
    if (k) children.push(k);
  }
  return { role: "container", children };
}

type StyleLike = Record<string, unknown> | StyleLike[] | null | undefined | false;

function flattenStyle(style: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const visit = (s: StyleLike): void => {
    if (!s) return;
    if (Array.isArray(s)) {
      s.forEach(visit);
      return;
    }
    Object.assign(out, s);
  };
  visit(style as StyleLike);
  return out;
}
