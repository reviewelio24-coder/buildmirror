import type { LearningTask } from "@/lib/types/domain";

export function LearningTasks({ tasks }: { tasks: LearningTask[] }) {
  return (
    <section>
      <h2 className="text-base font-semibold">우선 학습 과제</h2>
      <p className="mt-1 text-sm text-muted">
        실제 학습 세션은 아직 없습니다. 스냅샷에 저장된 과제 목록만 보여 줍니다.
      </p>
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-muted">표시할 과제가 없습니다.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {tasks.map((task, index) => (
            <li
              key={task.id}
              className="rounded-lg border border-border bg-surface px-3 py-3"
            >
              <p className="text-sm font-medium">
                {index + 1}. {task.title}
              </p>
              <p className="mt-1 text-sm text-muted">{task.reason}</p>
              <p className="mt-2 font-mono text-xs text-muted">{task.concept}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
