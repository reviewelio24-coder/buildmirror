import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readMigration(name: string): string {
  return readFileSync(
    path.join(process.cwd(), "supabase/migrations", name),
    "utf8",
  );
}

describe("GitHub webhook SQL contracts", () => {
  it("keeps webhook RPCs service_role-only after hardening", () => {
    const sql = readMigration("20260831220200_github_webhook_hardening.sql");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toMatch(/set search_path = public/);
    expect(sql).toContain(
      "revoke all on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) from public, anon, authenticated",
    );
    expect(sql).toContain(
      "grant execute on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) to service_role",
    );
    expect(sql).toContain(
      "revoke all on table public.github_webhook_deliveries from public, anon, authenticated",
    );
    expect(sql).not.toMatch(
      /grant (all|select|insert|update|delete).+github_webhook_deliveries.+(anon|authenticated)/,
    );
  });

  it("blocks authenticated clients from creating github_push jobs", () => {
    const sql = readMigration("20260831220200_github_webhook_hardening.sql");
    expect(sql).toContain("coalesce(trigger_type, 'manual') in ('manual', 'mock')");
    expect(sql).toContain("github_delivery_id is null");
    expect(sql).toContain("create policy analysis_jobs_insert_own");
    expect(sql).toContain("create policy analysis_jobs_update_own");
    expect(sql).toContain("create policy analysis_jobs_delete_own");
  });

  it("does not store payload, token, or secret columns on deliveries", () => {
    const sql = readMigration("20260831220000_github_webhooks.sql");
    expect(sql).toContain("create table public.github_webhook_deliveries");
    expect(sql).not.toMatch(/\bpayload\b/);
    expect(sql).not.toMatch(/\bsecret\b/);
    expect(sql).not.toMatch(/\btoken\b/);
  });

  it("casts webhook enum literals under empty search_path", () => {
    const sql = readMigration("20260831220400_webhook_enum_casts.sql");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("'connected'::public.repository_connection_status");
    expect(sql).toContain("'inaccessible'::public.repository_connection_status");
    expect(sql).toContain("'github'::public.repository_provider");
    expect(sql).toContain("'pending'::public.analysis_job_status");
    expect(sql).toContain(
      "grant execute on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) to service_role",
    );
    expect(sql).toContain(
      "revoke all on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) from public, anon, authenticated, service_role",
    );
  });
});
