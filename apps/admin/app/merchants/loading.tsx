import { PageSkeleton } from "../components/skeletons";

// Route-level loading state: the merchant directory is a server component awaiting
// adminFetchResult, so on weak connectivity it otherwise renders a blank page during the fetch
// (cols = the directory's 6 columns).
export default function Loading() {
  return <PageSkeleton title="Merchants" cols={6} />;
}
