import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * Pixel-parity GUARDRAIL #4 — structural snapshot (CLAUDE.md "Pixel parity": "structure is the
 * look"). Token-conformance proves VALUES match and screen-inventory proves the right screens EXIST,
 * but neither asserts the component TREE matches — which is what silently drifts when a screen is
 * hand-tweaked away from its mock. This guard closes that gap for the owner who codes from a phone
 * and cannot eyeball a diff: it compares two NORMALIZED component trees per codegen-adopted screen —
 *
 *   EXPECTED = the mock component transpiled to RN (tools/parity/codegen) → normalized to shape.
 *   ACTUAL   = the committed apps/mobile <screen>.view.tsx the app renders → normalized the same way.
 *
 * and fails with a readable TREE-PATH diff (e.g. `root>BOX[1]>BOX[0]: expected FIELD, got BOX`). The
 * normalized form keeps element kind (BOX/TEXT/DS-name), nesting, child order and a few structural
 * style axes (row / align-center / absolute / border / flex1) — NOT exact colours/px (token-conformance
 * owns those) and NOT text/handlers (a benign data change never reddens it).
 *
 * Because the view is a MECHANICAL function of the mock (codegen), a green snapshot is structural
 * parity BY CONSTRUCTION. Screens not listed in tools/parity/codegen/adopted.mjs are not visited —
 * the guard no-ops for them (allowlist-driven, like screen-inventory), so it only gates screens
 * actually adopted via codegen. As the 275-state sweep adopts more screens, they join adopted.mjs and
 * are gated here automatically.
 *
 * The engine is ESM-only and lives outside this package's rootDir (tools/parity/codegen), so it is
 * loaded by runtime dynamic import (a file:// URL from an absolute path) — the same approach
 * screen-inventory.spec.ts uses for the parity .mjs sources.
 */
const CODEGEN_DIR = resolve(__dirname, "../../../../tools/parity/codegen");
const importCodegen = (file: string) => import(pathToFileURL(resolve(CODEGEN_DIR, file)).href);

type SnapshotResult = { key: string; screen: string; state: string | null; region?: string | null; composition?: boolean; ok: boolean; message: string; expected: string; actual: string | null; diff: string | null };

let results: SnapshotResult[];
let adopted: { key: string; states?: unknown[]; regions?: unknown[]; deferred?: unknown[] }[];
let units: { key: string; screen: string; state: string | null; region?: string | null; viewFile: string }[];
let deferred: { screen: string; state: string; key: string; reason: string }[];
let regionScreens: { key: string; mockComponent: string; regions: { region: string; componentName: string }[] }[];
let normalize: {
  treeOfViewFile: (ts: unknown, src: string) => unknown;
  treeOfMockFragment: (ts: unknown, src: string, comp: string, locator: unknown) => unknown;
  mockCompositionTree: (ts: unknown, src: string, comp: string, regions: unknown) => unknown;
  containerCompositionTree: (ts: unknown, src: string, regions: unknown) => unknown;
  sexpr: (n: unknown) => string;
  diff: (a: unknown, b: unknown) => string | null;
};

beforeAll(async () => {
  const snapshot = await importCodegen("snapshot.mjs");
  const registry = await importCodegen("adopted.mjs");
  normalize = await importCodegen("normalize.mjs");
  adopted = registry.ADOPTED;
  units = registry.expandAdopted();
  deferred = registry.deferredStates();
  regionScreens = registry.regionScreens();
  results = snapshot.checkAll(ts);
});

describe("parity structural snapshot · adopted screens match their mock by construction", () => {
  it("has a coherent adopted-screen registry (may be empty; then this guard no-ops)", () => {
    expect(Array.isArray(adopted)).toBe(true);
    for (const s of adopted) expect(typeof s.key).toBe("string");
  });

  it("every codegen-adopted state-view is structurally congruent with its mock", () => {
    // Join every failing view's tree-path message; compare to "" so a drift prints the readable
    // path (Vitest shows the non-empty "received" string) instead of a bare boolean. Multi-state
    // screens contribute one result PER adopted state (checkAll iterates expandAdopted()).
    const report = results.filter((r) => !r.ok).map((f) => f.message).join("\n\n");
    expect(report).toBe("");
  });
});

describe("parity structural snapshot · multi-state adoption model", () => {
  it("expands multi-state screens into one check unit per ADOPTED state", () => {
    // The food list is the proving screen — its `loading` + `error` states adopt; `empty`/`data` defer.
    const foodStates = units.filter((u) => u.screen === "RC.list").map((u) => u.state).sort();
    expect(foodStates).toEqual(["error", "loading"]);
    const foodDeferred = deferred.filter((d) => d.screen === "RC.list").map((d) => d.state).sort();
    expect(foodDeferred).toEqual(["data", "empty"]);
    // Every deferral carries a non-empty reason (honesty over volume — never a silent skip).
    for (const d of deferred) expect(d.reason.length).toBeGreaterThan(20);
  });

  it("every check unit has a state-scoped result (per-state congruence, not per-screen)", () => {
    for (const u of units) {
      const r = results.find((x) => x.key === u.key);
      expect(r, `no result for adopted unit ${u.key}`).toBeTruthy();
      expect(r!.screen).toBe(u.screen);
      expect(r!.state).toBe(u.state);
    }
  });
});

describe("parity structural snapshot · Bucket-C FlatList ≡ map equivalence", () => {
  const treeStr = (src: string) => normalize.sexpr(normalize.treeOfViewFile(ts, src));

  it("a FlatList with data/renderItem normalizes identically to the mock's {items.map(...)}", () => {
    const withFlatList = `function V() {
      return <View><FlatList data={xs} keyExtractor={(r) => r.id} renderItem={({ item }) => <Card><Text>{item.name}</Text></Card>} /></View>;
    }`;
    const withMap = `function V() {
      return <View>{xs.map((item) => <Card key={item.id}><Text>{item.name}</Text></Card>)}</View>;
    }`;
    // Both must reduce to the same tree: a virtualized list is a windowed map of the identical subtree.
    expect(treeStr(withFlatList)).toBe(treeStr(withMap));
    expect(treeStr(withFlatList)).toBe("BOX( MAP( CARD( TEXT ) ) )");
  });

  it("a FlatList's ListFooterComponent/header props do not leak into the mapped item subtree", () => {
    // Only the renderItem subtree is the MAP body — footer/header are app-only chrome (a loading
    // spinner), never part of the mock's `.map`, so they must not appear inside the MAP node.
    const src = `function V() {
      return <FlatList data={xs} renderItem={({ item }) => <Card><Text>{item}</Text></Card>} ListFooterComponent={<View><ActivityIndicator /></View>} />;
    }`;
    expect(treeStr(src)).toBe("MAP( CARD( TEXT ) )");
  });

  it("a renderItem with a block body (explicit return) resolves the same as a concise arrow", () => {
    const block = `function V() {
      return <FlatList data={xs} renderItem={({ item }) => { return <Card><Text>{item}</Text></Card>; }} />;
    }`;
    expect(treeStr(block)).toBe("MAP( CARD( TEXT ) )");
  });
});

describe("parity structural snapshot · structural-slot verification (Screen.banner)", () => {
  const treeStr = (src: string) => normalize.sexpr(normalize.treeOfViewFile(ts, src));
  const treeOf = (src: string) => normalize.treeOfViewFile(ts, src);

  it("folds a Screen's `banner` JSX slot into the tree as a LEADING child (else it is invisible)", () => {
    // normalize walks CHILDREN only, so a JSX-attribute slot would otherwise not appear in the tree.
    // The kit's Screen draws `banner` above the body, so it must normalize as the Screen's first child.
    const src = `function V() {
      return <Screen banner={<Banner tone="offline" title="You're offline" />}><View><Text>x</Text></View></Screen>;
    }`;
    expect(treeStr(src)).toBe("SCREEN( BANNER, BOX( TEXT ) )");
  });

  it("FAILS the snapshot when the view drops a banner the mock draws (the blind spot Foundation-C closes)", () => {
    // The exact regression the slot walk exists to catch: same body, but the view omits the banner the
    // mock carries. Before slot verification both reduced to `SCREEN( BOX( TEXT ) )` and passed; now the
    // missing leading BANNER child makes the trees diverge, so `diff` reports a mismatch (not null).
    const mock = `function Mock() {
      return <Screen banner={<Banner tone="offline" title="You're offline" />}><View><Text>x</Text></View></Screen>;
    }`;
    const viewMissingBanner = `function V() {
      return <Screen><View><Text>x</Text></View></Screen>;
    }`;
    const d = normalize.diff(treeOf(mock), treeOf(viewMissingBanner));
    expect(d).not.toBeNull();
    // The divergence is at the Screen node (a different child count / first child), not deeper.
    expect(d).toContain("SCREEN");
  });

  it("also FAILS when the banner is present but structurally wrong (a bare View, not a Banner)", () => {
    const mock = `function Mock() {
      return <Screen banner={<Banner tone="offline" title="x" />}><View /></Screen>;
    }`;
    const viewWrongBanner = `function V() {
      return <Screen banner={<View><Text>hand-rolled</Text></View>}><View /></Screen>;
    }`;
    const d = normalize.diff(treeOf(mock), treeOf(viewWrongBanner));
    expect(d).not.toBeNull(); // leading child is BANNER on the mock, BOX on the view → caught
  });

  it("stays a no-op for a Screen with no banner — existing call sites are unaffected", () => {
    const src = `function V() { return <Screen><View><Text>x</Text></View></Screen>; }`;
    expect(treeStr(src)).toBe("SCREEN( BOX( TEXT ) )");
  });
});

describe("parity structural snapshot · structural-slot verification (Screen.footer · Foundation-D)", () => {
  const treeStr = (src: string) => normalize.sexpr(normalize.treeOfViewFile(ts, src));
  const treeOf = (src: string) => normalize.treeOfViewFile(ts, src);

  it("folds a Screen's `footer` JSX slot into the tree as a TRAILING child (else it is invisible)", () => {
    // The kit's Screen pins `footer` below the body (…body → footer), so it must normalize as the
    // Screen's LAST child — after the body, mirroring how `banner` folds in as the first.
    const src = `function V() {
      return <Screen footer={<Button label="View cart" />}><View><Text>x</Text></View></Screen>;
    }`;
    expect(treeStr(src)).toBe("SCREEN( BOX( TEXT ), BUTTON )");
  });

  it("folds both banner (leading) and footer (trailing) around the body in order", () => {
    const src = `function V() {
      return <Screen banner={<Banner tone="offline" title="x" />} footer={<Button label="Go" />}><View /></Screen>;
    }`;
    expect(treeStr(src)).toBe("SCREEN( BANNER, BOX, BUTTON )");
  });

  it("FAILS the snapshot when the view drops a footer the mock draws (the cart/checkout pay bar)", () => {
    const mock = `function Mock() {
      return <Screen footer={<Button label="Go to checkout" />}><View><Text>x</Text></View></Screen>;
    }`;
    const viewMissingFooter = `function V() {
      return <Screen><View><Text>x</Text></View></Screen>;
    }`;
    const d = normalize.diff(treeOf(mock), treeOf(viewMissingFooter));
    expect(d).not.toBeNull();
    expect(d).toContain("SCREEN");
  });

  it("stays a no-op for a Screen with no footer — existing call sites are unaffected", () => {
    const src = `function V() { return <Screen><View><Text>x</Text></View></Screen>; }`;
    expect(treeStr(src)).toBe("SCREEN( BOX( TEXT ) )");
  });
});

describe("parity structural snapshot · region/fragment adoption model (Foundation-E)", () => {
  it("RC.menu is region-adopted — 3 congruent region fragments + a congruent composition check", () => {
    // The first INTERACTIVE container adopted piece-by-piece: a whole-screen generated view can't host
    // its live tabs/ItemSheet/RemindWhenOpen without regressing them, so each region is its own guarded
    // fragment and the container's assembly is verified by the composition check.
    const menuUnits = units.filter((u) => u.screen === "RC.menu");
    expect(menuUnits.map((u) => u.region).sort()).toEqual(["cover", "footer", "rows"]);
    for (const u of menuUnits) {
      const r = results.find((x) => x.key === u.key);
      expect(r, `no result for region unit ${u.key}`).toBeTruthy();
      expect(r!.region).toBe(u.region);
      expect(r!.ok, `region ${u.key} drifted: ${r!.message}`).toBe(true);
    }
    const comp = results.find((r) => r.screen === "RC.menu" && r.composition);
    expect(comp, "no composition result for RC.menu").toBeTruthy();
    expect(comp!.ok, `RC.menu composition drifted: ${comp!.message}`).toBe(true);
    // Scaffold boxes are TRANSPARENT to the composition reduce (2026-08-12): the check owns
    // region ORDER + the Screen banner/body/footer split, never incidental wrapper nesting.
    expect(comp!.expected).toBe("SCREEN( REGION:cover, REGION:rows, REGION:footer )");
  });

  it("every region-adopted screen has a composition result and all region views are gated", () => {
    for (const e of regionScreens) {
      const comp = results.find((r) => r.screen === e.key && r.composition);
      expect(comp, `no composition result for ${e.key}`).toBeTruthy();
      for (const rg of e.regions) {
        // A `compositionOnly` region (an app TWIN of a DS composite member, mounted directly) is
        // asserted by the composition check alone — it has no generated fragment view unit.
        const rawRegions = (adopted.find((a) => a.key === e.key)?.regions ?? []) as { region: string; compositionOnly?: boolean }[];
        if (rawRegions.find((x) => x.region === rg.region)?.compositionOnly) continue;
        const r = results.find((x) => x.key === `${e.key}#${rg.region}`);
        expect(r, `region ${e.key}#${rg.region} not gated`).toBeTruthy();
      }
    }
  });

  it("the backend-gated shop-header meta line is an honest NON-region deferral (not adopted)", () => {
    const d = deferred.find((x) => x.screen === "RC.menu");
    expect(d, "RC.menu meta deferral missing").toBeTruthy();
    expect(d!.state).toBe("meta");
    expect(d!.reason.length).toBeGreaterThan(20);
  });
});

describe("parity structural snapshot · composition check catches missing / reordered regions", () => {
  // A synthetic region-adopted screen: cover (element) + rows (map) in the body, bar (footer slot).
  const regions = [
    { region: "cover", locator: { el: "CoverPhoto" }, componentName: "CoverView" },
    { region: "rows", locator: { map: "Row" }, componentName: "RowsView" },
    { region: "bar", locator: { slot: "footer" }, componentName: "BarView" },
  ];
  const mockSrc = `
    RC.demo = () => (
      <Screen footer={<div><Button/></div>}>
        <div style={{ height: "100%" }}>
          <CoverPhoto height={90}><span>back</span></CoverPhoto>
          <div style={{ padding: 16 }}>
            <div>meta</div>
            {ITEMS.map((i) => <Row key={i} i={i} />)}
          </div>
        </div>
      </Screen>
    );
  `;
  const mockTree = () => normalize.mockCompositionTree(ts, mockSrc, "demo", regions);

  it("reduces the mock to its region anchors (scaffold + REGION leaves, glue pruned)", () => {
    expect(normalize.sexpr(mockTree())).toBe("SCREEN( REGION:cover, REGION:rows, REGION:bar )");
  });

  it("a container mounting the fragments in the mock's order/nesting is congruent", () => {
    const container = `export default function C() {
      return (
        <Screen footer={ok ? <BarView label="x" /> : null}>
          <ScrollView>
            <View style={{ margin: -16 }}><CoverView name="x" /></View>
            <View><Text>name</Text>{tabs}<RowsView rows={rows} /></View>
            <View style={{ height: 40 }} />
          </ScrollView>
          {open ? <Sheet /> : null}
        </Screen>
      );
    }`;
    const c = normalize.containerCompositionTree(ts, container, regions);
    expect(normalize.diff(mockTree(), c)).toBeNull();
  });

  it("FAILS when the container DROPS a region (the rows fragment is not mounted)", () => {
    const container = `export default function C() {
      return <Screen footer={<BarView />}><ScrollView><CoverView /></ScrollView></Screen>;
    }`;
    const c = normalize.containerCompositionTree(ts, container, regions);
    const d = normalize.diff(mockTree(), c);
    expect(d).not.toBeNull();
    // The body BOX now has one child (cover) where the mock has two (cover, rows) → a child-count diff.
    expect(d).toContain("SCREEN");
  });

  it("FAILS when the container REORDERS regions (rows mounted before cover)", () => {
    const container = `export default function C() {
      return <Screen footer={<BarView />}><ScrollView><RowsView /><CoverView /></ScrollView></Screen>;
    }`;
    const d = normalize.diff(mockTree(), normalize.containerCompositionTree(ts, container, regions));
    expect(d).not.toBeNull();
    expect(d).toContain("expected REGION:cover, got REGION:rows");
  });

  it("FAILS when a body region is mounted in the footer slot instead (assembly mistake)", () => {
    const container = `export default function C() {
      return <Screen footer={<RowsView />}><ScrollView><CoverView /></ScrollView></Screen>;
    }`;
    const d = normalize.diff(mockTree(), normalize.containerCompositionTree(ts, container, regions));
    expect(d).not.toBeNull();
  });
});

describe("parity structural snapshot · deferral teeth (owner instruction 2026-08-12)", () => {
  // Deferrals stopped being a free prose escape: this is the mechanism by which a screen's structural
  // check could be silently skipped while every guardrail stayed green (the RC.home drift shipped
  // through exactly this hole). Two teeth:
  //   1. RATCHET — the total deferral count must EQUAL the committed baseline
  //      (tools/parity/codegen/deferral-baseline.json). Adopting a state lowers it (update the file —
  //      visible, welcome); ADDING a deferral forces an explicit, reviewable baseline bump.
  //   2. PROVENANCE — every deferral must be traceable: its reason carries an explicit reference
  //      (deviations ledger / tracker / classification doc / issue or task number), or its screen is
  //      registered in docs/parity/ADOPTION-CLASSIFICATION.md, the per-screen classification of record.
  //      A drive-by one-liner with no anchor fails.
  const REF =
    /(docs\/DESIGN-DEVIATIONS\.md|docs\/parity\/ADOPTION-CLASSIFICATION\.md|docs\/PIXEL-PARITY-TRACKER\.md|docs\/KNOWN_BUGS\.md|#\d+|task #\d+|issue)/i;

  it("deferral count matches the committed baseline exactly (ratchet toward zero)", () => {
    const baseline = JSON.parse(readFileSync(resolve(CODEGEN_DIR, "deferral-baseline.json"), "utf8"));
    expect(deferred.length).toBe(baseline.count);
  });

  it("every deferral is traceable — an explicit reference or a registered screen", () => {
    const classification = readFileSync(resolve(CODEGEN_DIR, "../../../docs/parity/ADOPTION-CLASSIFICATION.md"), "utf8");
    const tracker = readFileSync(resolve(CODEGEN_DIR, "../../../docs/PIXEL-PARITY-TRACKER.md"), "utf8");
    const registered = (screenKey: string): boolean => {
      // `RC.pay_now` is registered as "RC.pay_now" (classification) or "`RC pay_now`" (tracker rows).
      const trackerForm = "`" + screenKey.replace(".", " ") + "`";
      return classification.includes(screenKey) || tracker.includes(trackerForm);
    };
    const offenders = deferred.filter((d) => {
      const reason = d.reason || "";
      if (reason.trim().length < 50) return true; // a real reason, not a shrug
      if (REF.test(reason)) return false;
      return !registered(d.screen) && !(d.key && registered(d.key));
    });
    expect(offenders.map((o) => `${o.screen} · ${o.state}`).join("\n")).toBe("");
  });
});
