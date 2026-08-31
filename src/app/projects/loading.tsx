import { SkeletonBlock } from "@/components/ui/states";

export default function ProjectsLoading() {
  return (
    <div className="space-y-4">
      <SkeletonBlock className="h-10 w-48" />
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-64" />
    </div>
  );
}
