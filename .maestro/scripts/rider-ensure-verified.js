// Precondition helper: make the QA rider account a VERIFIED rider over the API, idempotently, so a
// rider flow that needs online mode (03-view-rides, 04-bid, 05-counter-offer, 06-track-and-finish)
// passes when run ALONE against a fresh test phone — not only after 02-kyc has run first. Without this
// a brand-new rider account sits at the "Become a rider" gate and never reaches the online toggle.
//
// Mirrors exactly what app/rider/become.tsx does, minus the actual photo bytes: mint a KYC photo key
// (POST /uploads/kyc-photo returns key = `kyc/<profileId>/<uuid>` — becomeRider only checks that
// prefix, it does NOT verify an object was uploaded, see apps/api/src/riders/rider.service.ts:99) and
// POST /riders/become. With KYC_PROVIDER=stub (the vendor-free QA mode) become returns verified
// immediately. Run this BEFORE login-rider.yaml so the dashboard reads the verified state on first load.
//
// NOTE: this is the deliberate inverse of 02-kyc.yaml, which must see the un-verified "Become a rider"
// gate — so do NOT add this to the shared login-rider subflow, only to the flows that need online mode.
const { signIn, req, getMe } = require("./api.js");

const token = signIn(RIDER_PHONE);
const me = getMe(token);

if (me.rider && me.rider.kycStatus === "verified") {
  output.kycStatus = "verified";
} else {
  // Name + national ID must exist before become (the duplicate-ID guard reads the ID hash); harmless
  // to re-send for a returning account.
  req("patch", "/riders/profile", token, { firstName: "QA", lastName: "Rider", idNumber: "63-000000-R-00" });
  const upload = req("post", "/uploads/kyc-photo", token, { contentType: "image/jpeg" });
  const become = req("post", "/riders/become", token, { bikeReg: "ABZ 1234", photoUrl: upload.key });
  output.kycStatus = become.kycStatus;
}
