import { PageSkeleton } from "../components/skeletons";

// Route-level loading state: the orders monitor is a server component awaiting adminFetchResult, so on
// weak connectivity it otherwise renders a blank page during the fetch. Show the shared table skeleton
// instead (title + cols mirror the loaded page, so the skeleton doesn't reflow into a different shape).
export default function Loading() {
  return <PageSkeleton title="Orders" cols={9} />;
}
