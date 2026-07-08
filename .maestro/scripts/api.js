// Shared HTTP helpers for the "invisible counterparty" — the other side of a bid/counterbid that a
// single emulator can't drive live. Flows call these from `runScript` steps to act as the customer or
// rider via the real API (never a UI), using the same "vendor-free QA testing" bypass documented in
// docs/PILOT-READINESS.md: OTP_CHANNEL=console + an OTP_TEST_PHONES allowlist returns the OTP in the
// /auth/otp/request response instead of sending it over WhatsApp, so a script can sign in headlessly.
//
// Requires Maestro's `http` global (http.get/http.post/... -> { ok, status, body }, body is a string).
// If your Maestro version's JS engine doesn't expose `http`, replace these with `fetch` — the request
// shapes below stay the same either way.

function apiUrl(path) {
  const base = (typeof API_URL !== "undefined" && API_URL) || "https://lyniago.lyniafinance.com";
  return base.replace(/\/$/, "") + path;
}

function req(method, path, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const res = http[method](apiUrl(path), {
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = res.body ? JSON.parse(res.body) : null;
  if (res.status >= 400) {
    throw new Error(method.toUpperCase() + " " + path + " -> " + res.status + ": " + res.body);
  }
  return parsed;
}

// Signs in a QA-allowlisted test phone number headlessly (console OTP channel, no WhatsApp round
// trip) and returns an access token. `phone` MUST be one of the deploy's OTP_TEST_PHONES.
function signIn(phone) {
  const otp = req("post", "/auth/otp/request", null, { phone });
  if (!otp.devCode) {
    throw new Error(
      "No devCode returned for " + phone + " — the deploy isn't in QA test mode " +
      "(OTP_CHANNEL=console + phone in OTP_TEST_PHONES). See docs/PILOT-READINESS.md § " +
      "\"Vendor-free QA testing\".",
    );
  }
  const verified = req("post", "/auth/otp/verify", null, { phone, code: otp.devCode });
  return verified.accessToken;
}

function getMe(token) {
  return req("get", "/auth/me", token);
}

// The most recent order the caller is a party to (either role), newest first — used instead of
// threading an order id from the UI thread into a script, since Maestro has no simple way to read a
// route param off the visible screen.
function latestOrder(token) {
  const history = req("get", "/orders/history", token);
  if (!history || history.length === 0) throw new Error("No orders in history for this account yet.");
  return history[0];
}

module.exports = { apiUrl, req, signIn, getMe, latestOrder };
