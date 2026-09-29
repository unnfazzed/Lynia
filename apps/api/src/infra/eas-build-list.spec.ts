import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * GUARDRAIL for `scripts/eas-build-list.mjs`, the one reader of `eas build:list --json`. It backs
 * mobile-ota.yml's preflight (does any installed binary share this update's runtime version?) and
 * eas-build-status.yml's recap.
 *
 * Why this is worth a spec: eas-cli 22.0.0 (2026-08-14) moved `runtimeVersion` to `runtime.version`
 * and `channel` to `updateChannel.name`. Both workflows install `eas-version: latest` and read the old
 * names, so the preflight found no runtime on any build for six weeks. On 2026-09-29 it refused an
 * update whose runtime (5d04edb3…) was exactly build 39's, and the OTA went out with the check
 * overridden. These tests pin the real shape the CLI prints today, and that "cannot read the list",
 * "no builds" and "a different runtime" each come out as a different answer.
 *
 * The script is ESM `.mjs` outside this package's rootDir, so it is loaded by runtime dynamic import
 * from a file:// URL, the same idiom `maps-key-doctor.spec.ts` uses.
 */
const SCRIPT = resolve(__dirname, "../../../../scripts/eas-build-list.mjs");

type Build = Record<string, unknown>;
type Preflight = { exitCode: number; log: string[]; summary: string[] };
type Lister = {
  runtimeOf: (b: unknown) => string | null;
  channelOf: (b: unknown) => string | null;
  parseBuildList: (text: unknown) => Build[] | null;
  normalizeBuilds: (builds: Build[]) => Build[];
  keyPaths: (value: unknown) => string[];
  preflight: (o: { builds: Build[] | null; channel: string; runtime: string; allowMismatch?: boolean }) => Preflight;
};

let lister: Lister;

beforeAll(async () => {
  lister = (await import(pathToFileURL(SCRIPT).href)) as Lister;
});

const RUNTIME_39 = "5d04edb326958a8369570363a043d52639cb37f6";

/**
 * Build 39 (the Closed testing build) as eas-cli 24.8.0 prints it with `build:list --json`: its
 * `BuildFragment` (build/graphql/types/Build.js), with null fields and `__typename` dropped by the
 * CLI's JSON sanitiser. The id, versions, runtime version, channel, profile, commit and dates are
 * build 39's real values from its Expo build record. Nested object ids, URLs, the fingerprint hash
 * and the metrics are placeholders, so nothing but `runtime.version` carries the runtime.
 */
const BUILD_39: Build = {
  id: "15e221af-dd22-45bb-a9f6-3dac0545acb4",
  status: "FINISHED",
  platform: "ANDROID",
  artifacts: {
    buildUrl: "https://expo.dev/artifacts/eas/placeholder-39.aab",
    applicationArchiveUrl: "https://expo.dev/artifacts/eas/placeholder-39.aab",
  },
  fingerprint: { id: "00000000-0000-4000-8000-000000000001", hash: "f".repeat(40) },
  initiatingActor: { id: "00000000-0000-4000-8000-000000000002", displayName: "GitHub App · @unnfazzed" },
  logFiles: ["https://storage.googleapis.com/placeholder-log.txt"],
  app: {
    id: "25b2785d-94e0-4ecc-9940-bd9f9d8eb27c",
    name: "LyniaGo",
    slug: "lynia",
    ownerAccount: { id: "00000000-0000-4000-8000-000000000003", name: "lyniago" },
  },
  updateChannel: { id: "00000000-0000-4000-8000-000000000004", name: "preview" },
  distribution: "STORE",
  buildProfile: "closed",
  appIdentifier: "zw.co.lynia",
  sdkVersion: "54.0.0",
  appVersion: "0.50.1",
  appBuildVersion: "39",
  runtime: { id: "00000000-0000-4000-8000-000000000005", version: RUNTIME_39 },
  gitCommitHash: "285caa85a47658b770879ae9f4ba094aa7328541",
  gitCommitMessage: "fix(mobile): leave the EAS file secret out of the fingerprint so builds stop failing on a mismatch (SDK54-10) (#971)",
  priority: "NORMAL",
  createdAt: "2026-09-28T20:45:11.261Z",
  updatedAt: "2026-09-28T20:54:04.476Z",
  completedAt: "2026-09-28T20:54:04.254Z",
  expirationDate: "2026-10-28T20:45:11.316Z",
  isForIosSimulator: false,
  metrics: { buildWaitTime: 1, buildQueueTime: 1, buildDuration: 1 },
};

/** Another build in the same shape, with its own identity and runtime version. */
function like(id: string, appVersion: string, appBuildVersion: string, runtime: string): Build {
  return { ...BUILD_39, id, appVersion, appBuildVersion, runtime: { id: `${id}-runtime`, version: runtime } };
}

