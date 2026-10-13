import { PageSkeleton } from "../components/skeletons";

// Route-level loading state for the search results.
export default function Loading() {
  return <PageSkeleton title="Search" cols={2} />;
}
