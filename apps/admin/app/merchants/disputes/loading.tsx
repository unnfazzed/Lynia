import { PageSkeleton } from "../../components/skeletons";

// Route-level loading state: the disputes queue is a server component awaiting adminFetchResult,
// so on weak connectivity it otherwise renders a blank page during the fetch (cols = the frozen-
// handshakes table's 7 columns).
export default function Loading() {
  return <PageSkeleton title="Food disputes" cols={7} />;
}
