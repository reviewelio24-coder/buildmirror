import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProjectsGroupLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader user={user} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</div>
    </div>
  );
}
