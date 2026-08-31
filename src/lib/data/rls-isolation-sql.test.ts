import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "supabase/tests/rls_isolation.sql"),
  "utf8",
);

describe("RLS isolation SQL harness", () => {
  it("runs inside a single rolled-back transaction and prints result rows", () => {
    expect(sql).toMatch(/^begin;/m);
    expect(sql.trimEnd()).toMatch(/rollback;$/);
    expect(sql).toContain("test_name");
    expect(sql).toContain("passed");
    expect(sql).toContain("detail");
    expect(sql).toMatch(/select test_name, passed, detail/i);
    expect(sql).not.toMatch(/delete\s+from\s+auth\.users/i);
    expect(sql).not.toMatch(/drop\s+table/i);
    expect(sql).not.toMatch(/truncate\s+/i);
  });

  it("covers required A/B and webhook checks", () => {
    const required = [
      "a_cannot_select_b_projects",
      "a_cannot_update_b_projects",
      "a_cannot_delete_b_projects",
      "a_cannot_select_b_installations",
      "a_cannot_select_b_repositories",
      "a_cannot_link_b_repository",
      "a_cannot_ref_b_snapshot",
      "a_score_cannot_ref_other_project_snapshot",
      "a_job_cannot_ref_other_project_snapshot",
      "a_view_state_cannot_ref_other_project_snapshot",
      "a_cannot_insert_webhook_delivery",
      "a_cannot_insert_github_push_job",
      "a_cannot_update_github_push_job",
      "a_cannot_delete_github_push_job",
      "authenticated_cannot_exec_claim_rpc",
      "authenticated_cannot_exec_enqueue_rpc",
      "a_can_create_own_project",
      "a_can_link_own_repository",
      "b_data_unchanged_after_a",
      "service_claim_new",
      "service_claim_duplicate",
      "service_upsert_repository",
      "service_apply_installation_suspend",
      "service_apply_installation_unsuspend",
      "service_apply_repository_access",
      "service_enqueue_default_branch_job",
      "service_enqueue_same_delivery_no_dup",
      "service_enqueue_same_sha_no_dup",
      "service_enqueue_other_branch_no_job",
      "service_enqueue_delete_push_no_job",
      "service_no_snapshot_mutation",
    ];
    for (const name of required) {
      expect(sql).toContain(name);
    }
  });
});
