import { PageSkeleton } from "../components/skeletons";

// Route-level loading state for the audit viewer (When / Action / Target / By / Reason).
export default function Loading() {
  return <PageSkeleton title="Audit" cols={5} />;
}
