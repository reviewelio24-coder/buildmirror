import {
  isProjectRoute,
  projectHomePath,
  resolveOwnedSnapshotId,
  sanitizeFilters,
  sanitizeInternalPath,
} from "@/lib/navigation/paths";
import type { ViewStateInput } from "@/lib/data/project-store";

export function prepareViewStateInput(
  projectId: string,
  input: ViewStateInput,
  ownedSnapshotIds: Iterable<string>,
): ViewStateInput {
  const sanitizedRoute = sanitizeInternalPath(input.route);
  const route =
    sanitizedRoute && isProjectRoute(sanitizedRoute, projectId)
      ? sanitizedRoute.split("?")[0] ?? sanitizedRoute
      : projectHomePath(projectId);
  const snapshotId = resolveOwnedSnapshotId(
    projectId,
    input.snapshotId,
    ownedSnapshotIds,
  );
  const filters = sanitizeFilters(input.filters);
  const filterSnapshot = resolveOwnedSnapshotId(
    projectId,
    filters.snapshot ?? null,
    ownedSnapshotIds,
  );
  return {
    route,
    snapshotId,
    filters: filterSnapshot ? { snapshot: filterSnapshot } : {},
  };
}

export function viewStateUnchanged(
  current: { route: string; snapshotId: string | null; filters: Record<string, string> } | null,
  next: ViewStateInput,
): boolean {
  if (!current) {
    return false;
  }
  return (
    current.route === next.route &&
    current.snapshotId === next.snapshotId &&
    JSON.stringify(current.filters) === JSON.stringify(next.filters)
  );
}
