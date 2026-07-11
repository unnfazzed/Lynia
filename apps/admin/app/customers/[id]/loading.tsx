import { PageSkeleton } from "../../components/skeletons";

// Route-level loading state — see orders/[id]/loading.tsx for why this exists.
export default function Loading() {
  return <PageSkeleton title="Customer profile" cols={3} />;
}
