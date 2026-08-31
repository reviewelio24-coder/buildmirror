import Link from "next/link";

export default function ProjectNotFound() {
  return (
    <div className="rounded-lg border border-border bg-surface px-6 py-10">
      <h2 className="text-lg font-semibold">프로젝트를 찾을 수 없습니다</h2>
      <p className="mt-2 text-sm text-muted">
        없거나 이 계정에 속하지 않는 프로젝트입니다.
      </p>
      <Link href="/projects" className="mt-4 inline-block text-sm underline">
        프로젝트 목록으로
      </Link>
    </div>
  );
}