/** The finished builds on `preview` as of 2026-09-29, newest first (vc 37 and vc 36: real runtimes). */
const PREVIEW_BUILDS: Build[] = [
  BUILD_39,
  like("3c67f3ba-778b-4b38-b4ad-23b16c1b0237", "0.50.0", "37", "9cd880ef8e31f46c439938a39fad310a3a5ee8a0"),
  like("44538dd1-24ef-4c82-9954-dae8b8f3d989", "0.49.0", "36", "a2b0ceb0fbba32ceb1799a42c2c044135fc23a4d"),
];

/** What eas-cli 21 and earlier printed for the same build: flat `channel` and `runtimeVersion`. */
const BUILD_39_LEGACY: Build = {
  id: BUILD_39.id,
  status: "FINISHED",
  platform: "ANDROID",
  channel: "preview",
  buildProfile: "closed",
  appVersion: "0.50.1",
  appBuildVersion: "39",
  runtimeVersion: RUNTIME_39,
};

describe("the shape eas-cli prints today", () => {
  it("is not what the old readers looked for (the 2026-09-29 false refusal)", () => {
    // mobile-ota.yml's old one-liner, verbatim: every build, no runtime.
    expect(PREVIEW_BUILDS.map((b) => b.runtimeVersion).filter(Boolean)).toEqual([]);
    // eas-build-status.yml's old jq read `.channel` the same way.
    expect(PREVIEW_BUILDS.map((b) => b.channel).filter(Boolean)).toEqual([]);
  });

  it("is read by runtimeOf and channelOf", () => {
    expect(lister.runtimeOf(BUILD_39)).toBe(RUNTIME_39);
    expect(lister.channelOf(BUILD_39)).toBe("preview");
  });
});

describe("runtimeOf / channelOf", () => {
  it("still read the flat fields of eas-cli 21 and earlier", () => {
    expect(lister.runtimeOf(BUILD_39_LEGACY)).toBe(RUNTIME_39);
    expect(lister.channelOf(BUILD_39_LEGACY)).toBe("preview");
  });

  it("prefer the nested field when a build carries both", () => {
    const both = { runtime: { version: "new" }, runtimeVersion: "old", updateChannel: { name: "new" }, channel: "old" };
    expect(lister.runtimeOf(both)).toBe("new");
    expect(lister.channelOf(both)).toBe("new");
  });

  it("answer null, never a guess, when there is nothing usable", () => {
    for (const b of [undefined, null, {}, { runtime: null }, { runtime: { version: "" } }, { runtimeVersion: 7 }]) {
      expect(lister.runtimeOf(b)).toBeNull();
    }
    expect(lister.channelOf({ updateChannel: {} })).toBeNull();
  });
});

describe("parseBuildList", () => {
  it("returns the array the CLI printed", () => {
    expect(lister.parseBuildList(JSON.stringify(PREVIEW_BUILDS, null, 2))).toEqual(PREVIEW_BUILDS);
    expect(lister.parseBuildList("[]")).toEqual([]);
  });

  it("returns null when there is nothing to read, so a failed command cannot pass as an empty list", () => {
    for (const text of ["", "  \n", "Error: not logged in", "{}", "null", undefined]) {
      expect(lister.parseBuildList(text)).toBeNull();
    }
  });
});

describe("normalizeBuilds (what eas-build-status.yml's jq reads)", () => {
  it("lifts the runtime and channel to the top level and keeps everything else", () => {
    const [b] = lister.normalizeBuilds([BUILD_39]);
    expect(b.runtimeVersion).toBe(RUNTIME_39);
    expect(b.channel).toBe("preview");
    expect(b.id).toBe(BUILD_39.id);
    expect(b.artifacts).toEqual(BUILD_39.artifacts);
  });

  it("adds no key for a value it cannot find, so jq's `// \"?\"` still shows the gap", () => {
    const serialized = JSON.parse(JSON.stringify(lister.normalizeBuilds([{ id: "errored-early", status: "ERRORED" }])));
    expect(serialized).toEqual([{ id: "errored-early", status: "ERRORED" }]);
  });
});

