import { SkeletonBlock } from "@/components/ui/states";

export default function ProjectLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-28" />
      <div className="grid gap-3 lg:grid-cols-3">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
      </div>
    </div>
  );
}
