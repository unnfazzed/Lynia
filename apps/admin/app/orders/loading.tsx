import { PageSkeleton } from "../components/skeletons";

// Route-level loading state: the orders monitor is a server component awaiting adminFetchResult, so on
// weak connectivity it otherwise renders a blank page during the fetch. Show the shared table skeleton
// instead (cols = the monitor's 5 columns).
export default function Loading() {
  return <PageSkeleton title="Orders monitor" cols={5} />;
}
