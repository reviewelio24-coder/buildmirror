"use client";

import { type FormEvent, useState } from "react";
import { startDemoSessionFromForm } from "@/app/actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function LoginForm({
  mode,
  nextPath,
}: {
  mode: "mock" | "supabase";
  nextPath: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [modeTab, setModeTab] = useState<"signin" | "signup">("signin");

  async function handleSupabase(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      if (modeTab === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      window.location.assign(nextPath);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "로그인에 실패했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  if (mode === "mock") {
    return (
      <form action={startDemoSessionFromForm} className="space-y-4">
        <input type="hidden" name="next" value={nextPath} />
        <p className="text-sm text-muted">
          현재는 mock 모드입니다. 데모 계정으로 프로젝트 A·B·C 전환 흐름을 확인할
          수 있습니다.
        </p>
        <button
          type="submit"
          className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-white"
        >
          데모 계정으로 시작
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSupabase} className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setModeTab("signin")}
          className={`rounded px-3 py-1.5 text-sm ${
            modeTab === "signin" ? "bg-accent text-white" : "border border-border"
          }`}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => setModeTab("signup")}
          className={`rounded px-3 py-1.5 text-sm ${
            modeTab === "signup" ? "bg-accent text-white" : "border border-border"
          }`}
        >
          회원가입
        </button>
      </div>
      <label className="block text-sm">
        이메일
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        비밀번호
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
          className="mt-1 w-full rounded border border-border bg-background px-3 py-2"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "처리 중..." : modeTab === "signup" ? "가입 후 로그인" : "로그인"}
      </button>
      <p className="text-xs text-muted">
        GitHub OAuth는 아직 구현되어 있지 않습니다.
      </p>
    </form>
  );
}
