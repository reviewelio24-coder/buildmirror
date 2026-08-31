import { LoginForm } from "@/components/auth/login-form";
import { getEnv } from "@/lib/env";
import { sanitizeNextPath } from "@/lib/navigation/paths";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const mode = getEnv().APP_DATA_MODE;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold">로그인</h1>
      <p className="mt-2 text-sm text-muted">
        프로젝트 목록과 대시보드를 보려면 인증이 필요합니다.
      </p>
      <div className="mt-8 rounded-lg border border-border bg-surface p-5">
        <LoginForm mode={mode} nextPath={nextPath} />
      </div>
    </main>
  );
}
