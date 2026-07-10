import { PageSkeleton } from "../../components/skeletons";

// Route-level loading state: the order detail page is a server component awaiting
// adminFetchResult (no-store), so on weak connectivity it otherwise renders a blank page for the
// full round trip — the exact "looks frozen" gap the list-page skeletons were added to avoid.
export default function Loading() {
  return <PageSkeleton title="Order detail" cols={3} />;
}
