import {
  buildProjectRedirect,
  isUuid,
  projectHomePath,
} from "@/lib/navigation/paths";

export function resolveSwitchRedirect(input: {
  toProjectId: string;
  toOwned: boolean;
  savedRoute: string | null | undefined;
  savedSnapshotId: string | null | undefined;
  snapshotBelongsToTarget: boolean;
}): string {
  if (!isUuid(input.toProjectId)) {
    return "/projects";
  }
  const home = projectHomePath(input.toProjectId);
  if (!input.toOwned) {
    return home;
  }
  return buildProjectRedirect(
    input.toProjectId,
    input.savedRoute,
    input.snapshotBelongsToTarget ? input.savedSnapshotId : null,
  );
}
