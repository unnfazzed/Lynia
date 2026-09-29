#!/usr/bin/env node
/**
 * Reads `eas build:list --json`. This is the one place in the repo that knows the shape of a build
 * in that output.
 *
 * WHY THIS EXISTS
 * eas-cli 22.0.0 (2026-08-14) changed the build object `eas build:list --json` prints: the top-level
 * `runtimeVersion` and `channel` fields became `runtime { version }` and `updateChannel { name }`.
 * The two workflows that read them install `eas-version: latest` and kept reading the old names. A
 * missing field reads as "no value", not as an error, so nothing failed loudly:
 *
 *   - mobile-ota.yml's preflight found no runtime version on any build. From then on every OTA
 *     either failed with a false "no finished build has this runtime version" or went out under
 *     `allow_runtime_mismatch=true`, which turns the check off. On 2026-09-29 the update computed
 *     5d04edb3… and build 15e221af (vc 39, channel preview) carried exactly 5d04edb3…, and the
 *     preflight still said no.
 *   - eas-build-status.yml printed `channel=?` and `runtime=?` for every build.
 *
 * So this reads both shapes. It also tells apart three answers that used to print the same: no
 * builds at all, builds whose runtime version it cannot find (the shape moved again), and builds
 * whose runtime version is a different one.
 *
 * USAGE (the CLI's JSON on stdin)
 *   node scripts/eas-build-list.mjs normalize
 *       Prints the same array with top-level `runtimeVersion` and `channel` filled in from whichever
 *       shape the CLI used. eas-build-status.yml's jq recaps read those two fields.
 *   node scripts/eas-build-list.mjs preflight --channel <name> --runtime <version> [--allow-mismatch true]
 *       mobile-ota.yml's check that an update can reach an installed binary. Exits 0 to publish and
 *       1 to refuse. Empty stdin means `eas build:list` itself failed, and that refuses too.
 *
 * The only values printed from a build are its id, runtime version, channel and version numbers.
 * The objects also carry artifact download URLs, and this repo's Actions logs are public, so a build
 * this cannot read is described by its key names only.
 */
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The runtime version a build was made with: `runtime.version` (eas-cli ≥ 22) or `runtimeVersion` (older). */
export function runtimeOf(build) {
  const v = build?.runtime?.version ?? build?.runtimeVersion;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** The update channel a build points at: `updateChannel.name` (eas-cli ≥ 22) or `channel` (older). */
export function channelOf(build) {
  const v = build?.updateChannel?.name ?? build?.channel;
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * The CLI's stdout → an array of builds, or null when there is nothing to read: no output (the
 * command failed) or output that is not a JSON array.
 */
export function parseBuildList(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Each build with top-level `runtimeVersion` and `channel`, whichever shape it arrived in. */
export function normalizeBuilds(builds) {
  return builds.map((b) => ({ ...b, runtimeVersion: runtimeOf(b) ?? undefined, channel: channelOf(b) ?? undefined }));
}

/** A value's dotted key paths, sorted. Describes a build this cannot read without printing its values. */
export function keyPaths(value, prefix = "") {
  if (Array.isArray(value)) return [`${prefix}[]`];
  if (value === null || typeof value !== "object") return prefix ? [prefix] : [];
  return Object.keys(value)
    .sort()
    .flatMap((k) => keyPaths(value[k], prefix ? `${prefix}.${k}` : k));
}

/** "vc 39 (v0.50.1) · 15e221af-…": how a build is named in the log. */
function describe(build) {
  const version = [build?.appBuildVersion && `vc ${build.appBuildVersion}`, build?.appVersion && `(v${build.appVersion})`]
    .filter(Boolean)
    .join(" ");
  return [version, build?.id].filter(Boolean).join(" · ") || "(no id)";
}

/**
 * mobile-ota.yml's reachability check. An `eas update` that no installed binary can take still
 * SUCCEEDS: the CLI exits 0 and not one phone downloads it. So the preflight refuses unless a
 * finished build on the channel carries the runtime version about to be published.
 *
 * Any answer other than a match refuses, and names which case it is. `allowMismatch` turns the
 * refusal into a warning, for an operator who has checked the target some other way, and the warning
 * still names the case it overrode.
 *
 * `builds` is the parsed list, or null when it could not be read. Returns the log lines (GitHub
 * workflow commands included), the step-summary markdown and the exit code.
 */
export function preflight({ builds, channel, runtime, allowMismatch = false }) {
  const log = [];
  const withRuntime = (builds ?? []).filter((b) => runtimeOf(b) !== null);
  // Newest first, as the CLI lists them: the first build seen with each runtime version names it.
  const byRuntime = new Map();
  for (const b of withRuntime) if (!byRuntime.has(runtimeOf(b))) byRuntime.set(runtimeOf(b), b);

  const summary = ["### OTA preflight", "", `- Channel: \`${channel}\``, `- Runtime version to publish: \`${runtime}\``];
  if (builds === null) {
    summary.push("- Finished builds on this channel: _could not be read_");
  } else {
    summary.push(`- Finished builds on this channel: ${builds.length} (${withRuntime.length} with a runtime version)`);
    summary.push("- Runtime versions of finished builds on this channel:");
    if (byRuntime.size === 0) summary.push("  - _(none found)_");
    for (const [version, b] of byRuntime) summary.push(`  - \`${version}\`: ${describe(b)}`);
  }

  if (builds !== null) {
    log.push(`eas build:list: ${builds.length} finished Android build(s) on '${channel}', ${withRuntime.length} with a runtime version.`);
  }

  const match = byRuntime.get(runtime);
  if (match) {
    log.push(`Runtime version ${runtime} matches ${describe(match)} on '${channel}'. The update can land.`);
    summary.push(`- Verdict: ✅ matches ${describe(match)}`);
    return { exitCode: 0, log, summary };
  }

  let problem;
  if (builds === null) {
    problem =
      `Could not read \`eas build:list\` for channel '${channel}': the command failed (its stderr is above) or printed no JSON array. ` +
      `No build's runtime version was checked.`;
  } else if (builds.length === 0) {
    problem =
      `\`eas build:list\` found no finished Android build on channel '${channel}', so no installed binary can take this update. ` +
      `Ship a binary on this channel first (mobile-release.yml).`;
  } else if (withRuntime.length === 0) {
    problem =
      `\`eas build:list\` returned ${builds.length} finished build(s) on '${channel}', but none has a runtime version where scripts/eas-build-list.mjs looks for one. ` +
      `The CLI's JSON shape has probably changed again (eas-cli 22 moved it from \`runtimeVersion\` to \`runtime.version\`); fix runtimeOf(). ` +
      `Keys on the newest build: ${keyPaths(builds[0]).join(" ")}`;
  } else {
    problem =
      `No finished build on channel '${channel}' has runtime version ${runtime}, so this update would be ignored by every installed binary. ` +
      "The usual cause is a version bump since the installed build was made (`version` is hashed into the fingerprint runtimeVersion) " +
      "or a native/dependency change. Both require a new store build via mobile-release.yml.";
  }

  if (allowMismatch) {
    log.push(`::warning::Publishing anyway because allow_runtime_mismatch=true. This update may reach zero devices. ${problem}`);
    summary.push("- Verdict: ⚠️ not verified; published under `allow_runtime_mismatch=true`");
    return { exitCode: 0, log, summary };
  }
  log.push(`::error::${problem} Re-dispatch with allow_runtime_mismatch=true only if you know which binaries you are targeting.`);
  summary.push("- Verdict: ❌ refused");
  return { exitCode: 1, log, summary };
}

/** `--name value` pairs → an object. */
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith("--")) {
      args[argv[i].slice(2)] = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return args;
}

function main(argv) {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  if (command !== "normalize" && command !== "preflight") {
    console.error("usage: eas-build-list.mjs normalize | preflight --channel <name> --runtime <version> [--allow-mismatch true]");
    return 1;
  }
  if (command === "preflight" && (!args.channel || !args.runtime)) {
    console.error("::error::preflight needs --channel and --runtime.");
    return 1;
  }
  const builds = parseBuildList(readFileSync(0, "utf8"));

  if (command === "normalize") {
    if (builds === null) {
      console.error("::error::eas build:list printed no JSON array, so there is nothing to normalize.");
      return 1;
    }
    const normalized = normalizeBuilds(builds);
    if (normalized.length > 0 && normalized.every((b) => b.runtimeVersion === undefined)) {
      // Not fatal here (the status lane still prints what it can), but the same drift the preflight
      // refuses on, so say so with the keys that would fix it.
      console.error(
        `::warning::None of the ${normalized.length} builds has a runtime version where scripts/eas-build-list.mjs looks for one. ` +
          `Keys on the newest build: ${keyPaths(builds[0]).join(" ")}`,
      );
    }
    process.stdout.write(`${JSON.stringify(normalized, null, 2)}\n`);
    return 0;
  }

  const result = preflight({
    builds,
    channel: args.channel,
    runtime: args.runtime,
    allowMismatch: args["allow-mismatch"] === "true",
  });
  for (const line of result.log) console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${result.summary.join("\n")}\n`);
  return result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
