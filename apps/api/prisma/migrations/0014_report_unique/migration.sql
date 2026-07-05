-- One report per (order, reporter, subject) — eng-review P2: without this a party can inflate the
-- other's fault count by re-reporting the same trip. Re-reporting upserts. (order_id is always set on
-- the report path; NULLs would be distinct under Postgres, which is fine — those aren't order-scoped.)
CREATE UNIQUE INDEX "reports_order_id_reporter_profile_id_subject_profile_id_key"
  ON "reports"("order_id", "reporter_profile_id", "subject_profile_id");
