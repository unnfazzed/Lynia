import { createLatestScoreSender } from "../latest-score";

/** A post whose calls resolve/reject by hand, in whatever order the test picks. */
function manualPost() {
  const calls: { score: number; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const post = (score: number) =>
    new Promise<void>((resolve, reject) => {
      calls.push({ score, resolve, reject });
    });
  return { post, calls };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

// Field report (2026-10-17): a biker tapped 1★ meaning 4★ and could not change it — the first tap
// sent and locked the stars. The stars now stay tappable; this keeps a change from racing the first send.
describe("createLatestScoreSender", () => {
  it("sends a change after the first send settles, so the last tap is what lands", async () => {
    const { post, calls } = manualPost();
    const landed: [number, boolean][] = [];
    const s = createLatestScoreSender(post, { landed: (n, more) => landed.push([n, more]), failed: () => {} });
    s.send(1);
    s.send(4);
    expect(calls.map((c) => c.score)).toEqual([1]);
    expect(s.busy()).toBe(true);
    calls[0]!.resolve();
    await flush();
    expect(calls.map((c) => c.score)).toEqual([1, 4]);
    calls[1]!.resolve();
    await flush();
    expect(landed).toEqual([
      [1, true],
      [4, false],
    ]);
    expect(s.busy()).toBe(false);
  });

  it("keeps only the latest tap made during a send", async () => {
    const { post, calls } = manualPost();
    const s = createLatestScoreSender(post, { landed: () => {}, failed: () => {} });
    s.send(1);
    s.send(2);
    s.send(5);
    calls[0]!.resolve();
    await flush();
    expect(calls.map((c) => c.score)).toEqual([1, 5]);
  });

  it("skips a held tap equal to the score that just landed", async () => {
    const { post, calls } = manualPost();
    const s = createLatestScoreSender(post, { landed: () => {}, failed: () => {} });
    s.send(3);
    s.send(4);
    s.send(3);
    calls[0]!.resolve();
    await flush();
    expect(calls.map((c) => c.score)).toEqual([3]);
  });

  it("reports a failure, and still sends a change tapped during the failed send", async () => {
    const { post, calls } = manualPost();
    const failed: [unknown, number, boolean][] = [];
    const s = createLatestScoreSender(post, { landed: () => {}, failed: (e, n, more) => failed.push([e, n, more]) });
    s.send(1);
    s.send(4);
    calls[0]!.reject("offline");
    await flush();
    expect(failed).toEqual([["offline", 1, true]]);
    expect(calls.map((c) => c.score)).toEqual([1, 4]);
  });
});
