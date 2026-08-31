import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  developerCause,
}: {
  title: string;
  description: string;
  developerCause?: string;
}) {
  return (
    <div className="rounded-lg border border-danger/30 bg-surface px-6 py-8">
      <p className="text-sm font-medium text-danger">오류</p>
      <h2 className="mt-1 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted">{description}</p>
      {process.env.NODE_ENV === "development" && developerCause ? (
        <pre className="mt-4 overflow-auto rounded bg-stone-100 p-3 text-xs text-stone-700">
          {developerCause}
        </pre>
      ) : null}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-stone-200/80 ${className ?? "h-24"}`}
    />
  );
}
