import { PageSkeleton } from "../../components/skeletons";

// Route-level loading state: the call list is a server component awaiting adminFetchResult, so on weak
// connectivity it otherwise renders a blank page during the fetch.
export default function Loading() {
  return <PageSkeleton title="Orders to confirm" cols={5} />;
}
