import type { SnapshotIdentity } from "@/lib/types/domain";

export function snapshotIdentityKey(identity: SnapshotIdentity): string {
  return [
    identity.projectId,
    identity.repositoryId,
    identity.branch,
    identity.commitSha,
    identity.analysisEngineVersion,
    identity.constitutionVersion,
  ].join("::");
}

export function isSameSnapshotIdentity(
  left: SnapshotIdentity,
  right: SnapshotIdentity,
): boolean {
  return snapshotIdentityKey(left) === snapshotIdentityKey(right);
}
