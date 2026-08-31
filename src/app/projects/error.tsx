"use client";

import { ErrorState } from "@/components/ui/states";
import { toDeveloperCause, toUserErrorMessage } from "@/lib/errors";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <ErrorState
        title="프로젝트 목록을 불러오지 못했습니다"
        description={toUserErrorMessage(error)}
        developerCause={toDeveloperCause(error)}
      />
      <button
        type="button"
        onClick={reset}
        className="rounded border border-border px-4 py-2 text-sm"
      >
        다시 시도
      </button>
    </div>
  );
}
