import { ShellSkeleton } from "@/components/app-shell";
import {
  BackLink,
  CardGridSkeleton,
  HeadingSkeleton,
} from "@/components/skeletons";

export default function MyCollectionLoading() {
  return (
    <ShellSkeleton secondaryRow={<BackLink href="/discover" label="Discover" />}>
      <div className="grid gap-6">
        <HeadingSkeleton title="w-56" line="w-64" />
        <CardGridSkeleton count={5} />
      </div>
    </ShellSkeleton>
  );
}
