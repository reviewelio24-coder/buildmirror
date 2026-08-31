import { AXIS_COPY, VERDICT_COPY } from "@/lib/copy";
import { DataSourceBadge } from "@/components/ui/status-badge";
import type { AxisScore, OverallVerdict, ScoreSet } from "@/lib/types/domain";

function AxisPanel({
  title,
  question,
  score,
}: {
  title: string;
  question: string;
  score: AxisScore;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted">{question}</p>
      <p className="mt-4 text-3xl font-semibold tabular-nums">
        {score.value ?? "—"}
      </p>
      <p className="mt-1 text-sm">
        Confidence {score.confidence ?? "—"}
        {score.confidence !== null ? "%" : ""}
      </p>
      <p className="mt-3 text-sm leading-6">{score.summary}</p>
    </section>
  );
}

export function ScorePanels({ scores }: { scores: ScoreSet | null }) {
  if (!scores) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted">
        표시할 분석 점수가 없습니다. 실제 분석 워커는 아직 연결되어 있지 않습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {scores.verdict ? (
          <span className="rounded border border-border px-2 py-1">
            판정 {VERDICT_COPY[scores.verdict as OverallVerdict]}
          </span>
        ) : null}
        <DataSourceBadge source={scores.dataSource} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <AxisPanel
          title={AXIS_COPY.correctness.title}
          question={AXIS_COPY.correctness.question}
          score={scores.correctness}
        />
        <AxisPanel
          title={AXIS_COPY.nativeness.title}
          question={AXIS_COPY.nativeness.question}
          score={scores.nativeness}
        />
        <AxisPanel
          title={AXIS_COPY.ownership.title}
          question={AXIS_COPY.ownership.question}
          score={scores.ownership}
        />
      </div>
    </div>
  );
}
