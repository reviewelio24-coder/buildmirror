import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16">
      <h1 className="text-2xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="mt-2 text-sm text-muted">요청한 경로가 없습니다.</p>
      <Link href="/" className="mt-4 inline-block text-sm underline">
        처음으로
      </Link>
    </main>
  );
}
