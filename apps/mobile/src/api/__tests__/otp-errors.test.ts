import { __resetReachability } from "../../net/reachability";
import { requestOtp, verifyOtp } from "../auth";

/**
 * C-9 (start-up review 2026-10-06): the sign-in screens branch on what the API says, not on its words.
 * The ApiError a failed OTP call raises carries the body's reason code and, on a rate limit, the
 * `retryAfter` seconds the app turns into "Try again in N min".
 */

function makeResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) } as unknown as Response;
}

let fetchMock: jest.Mock;
beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => __resetReachability());

describe("OTP errors reach the screens with their code and wait", () => {
  it("a send-limit 429 carries otp_send_limit and retryAfter", async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse(429, { statusCode: 429, message: "Too many requests — try again later", reason: "otp_send_limit", retryAfter: 1200 }),
    );
    await expect(requestOtp("+263772451180")).rejects.toMatchObject({
      status: 429,
      code: "otp_send_limit",
      retryAfter: 1200,
      message: "Too many requests — try again later",
    });
  });

  it("a verify 401 carries its reason code", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(401, { statusCode: 401, message: "Code expired or never requested", reason: "otp_expired" }));
    await expect(verifyOtp("+263772451180", "123456")).rejects.toMatchObject({ status: 401, code: "otp_expired", retryAfter: null });
  });

  it("an older API's bare-string 429 body still shows its own words", async () => {
    fetchMock.mockResolvedValueOnce(makeResponse(429, JSON.stringify("Too many requests — try again later")));
    await expect(requestOtp("+263772451180")).rejects.toMatchObject({ status: 429, message: "Too many requests — try again later", retryAfter: null });
  });
});
