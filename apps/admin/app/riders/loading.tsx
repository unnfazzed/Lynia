import { PageSkeleton } from "../components/skeletons";

// Route-level loading state: the KYC-review queue is a server component awaiting adminFetchResult, so on
// weak connectivity it otherwise renders a blank page during the fetch. Show the shared table skeleton
// instead (cols = the queue's 7 columns).
export default function Loading() {
  return <PageSkeleton title="Riders — KYC review" cols={7} />;
}
