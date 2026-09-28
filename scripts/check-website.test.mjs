// Tests for scripts/check-website.mjs — run with: node --test scripts/check-website.test.mjs
// Each case copies the handoff + deployed site into a temp repo, breaks one thing, and asserts the
// guard names it. No dependencies beyond Node itself.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { REPO_ROOT, applyLaunchEdits, checkWebsite } from "./check-website.mjs";

const HANDOFF = "packages/design/handoff/lyniago-website/site";
const SITE = "apps/website/site";
const temps = [];

function tempRepo() {
  const root = mkdtempSync(join(tmpdir(), "check-website-"));
  temps.push(root);
  cpSync(join(REPO_ROOT, HANDOFF), join(root, HANDOFF), { recursive: true });
  cpSync(join(REPO_ROOT, SITE), join(root, SITE), { recursive: true });
  return root;
}

const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(readFileSync(join(root, rel), "utf8")));
const git = (root, ...args) =>
  execFileSync("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args], { cwd: root, stdio: "pipe" });

afterEach(() => {
  while (temps.length) rmSync(temps.pop(), { recursive: true, force: true });
});

test("the committed site passes", () => {
  assert.deepEqual(checkWebsite(), []);
});

test("a design change to index.html beyond the launch edits fails", () => {
  const root = tempRepo();
  edit(root, `${SITE}/index.html`, (s) => s.replace("--yel:#FFD23F", "--yel:#FFD000"));
  const errors = checkWebsite({ root, write: true });
  assert.ok(errors.some((e) => e.includes("differs from the handoff")), errors.join("\n"));
});

test("an asset that is not byte-identical to the handoff fails", () => {
  const root = tempRepo();
  edit(root, `${SITE}/assets/illustrations/hours.svg`, (s) => s.replace("<svg", "<svg data-x=\"1\""));
  const errors = checkWebsite({ root });
  assert.ok(errors.some((e) => e.includes("hours.svg is not byte-identical")), errors.join("\n"));
});

test("a file outside the handoff and the allowlist fails", () => {
  const root = tempRepo();
  writeFileSync(join(root, SITE, "extra.html"), "<!DOCTYPE html><title>x</title>");
  const errors = checkWebsite({ root });
  assert.ok(errors.some((e) => e.includes("extra.html is not in the handoff")), errors.join("\n"));
});

test("a stale 404 page fails, and --write regenerates it", () => {
  const root = tempRepo();
  edit(root, `${SITE}/404.html`, (s) => s.replace("Back home", "Go home"));
  assert.ok(checkWebsite({ root }).some((e) => e.includes("404.html is out of date")));
  assert.deepEqual(checkWebsite({ root, write: true }), []);
});

test("a stale CSP hash fails, and --write repairs it", () => {
  const root = tempRepo();
  edit(root, `${SITE}/_headers`, (s) => s.replace(/'sha256-[^']+'/, "'sha256-AAAA'"));
  assert.ok(checkWebsite({ root }).some((e) => e.includes("script-src hashes")));
  assert.deepEqual(checkWebsite({ root, write: true }), []);
});

test("the CSP check sees scripts in any case, with attributes, and refuses external ones", () => {
  const root = tempRepo();
  edit(root, `${SITE}/404.html`, (s) => s.replace("</body>", '<SCRIPT type="module">go()</SCRIPT >\n</body>'));
  assert.ok(checkWebsite({ root }).some((e) => e.includes("script-src hashes")));
  edit(root, `${SITE}/404.html`, (s) => s.replace("</body>", '<script src="https://cdn.example/x.js"></script>\n</body>'));
  assert.ok(checkWebsite({ root }).some((e) => e.includes("external scripts are not expected")));
});

test("CSP hashes match what browsers hash: script text after CRLF -> LF", () => {
  const root = tempRepo();
  edit(root, `${SITE}/404.html`, (s) => s.replace(/\n/g, "\r\n"));
  const errors = checkWebsite({ root });
  assert.ok(!errors.some((e) => e.includes("script-src hashes")), errors.join("\n"));
});

test("markup the CSP would block fails; off-site <a> links do not", () => {
  const root = tempRepo();
  const inject = (markup) => edit(root, `${SITE}/404.html`, (s) => s.replace("</main>", `${markup}</main>`));
  inject('<button onclick="go()">x</button>');
  inject('<img src="https://cdn.example/x.png" alt="">');
  inject('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">');
  inject('<span style="background:url(https://cdn.example/bg.png)"></span>');
  inject('<iframe src="/embed"></iframe>');
  inject('<a href="javascript:void(0)">x</a>');
  inject('<a href="https://example.com/ok">fine</a>');
  const errors = checkWebsite({ root }).join("\n");
  for (const want of [
    "onclick=…> is an inline event handler",
    '<img src="https://cdn.example/x.png"> loads from another origin',
    '<link href="https://fonts.googleapis.com/css2?family=Inter"> loads from another origin',
    "CSS url(https://cdn.example/bg.png) loads from another origin",
    "<iframe> is not allowed",
    'href="javascript:…"> is blocked',
  ]) {
    assert.ok(errors.includes(want), `missing "${want}" in:\n${errors}`);
  }
  assert.ok(!errors.includes("example.com/ok"), errors);
});

test("launch edits are literal text and must match exactly once", () => {
  const edit = { id: "t", from: "X", to: "$&$'" };
  assert.equal(applyLaunchEdits("a X b", [edit]).html, "a $&$' b");
  assert.match(applyLaunchEdits("X X", [edit]).problems[0], /exactly once \(matched 2\)/);
  assert.match(applyLaunchEdits("none", [edit]).problems[0], /exactly once \(matched 0\)/);
});

test("a reference to a missing file fails", () => {
  const root = tempRepo();
  unlinkSync(join(root, HANDOFF, "assets/illustrations/price.svg"));
  unlinkSync(join(root, SITE, "assets/illustrations/price.svg"));
  const errors = checkWebsite({ root });
  assert.ok(errors.some((e) => e.includes('"assets/illustrations/price.svg" does not resolve')), errors.join("\n"));
});

test("editing an immutable asset in place fails; renaming it does not", () => {
  const root = tempRepo();
  git(root, "init", "-q");
  git(root, "add", "-A");
  git(root, "commit", "-qm", "base");
  // In place: same name, new bytes (in both copies, so parity alone would not catch it).
  for (const dir of [HANDOFF, SITE]) edit(root, `${dir}/assets/illustrations/hours.svg`, (s) => `${s}\n`);
  git(root, "commit", "-qam", "in place");
  assert.ok(checkWebsite({ root, baseRef: "HEAD~1" }).some((e) => e.includes("hours.svg was changed in place")));
  // A rename is how a changed asset ships.
  git(root, "reset", "-q", "--hard", "HEAD~1");
  git(root, "mv", `${SITE}/assets/og-image.png`, `${SITE}/assets/og-image-v2.png`);
  git(root, "commit", "-qm", "rename");
  assert.ok(!checkWebsite({ root, baseRef: "HEAD~1" }).some((e) => e.includes("changed in place")));
});
