import { pushToast, type ToastMessage } from "../Toast";

const msg = (id: number, text = `t${id}`): ToastMessage => ({ id, text, tone: "info" });

describe("pushToast", () => {
  it("puts the newest at the head", () => {
    const q = pushToast([msg(1)], msg(2));
    expect(q[0]?.id).toBe(2);
    expect(q[1]?.id).toBe(1);
  });

  it("caps the queue so a burst can't stack endlessly", () => {
    let q: ToastMessage[] = [];
    for (let i = 1; i <= 6; i++) q = pushToast(q, msg(i));
    expect(q.length).toBe(3);
    // Newest three survive.
    expect(q.map((m) => m.id)).toEqual([6, 5, 4]);
  });

  it("de-dupes by id (re-raising the same id floats it, doesn't duplicate)", () => {
    const q = pushToast([msg(1), msg(2)], msg(2));
    expect(q.filter((m) => m.id === 2).length).toBe(1);
    expect(q[0]?.id).toBe(2);
  });

  it("respects a custom max", () => {
    const q = pushToast([msg(1), msg(2)], msg(3), 2);
    expect(q.length).toBe(2);
    expect(q.map((m) => m.id)).toEqual([3, 1]);
  });
});
