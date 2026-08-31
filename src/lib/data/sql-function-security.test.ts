import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type FnState = {
  name: string;
  args: string;
  security: "definer" | "invoker";
  searchPath: string | null;
  grants: Set<string>;
  body: string;
};

function roleFlags(grants: Set<string>): {
  public: boolean;
  anon: boolean;
  authenticated: boolean;
  service_role: boolean;
} {
  return {
    public: grants.has("public"),
    anon: grants.has("anon"),
    authenticated: grants.has("authenticated"),
    service_role: grants.has("service_role"),
  };
}

function normalizeArgs(raw: string): string {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const tokens = part.split(/\s+/);
      return (tokens[tokens.length - 1] ?? "").toLowerCase();
    })
    .join(", ");
}

function keyOf(name: string, args: string): string {
  const fn = name.startsWith("public.") ? name : `public.${name}`;
  return `${fn}(${normalizeArgs(args)})`;
}

function splitRoles(raw: string): string[] {
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

function sqlFiles(): string[] {
  const migrationsDir = path.join(process.cwd(), "supabase/migrations");
  const migrations = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => path.join(migrationsDir, name));
  return [...migrations, path.join(process.cwd(), "supabase/seed.sql")];
}

function applySql(state: Map<string, FnState>, sql: string): void {
  const createRe =
    /create\s+or\s+replace\s+function\s+(public\.[a-z_][a-z0-9_]*)\s*\(([^)]*)\)([\s\S]*?)as\s+\$\$([\s\S]*?)\$\$/gi;
  for (const match of sql.matchAll(createRe)) {
    const name = match[1]?.toLowerCase() ?? "";
    const args = normalizeArgs(match[2] ?? "");
    const header = match[3]?.toLowerCase() ?? "";
    const body = match[4] ?? "";
    const security = header.includes("security definer") ? "definer" : "invoker";
    const pathMatch = header.match(/set\s+search_path\s*=\s*('(?:''|[^']*)'|public)/i);
    const searchPath = pathMatch?.[1]?.replace(/^'|'$/g, "").replace(/''/g, "'") ?? null;
    state.set(keyOf(name, args), {
      name,
      args,
      security,
      searchPath,
      grants: new Set(["public"]),
      body,
    });
  }

  const alterPathRe =
    /alter\s+function\s+(public\.[a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*set\s+search_path\s*=\s*('(?:''|[^']*)'|public)/gi;
  for (const match of sql.matchAll(alterPathRe)) {
    const key = keyOf(match[1] ?? "", match[2] ?? "");
    const current = state.get(key);
    if (!current) {
      continue;
    }
    current.searchPath = (match[3] ?? "").replace(/^'|'$/g, "").replace(/''/g, "'");
  }

  const alterSecRe =
    /alter\s+function\s+(public\.[a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s*security\s+(definer|invoker)/gi;
  for (const match of sql.matchAll(alterSecRe)) {
    const key = keyOf(match[1] ?? "", match[2] ?? "");
    const current = state.get(key);
    if (!current) {
      continue;
    }
    current.security = match[3] === "definer" ? "definer" : "invoker";
  }

  const revokeRe =
    /revoke\s+all\s+on\s+function\s+(public\.[a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s+from\s+([^;]+);/gi;
  for (const match of sql.matchAll(revokeRe)) {
    const key = keyOf(match[1] ?? "", match[2] ?? "");
    const current = state.get(key);
    if (!current) {
      continue;
    }
    for (const role of splitRoles(match[3] ?? "")) {
      current.grants.delete(role);
    }
  }

  const grantRe =
    /grant\s+execute\s+on\s+function\s+(public\.[a-z_][a-z0-9_]*)\s*\(([^)]*)\)\s+to\s+([^;]+);/gi;
  for (const match of sql.matchAll(grantRe)) {
    const key = keyOf(match[1] ?? "", match[2] ?? "");
    const current = state.get(key);
    if (!current) {
      continue;
    }
    for (const role of splitRoles(match[3] ?? "")) {
      current.grants.add(role);
    }
  }
}

function loadState(): Map<string, FnState> {
  const state = new Map<string, FnState>();
  for (const file of sqlFiles()) {
    applySql(state, readFileSync(file, "utf8"));
  }
  return state;
}

function requireFn(state: Map<string, FnState>, signature: string): FnState {
  const found = state.get(signature);
  if (!found) {
    throw new Error(`Missing function ${signature}`);
  }
  return found;
}

describe("Supabase function SECURITY and EXECUTE contracts", () => {
  const state = loadState();

  it("sets an empty search_path on every SECURITY DEFINER function", () => {
    const definers = [...state.values()].filter((item) => item.security === "definer");
    expect(definers.map((item) => `${item.name}(${item.args})`).sort()).toEqual([
      "public.apply_github_webhook_installation(bigint, text, timestamptz)",
      "public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz)",
      "public.claim_github_webhook_delivery(text, text, text, bigint, bigint)",
      "public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text)",
      "public.finish_github_webhook_delivery(text, text, text)",
      "public.handle_new_user()",
      "public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz)",
    ]);
    for (const fn of definers) {
      expect({ name: fn.name, searchPath: fn.searchPath }).toEqual({
        name: fn.name,
        searchPath: "",
      });
      expect(fn.body).not.toMatch(/\bexecute\s+/i);
    }
  });

  it("revokes PUBLIC execute from every function", () => {
    for (const fn of state.values()) {
      expect({ name: fn.name, public: fn.grants.has("public") }).toEqual({
        name: fn.name,
        public: false,
      });
      expect(fn.grants.has("anon")).toBe(false);
    }
  });

  it("keeps trigger functions off API roles", () => {
    const triggers = [
      "public.set_updated_at()",
      "public.handle_new_user()",
      "public.assert_active_project_repository()",
      "public.assert_snapshot_repository_link()",
      "public.prevent_github_install_claim_rebind()",
      "public.assert_github_installation_claimed()",
    ];
    for (const signature of triggers) {
      const fn = requireFn(state, signature);
      expect(roleFlags(fn.grants)).toEqual({
        public: false,
        anon: false,
        authenticated: false,
        service_role: false,
      });
    }
    expect(requireFn(state, "public.handle_new_user()").security).toBe("definer");
    expect(requireFn(state, "public.set_updated_at()").security).toBe("invoker");
  });

  it("keeps seed_buildmirror_demo off API roles and off DEFINER", () => {
    const fn = requireFn(state, "public.seed_buildmirror_demo(uuid)");
    expect(fn.security).toBe("invoker");
    expect(fn.searchPath).toBe("");
    expect(roleFlags(fn.grants)).toEqual({
      public: false,
      anon: false,
      authenticated: false,
      service_role: false,
    });
    expect(fn.body).toContain("select auth.role()");
    expect(fn.body).toContain("'service_role'");
    expect(fn.body).toContain("select auth.uid()");
  });

  it("grants user RPCs to authenticated only and checks auth.uid ownership", () => {
    const userRpcs = [
      "public.create_project_with_repository(text, text, text, text)",
      "public.link_project_repository(uuid, uuid)",
      "public.unlink_project_primary_repository(uuid)",
    ];
    for (const signature of userRpcs) {
      const fn = requireFn(state, signature);
      expect(fn.security).toBe("invoker");
      expect(fn.searchPath).toBe("");
      expect(roleFlags(fn.grants)).toEqual({
        public: false,
        anon: false,
        authenticated: true,
        service_role: false,
      });
      expect(fn.body).toContain("select auth.uid()");
      expect(fn.body).toMatch(/if v_user_id is null/);
    }
    const link = requireFn(state, "public.link_project_repository(uuid, uuid)");
    expect(link.body).toContain("user_id = v_user_id");
    expect(link.body).toContain("public.owns_github_installation");
  });

  it("grants ownership helpers to authenticated only", () => {
    const helpers = [
      "public.owns_project(uuid)",
      "public.owns_repository(uuid)",
      "public.snapshot_in_project(uuid, uuid)",
      "public.linked_project_repository(uuid, uuid)",
      "public.owns_github_installation(uuid)",
    ];
    for (const signature of helpers) {
      const fn = requireFn(state, signature);
      expect(fn.security).toBe("invoker");
      expect(fn.searchPath).toBe("");
      expect(roleFlags(fn.grants)).toEqual({
        public: false,
        anon: false,
        authenticated: true,
        service_role: false,
      });
    }
    expect(requireFn(state, "public.owns_project(uuid)").body).toContain(
      "select auth.uid()",
    );
    expect(
      requireFn(state, "public.owns_github_installation(uuid)").body,
    ).toContain("select auth.uid()");
  });

  it("grants webhook RPCs to service_role only", () => {
    const webhooks = [
      "public.claim_github_webhook_delivery(text, text, text, bigint, bigint)",
      "public.finish_github_webhook_delivery(text, text, text)",
      "public.apply_github_webhook_installation(bigint, text, timestamptz)",
      "public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz)",
      "public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz)",
      "public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text)",
    ];
    for (const signature of webhooks) {
      const fn = requireFn(state, signature);
      expect(fn.security).toBe("definer");
      expect(fn.searchPath).toBe("");
      expect(roleFlags(fn.grants)).toEqual({
        public: false,
        anon: false,
        authenticated: false,
        service_role: true,
      });
    }
  });

  it("keeps github_push jobs out of authenticated write policies", () => {
    const hardening = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260831220200_github_webhook_hardening.sql",
      ),
      "utf8",
    );
    expect(hardening).toMatch(
      /create policy analysis_jobs_insert_own[\s\S]*coalesce\(trigger_type, 'manual'\) in \('manual', 'mock'\)[\s\S]*github_delivery_id is null/,
    );
    expect(hardening).toContain("create policy analysis_jobs_update_own");
    expect(hardening).toContain("create policy analysis_jobs_delete_own");
    const latest = readFileSync(
      path.join(
        process.cwd(),
        "supabase/migrations/20260831220400_webhook_enum_casts.sql",
      ),
      "utf8",
    );
    expect(latest).not.toMatch(/drop policy if exists analysis_jobs_/);
  });
});
