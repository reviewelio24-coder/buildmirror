-- Read-only checks for cross-project reference violations.
-- Run in the SQL editor after migrations and seed.
-- Each query should return 0 rows.

-- last_successful_snapshot belongs to another project
select p.id as project_id, p.last_successful_snapshot_id
from public.projects p
left join public.analysis_snapshots s on s.id = p.last_successful_snapshot_id
where p.last_successful_snapshot_id is not null
  and (s.id is null or s.project_id <> p.id);

-- scores point at a snapshot from another project
select sc.id, sc.project_id, sc.snapshot_id
from public.scores sc
left join public.analysis_snapshots s on s.id = sc.snapshot_id
where s.id is null or s.project_id <> sc.project_id;

-- jobs point at a snapshot from another project
select j.id, j.project_id, j.snapshot_id
from public.analysis_jobs j
left join public.analysis_snapshots s on s.id = j.snapshot_id
where j.snapshot_id is not null
  and (s.id is null or s.project_id <> j.project_id);

-- view state points at a snapshot from another project
select v.user_id, v.project_id, v.snapshot_id
from public.project_view_state v
left join public.analysis_snapshots s on s.id = v.snapshot_id
where v.snapshot_id is not null
  and (s.id is null or s.project_id <> v.project_id);

-- snapshot repository is not linked to the project
select s.id, s.project_id, s.repository_id
from public.analysis_snapshots s
left join public.project_repositories pr
  on pr.project_id = s.project_id
 and pr.repository_id = s.repository_id
 and pr.unlinked_at is null
where pr.project_id is null;

-- active repository is not linked to the project or not owned by the project user
select p.id, p.active_repository_id, p.user_id
from public.projects p
left join public.project_repositories pr
  on pr.project_id = p.id
 and pr.repository_id = p.active_repository_id
 and pr.unlinked_at is null
left join public.repositories r on r.id = p.active_repository_id
where p.active_repository_id is not null
  and (
    pr.project_id is null
    or r.user_id is distinct from p.user_id
  );

-- GitHub installation belongs to another user than the repository
-- repositories.github_installation_id is the internal UUID FK, not GitHub's numeric id
select r.id, r.user_id, r.github_installation_id
from public.repositories r
left join public.github_installations gi on gi.id = r.github_installation_id
where r.github_installation_id is not null
  and (gi.id is null or gi.user_id is distinct from r.user_id);
