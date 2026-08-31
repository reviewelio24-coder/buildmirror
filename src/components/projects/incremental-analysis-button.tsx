"use client";

import { useState, useTransition } from "react";
import { enqueueMockAnalysisAction } from "@/app/actions";

export function IncrementalAnalysisButton({
  projectId,
  disabledReason,
}: {
  projectId: string;
  disabledReason?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-semibold">변경분 분석</h2>
      <p className="mt-1 text-sm text-muted">
        실제 분석 워커는 연결되어 있지 않습니다. 버튼을 누르면 mock 작업만
        생성되며, 새 점수나 AI 결과는 만들어지지 않습니다.
      </p>
      {disabledReason ? (
        <p className="mt-3 text-sm text-muted">{disabledReason}</p>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await enqueueMockAnalysisAction(
                projectId,
                "incremental",
              );
              setMessage(
                result.error ??
                  "mock 분석 작업을 시작했습니다. 다른 프로젝트로 이동할 수 있습니다.",
              );
            });
          }}
          className="mt-4 rounded border border-border px-4 py-2 text-sm hover:bg-stone-100 disabled:opacity-60"
        >
          {pending ? "요청 중..." : "변경분 분석 시작 (mock)"}
        </button>
      )}
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
    </div>
  );
}