describe("preflight (mobile-ota.yml)", () => {
  const base = { builds: PREVIEW_BUILDS, channel: "preview", runtime: RUNTIME_39 };

  it("passes the 2026-09-29 update, which the old reader refused", () => {
    const r = lister.preflight(base);
    expect(r.exitCode).toBe(0);
    expect(r.log).toContain("eas build:list: 3 finished Android build(s) on 'preview', 3 with a runtime version.");
    expect(r.log.join("\n")).toContain(`Runtime version ${RUNTIME_39} matches vc 39 (v0.50.1) · 15e221af-dd22-45bb-a9f6-3dac0545acb4`);
    expect(r.summary).toContain(`  - \`${RUNTIME_39}\`: vc 39 (v0.50.1) · 15e221af-dd22-45bb-a9f6-3dac0545acb4`);
  });

  it("matches an older build too: any installed binary on the channel is a real target", () => {
    expect(lister.preflight({ ...base, runtime: "a2b0ceb0fbba32ceb1799a42c2c044135fc23a4d" }).exitCode).toBe(0);
  });

  it("refuses a runtime no build carries, and lists the ones it saw", () => {
    const r = lister.preflight({ ...base, runtime: "0".repeat(40) });
    expect(r.exitCode).toBe(1);
    expect(r.log.at(-1)).toMatch(/^::error::No finished build on channel 'preview' has runtime version 0{40}/);
    expect(r.summary.filter((l) => l.startsWith("  - `"))).toHaveLength(3);
    expect(r.summary.at(-1)).toBe("- Verdict: ❌ refused");
  });

  it("says 'no builds' when the channel has none, not 'a different runtime'", () => {
    const r = lister.preflight({ ...base, builds: [] });
    expect(r.exitCode).toBe(1);
    expect(r.log.at(-1)).toContain("found no finished Android build on channel 'preview'");
  });

  it("refuses when the list could not be read at all", () => {
    const r = lister.preflight({ ...base, builds: null });
    expect(r.exitCode).toBe(1);
    expect(r.log.at(-1)).toMatch(/^::error::Could not read `eas build:list` for channel 'preview'/);
    expect(r.summary).toContain("- Finished builds on this channel: _could not be read_");
  });

  it("names a shape change instead of reporting a mismatch, by key names only", () => {
    // The next rename: the runtime moves somewhere runtimeOf() does not look.
    const moved = PREVIEW_BUILDS.map(({ runtime, ...rest }) => ({ ...rest, runtimeInfo: runtime }));
    const r = lister.preflight({ ...base, builds: moved });
    const error = r.log.at(-1) ?? "";
    expect(r.exitCode).toBe(1);
    expect(error).toContain("returned 3 finished build(s) on 'preview', but none has a runtime version");
    expect(error).toContain("runtimeInfo.version");
    // Public log: the keys that locate the field, never a value (artifact URLs included).
    expect(error).not.toContain("expo.dev/artifacts");
    expect(error).not.toContain(RUNTIME_39);
  });

  it("publishes under allow_runtime_mismatch, and the warning still names what was not verified", () => {
    for (const builds of [null, [], PREVIEW_BUILDS]) {
      const r = lister.preflight({ ...base, builds, runtime: "0".repeat(40), allowMismatch: true });
      expect(r.exitCode).toBe(0);
      expect(r.log.at(-1)).toMatch(/^::warning::Publishing anyway because allow_runtime_mismatch=true\./);
      expect(r.summary.at(-1)).toBe("- Verdict: ⚠️ not verified; published under `allow_runtime_mismatch=true`");
    }
  });
});

describe("keyPaths", () => {
  it("names nested keys without their values", () => {
    expect(lister.keyPaths({ b: { d: 1, c: "x" }, a: [1, 2], e: null })).toEqual(["a[]", "b.c", "b.d", "e"]);
  });
});

/** The workflows call the CLI, so its arguments, stdin, exit code and summary are pinned too. */
describe("the command line", () => {
  function run(args: string[], input: string, env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env } });
  }

  it("preflight: exit 0 on a match, and the step summary is appended", () => {
    const summaryFile = join(mkdtempSync(join(tmpdir(), "eas-build-list-")), "summary.md");
    const r = run(["preflight", "--channel", "preview", "--runtime", RUNTIME_39, "--allow-mismatch", "false"], JSON.stringify(PREVIEW_BUILDS), {
      GITHUB_STEP_SUMMARY: summaryFile,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("The update can land.");
    expect(readFileSync(summaryFile, "utf8")).toContain("- Verdict: ✅ matches vc 39 (v0.50.1)");
  });

  it("preflight: exit 1 on empty stdin (the command failed) and on a mismatch", () => {
    expect(run(["preflight", "--channel", "preview", "--runtime", RUNTIME_39], "").status).toBe(1);
    expect(run(["preflight", "--channel", "preview", "--runtime", "0".repeat(40)], JSON.stringify(PREVIEW_BUILDS)).status).toBe(1);
  });

  it("preflight: refuses to run without a channel and a runtime", () => {
    expect(run(["preflight", "--channel", "preview"], JSON.stringify(PREVIEW_BUILDS)).status).toBe(1);
  });

  it("normalize: prints the flattened list, and exits 1 on a list it cannot read", () => {
    const r = run(["normalize"], JSON.stringify(PREVIEW_BUILDS));
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout) as Build[];
    expect(out.map((b) => [b.channel, b.runtimeVersion])).toEqual([
      ["preview", RUNTIME_39],
      ["preview", "9cd880ef8e31f46c439938a39fad310a3a5ee8a0"],
      ["preview", "a2b0ceb0fbba32ceb1799a42c2c044135fc23a4d"],
    ]);
    expect(run(["normalize"], "").status).toBe(1);
  });

  it("normalize: warns, by key names, when no build has a runtime it can find", () => {
    const r = run(["normalize"], JSON.stringify([{ id: "x", status: "FINISHED", runtimeInfo: { version: "v" } }]));
    expect(r.status).toBe(0);
    expect(r.stderr).toContain("::warning::None of the 1 builds has a runtime version");
    expect(r.stderr).toContain("runtimeInfo.version");
  });
});
