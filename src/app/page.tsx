import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium text-accent">AI Code Ownership Platform</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
        BuildMirror
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
        Cursor 등 AI 코딩 도구로 만든 GitHub 프로젝트를 분석해 Technical
        Correctness, Repository Nativeness, Developer Ownership을 증거 기반으로
        검증합니다. AI가 작성한 코드인지 탐지하거나 사람의 코드처럼 위장하지
        않습니다.
      </p>
      <ul className="mt-8 space-y-3 text-sm leading-6">
        <li>
          <strong>Technical Correctness</strong> — 코드가 작동하고 안전한가?
        </li>
        <li>
          <strong>Repository Nativeness</strong> — 해당 저장소의 기존 관습과
          의사결정에 맞는가?
        </li>
        <li>
          <strong>Developer Ownership</strong> — 사용자가 의도·위험·영향을
          설명하고 수정할 수 있는가?
        </li>
      </ul>
      <p className="mt-8 text-sm text-muted">
        지금 단계는 웹 앱 기반과 다중 프로젝트 관리입니다. GitHub App, 분석
        워커, AI 평가는 아직 연결되어 있지 않습니다.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href={user ? "/projects" : "/login"}
          className="rounded bg-accent px-4 py-2.5 text-sm font-medium text-white"
        >
          {user ? "프로젝트로 이동" : "시작하기"}
        </Link>
        <Link
          href="/login"
          className="rounded border border-border px-4 py-2.5 text-sm"
        >
          로그인
        </Link>
      </div>
    </main>
  );
}
