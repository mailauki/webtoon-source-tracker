import { ShellSkeleton } from "@/components/app-shell";
import {
  BackLink,
  CardGridSkeleton,
  HeadingSkeleton,
} from "@/components/skeletons";

export default function TagLoading() {
  return (
    <ShellSkeleton secondaryRow={<BackLink href="/discover" label="Discover" />}>
      <div className="grid gap-6">
        <HeadingSkeleton title="w-48" />
        <CardGridSkeleton />
      </div>
    </ShellSkeleton>
  );
}
