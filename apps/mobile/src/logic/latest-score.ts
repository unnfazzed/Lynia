/**
 * A star rating the rater can change, sent so the LAST tap is the score the server keeps. One send at
 * a time: a change tapped while a send is in flight is held and sent once it settles — two sends in
 * flight could land out of order and leave the earlier score standing. Only the latest held tap is
 * kept, and it is skipped when it equals the score that just landed.
 *
 * `more` on the callbacks says another (newer) score is about to be sent, so the caller neither clears
 * its durable marker nor rolls the stars back for a send that is already superseded.
 */
export function createLatestScoreSender(
  post: (score: number) => Promise<unknown>,
  on: {
    landed: (score: number, more: boolean) => void;
    failed: (err: unknown, score: number, more: boolean) => void;
  },
): { send: (score: number) => void; busy: () => boolean } {
  let inFlight = false;
  let held: number | null = null;
  let last: number | null = null;
  const send = (score: number): void => {
    if (inFlight) {
      held = score;
      return;
    }
    inFlight = true;
    void post(score)
      .then(
        () => {
          last = score;
          on.landed(score, held != null);
        },
        (err) => on.failed(err, score, held != null),
      )
      .finally(() => {
        inFlight = false;
        const next = held;
        held = null;
        if (next != null && next !== last) send(next);
      });
  };
  return { send, busy: () => inFlight };
}
