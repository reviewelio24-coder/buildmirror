import type {
  DataSource,
  ProjectStatus,
} from "@/lib/types/domain";
import { DATA_SOURCE_COPY, STATUS_COPY } from "@/lib/copy";

const STATUS_ICON: Record<ProjectStatus, string> = {
  up_to_date: "✓",
  changes_detected: "▲",
  analyzing: "◌",
  stale: "◷",
  failed: "×",
  disconnected: "⊘",
  archived: "▣",
};

export function StatusBadge({
  status,
  showDescription = false,
}: {
  status: ProjectStatus;
  showDescription?: boolean;
}) {
  const copy = STATUS_COPY[status];
  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-sm">
        <span aria-hidden="true">{STATUS_ICON[status]}</span>
        <span className="font-medium">{copy.label}</span>
        <span className="font-mono text-xs text-muted">{status}</span>
      </span>
      {showDescription ? (
        <span className="text-sm text-muted">{copy.description}</span>
      ) : null}
    </span>
  );
}

export function DataSourceBadge({ source }: { source: DataSource }) {
  const copy = DATA_SOURCE_COPY[source];
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-muted"
      title={copy.hint}
    >
      {copy.label}
    </span>
  );
}
