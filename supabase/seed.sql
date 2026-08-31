-- Development seed for A/B/C(+ analyzing, archived) demo projects.
-- Do not use in production.
--
-- After creating a user in Supabase Auth, run this in the SQL editor as
-- a database owner (not from the app client):
--   select public.seed_buildmirror_demo('<auth-user-uuid>');
-- API roles (anon, authenticated, service_role) must not receive EXECUTE.

create or replace function public.seed_buildmirror_demo(p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_role text := coalesce((select auth.role()), '');
  v_uid uuid := (select auth.uid());
begin
  if v_role in ('authenticated', 'anon', 'service_role') then
    raise exception 'seed_buildmirror_demo is restricted to the SQL editor owner role';
  end if;
  if v_uid is not null and v_uid is distinct from p_user_id then
    raise exception 'seed_buildmirror_demo can only seed the current user';
  end if;

  insert into public.profiles (id, display_name, skill_level, locale)
  values (p_user_id, '데모 사용자', 'beginner', 'ko')
  on conflict (id) do update
    set display_name = excluded.display_name;

  delete from public.projects where user_id = p_user_id;
  delete from public.repositories where user_id = p_user_id;

  insert into public.repositories (
    id, user_id, provider, provider_id, owner, name, default_branch, head_sha, connection_status
  ) values
    ('21111111-1111-4111-8111-111111111111', p_user_id, 'mock', 'mock-repo-a', 'demo-user', 'portfolio-blog', 'main', 'a1b2c3d4e5f6789012345678901234567890aaa1', 'connected'),
    ('22222222-2222-4222-8222-222222222221', p_user_id, 'mock', 'mock-repo-b', 'demo-user', 'team-dashboard', 'main', 'b9c8d7e6f5a4321098765432109876543210bbb9', 'connected'),
    ('23333333-3333-4333-8333-333333333331', p_user_id, 'mock', 'mock-repo-c', 'demo-user', 'shop-mvp', 'main', 'c9d8e7f6a5b4321098765432109876543210ccc9', 'connected'),
    ('24444444-4444-4444-8444-444444444441', p_user_id, 'mock', 'mock-repo-d', 'demo-user', 'learning-notes', 'main', 'd1b2c3d4e5f6789012345678901234567890ddd1', 'connected'),
    ('25555555-5555-4555-8555-555555555551', p_user_id, 'mock', 'mock-repo-e', 'demo-user', 'archived-landing', 'main', 'e1b2c3d4e5f6789012345678901234567890eee1', 'connected');

  insert into public.projects (
    id, user_id, name, status, active_repository_id, analysis_branch,
    stored_commit_sha, latest_known_commit_sha, latest_known_at,
    last_opened_at, archived_at
  ) values
    (
      '11111111-1111-4111-8111-111111111111', p_user_id, '포트폴리오 블로그', 'up_to_date',
      '21111111-1111-4111-8111-111111111111', 'main',
      'a1b2c3d4e5f6789012345678901234567890aaa1',
      'a1b2c3d4e5f6789012345678901234567890aaa1',
      '2026-08-31T08:40:00+09:00', '2026-08-31T08:50:00+09:00', null
    ),
    (
      '22222222-2222-4222-8222-222222222222', p_user_id, '팀 대시보드', 'changes_detected',
      '22222222-2222-4222-8222-222222222221', 'main',
      'b1b2c3d4e5f6789012345678901234567890bbb1',
      'b9c8d7e6f5a4321098765432109876543210bbb9',
      '2026-08-31T08:42:00+09:00', '2026-08-31T08:20:00+09:00', null
    ),
    (
      '33333333-3333-4333-8333-333333333333', p_user_id, '쇼핑몰 MVP', 'failed',
      '23333333-3333-4333-8333-333333333331', 'main',
      'c1b2c3d4e5f6789012345678901234567890ccc1',
      'c9d8e7f6a5b4321098765432109876543210ccc9',
      '2026-08-31T07:10:00+09:00', '2026-08-30T21:00:00+09:00', null
    ),
    (
      '44444444-4444-4444-8444-444444444444', p_user_id, '학습 노트', 'analyzing',
      '24444444-4444-4444-8444-444444444441', 'main',
      'd1b2c3d4e5f6789012345678901234567890ddd1',
      'd1b2c3d4e5f6789012345678901234567890ddd1',
      '2026-08-31T08:30:00+09:00', '2026-08-31T08:10:00+09:00', null
    ),
    (
      '55555555-5555-4555-8555-555555555555', p_user_id, '랜딩 페이지', 'archived',
      '25555555-5555-4555-8555-555555555551', 'main',
      'e1b2c3d4e5f6789012345678901234567890eee1',
      'e1b2c3d4e5f6789012345678901234567890eee1',
      '2026-08-20T10:00:00+09:00', '2026-08-20T10:00:00+09:00', '2026-08-20T11:00:00+09:00'
    );

  insert into public.project_repositories (project_id, repository_id, role) values
    ('11111111-1111-4111-8111-111111111111', '21111111-1111-4111-8111-111111111111', 'primary'),
    ('22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222221', 'primary'),
    ('33333333-3333-4333-8333-333333333333', '23333333-3333-4333-8333-333333333331', 'primary'),
    ('44444444-4444-4444-8444-444444444444', '24444444-4444-4444-8444-444444444441', 'primary'),
    ('55555555-5555-4555-8555-555555555555', '25555555-5555-4555-8555-555555555551', 'primary');

  insert into public.analysis_snapshots (
    id, project_id, repository_id, branch, commit_sha,
    analysis_engine_version, constitution_version, status, data_source, summary, learning_tasks, completed_at
  ) values
    (
      '31111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111',
      '21111111-1111-4111-8111-111111111111',
      'main', 'a1b2c3d4e5f6789012345678901234567890aaa1',
      'engine-0.1.0', 'constitution-v1', 'completed', 'mock',
      '빌드와 타입 검사는 통과했습니다. RLS 설명 과제가 남아 있습니다.',
      '[{"id":"task-a-1","title":"글 목록 데이터 흐름 설명하기","concept":"Server Component에서 Supabase 조회","reason":"페이지가 데이터를 어디서 가져오는지 설명할 수 있어야 합니다.","status":"suggested"}]'::jsonb,
      '2026-08-30T21:00:00+09:00'
    ),
    (
      '32222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222222',
      '22222222-2222-4222-8222-222222222221',
      'main', 'b1b2c3d4e5f6789012345678901234567890bbb1',
      'engine-0.1.0', 'constitution-v1', 'completed', 'mock',
      '작동하지만 데이터 계층 추상화가 기존 패턴과 다릅니다.',
      '[{"id":"task-b-1","title":"게시물 삭제 권한이 어디서 보장되는지 확인하고 설명","concept":"RLS와 클라이언트 가드의 차이","reason":"UI 숨김만으로는 삭제가 막히지 않습니다.","status":"suggested"},{"id":"task-b-2","title":"신규 UserRepository 계층이 필요한 이유를 판단","concept":"성급한 추상화","reason":"한 화면에서만 쓰는 조회에 계층을 추가했습니다.","status":"suggested"}]'::jsonb,
      '2026-08-28T20:00:00+09:00'
    ),
    (
      '33333333-3333-4333-8333-333333333333',
      '33333333-3333-4333-8333-333333333333',
      '23333333-3333-4333-8333-333333333331',
      'main', 'c1b2c3d4e5f6789012345678901234567890ccc1',
      'engine-0.1.0', 'constitution-v1', 'completed', 'mock',
      '이전 정상 분석입니다. 이후 커밋 분석은 실패했습니다.',
      '[{"id":"task-c-1","title":"결제 금액 계산 위치를 코드에서 찾기","concept":"서버 권한과 가격 계산","reason":"클라이언트에서 금액을 신뢰하면 조작 위험이 있습니다.","status":"suggested"}]'::jsonb,
      '2026-08-27T18:00:00+09:00'
    ),
    (
      '34444444-4444-4444-8444-444444444444',
      '44444444-4444-4444-8444-444444444444',
      '24444444-4444-4444-8444-444444444441',
      'main', 'd1b2c3d4e5f6789012345678901234567890ddd1',
      'engine-0.1.0', 'constitution-v1', 'completed', 'mock',
      '이전 정상 분석입니다. 현재 증분 분석이 진행 중입니다.',
      '[{"id":"task-d-1","title":"노트 저장 실패 시 사용자 메시지 경로 설명","concept":"오류를 삼키지 않기","reason":"catch에서 빈 값을 반환하면 원인 추적이 어렵습니다.","status":"suggested"}]'::jsonb,
      '2026-08-29T19:00:00+09:00'
    ),
    (
      '35555555-5555-4555-8555-555555555555',
      '55555555-5555-4555-8555-555555555555',
      '25555555-5555-4555-8555-555555555551',
      'main', 'e1b2c3d4e5f6789012345678901234567890eee1',
      'engine-0.1.0', 'constitution-v1', 'completed', 'mock',
      '보관된 프로젝트의 마지막 정상 분석입니다.',
      '[]'::jsonb,
      '2026-08-18T16:00:00+09:00'
    );

  update public.projects set last_successful_snapshot_id = '31111111-1111-4111-8111-111111111111'
    where id = '11111111-1111-4111-8111-111111111111';
  update public.projects set last_successful_snapshot_id = '32222222-2222-4222-8222-222222222222'
    where id = '22222222-2222-4222-8222-222222222222';
  update public.projects set last_successful_snapshot_id = '33333333-3333-4333-8333-333333333333'
    where id = '33333333-3333-4333-8333-333333333333';
  update public.projects set last_successful_snapshot_id = '34444444-4444-4444-8444-444444444444'
    where id = '44444444-4444-4444-8444-444444444444';
  update public.projects set last_successful_snapshot_id = '35555555-5555-4555-8555-555555555555'
    where id = '55555555-5555-4555-8555-555555555555';

  insert into public.analysis_jobs (
    id, project_id, snapshot_id, type, stage, progress, status, error_code, error_message, created_at, started_at, completed_at
  ) values
    ('41111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', 'full', 'completed', 100, 'completed', null, null, '2026-08-30T20:40:00+09:00', '2026-08-30T20:41:00+09:00', '2026-08-30T21:00:00+09:00'),
    ('42222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '32222222-2222-4222-8222-222222222222', 'full', 'completed', 100, 'completed', null, null, '2026-08-28T19:20:00+09:00', '2026-08-28T19:21:00+09:00', '2026-08-28T20:00:00+09:00'),
    ('43333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', null, 'incremental', 'failed', 40, 'failed', 'WORKER_NOT_CONNECTED', '분석 워커가 연결되어 있지 않아 최신 커밋 분석이 실패했습니다. 이전 정상 결과는 그대로입니다.', '2026-08-30T22:00:00+09:00', '2026-08-30T22:01:00+09:00', '2026-08-30T22:08:00+09:00'),
    ('44444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', '34444444-4444-4444-8444-444444444444', 'incremental', 'analyzing', 62, 'running', null, null, '2026-08-31T08:00:00+09:00', '2026-08-31T08:01:00+09:00', null),
    ('45555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '35555555-5555-4555-8555-555555555555', 'full', 'completed', 100, 'completed', null, null, '2026-08-18T15:40:00+09:00', '2026-08-18T15:41:00+09:00', '2026-08-18T16:00:00+09:00');

  insert into public.scores (
    id, project_id, snapshot_id,
    correctness_value, correctness_confidence, correctness_summary,
    nativeness_value, nativeness_confidence, nativeness_summary,
    ownership_value, ownership_confidence, ownership_summary,
    verdict, data_source
  ) values
    ('51111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', 82, 88, '빌드와 타입 검사는 통과. 보안 설명 과제가 남아 있습니다.', 74, 70, '기존 페이지 구조와 대체로 맞습니다.', 61, 64, '데이터 흐름은 설명 가능하나 권한 근거는 약합니다.', 'ship_with_caution', 'mock'),
    ('52222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222', '32222222-2222-4222-8222-222222222222', 76, 81, '빌드 성공, 타입 오류 2건, RLS 확인 필요 1건.', 54, 72, '기존과 다른 데이터 계층, 과도한 추상화.', 42, 58, '데이터 흐름 설명 가능, 권한·변경 영향 설명 부족.', 'ship_with_caution', 'mock'),
    ('53333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 68, 75, '이전 정상 시점의 빌드는 성공했습니다.', 63, 66, '상점 도메인 폴더 구조는 기존 패턴을 따릅니다.', 55, 60, '가격 계산 위치를 아직 자신 있게 설명하지 못합니다.', 'learning_project', 'mock'),
    ('54444444-4444-4444-8444-444444444444', '44444444-4444-4444-8444-444444444444', '34444444-4444-4444-8444-444444444444', 79, 80, '이전 정상 분석 기준입니다. 진행 중 작업 결과가 아닙니다.', 71, 69, '노트 목록 컴포넌트 배치가 기존과 비슷합니다.', 58, 62, '저장 실패 경로를 설명하는 과제가 있습니다.', 'ship_with_caution', 'mock'),
    ('55555555-5555-4555-8555-555555555555', '55555555-5555-4555-8555-555555555555', '35555555-5555-4555-8555-555555555555', 70, 73, '보관 시점의 마지막 정상 결과입니다.', 66, 60, '랜딩 구성은 단순하고 기존 파일 배치와 맞습니다.', 48, 52, '배포 전 환경변수 설명 과제가 남아 있습니다.', 'learning_project', 'mock');

  insert into public.project_view_state (user_id, project_id, route, snapshot_id, filters) values
    (p_user_id, '11111111-1111-4111-8111-111111111111', '/projects/11111111-1111-4111-8111-111111111111', '31111111-1111-4111-8111-111111111111', '{}'::jsonb),
    (p_user_id, '22222222-2222-4222-8222-222222222222', '/projects/22222222-2222-4222-8222-222222222222', '32222222-2222-4222-8222-222222222222', '{}'::jsonb);

  insert into public.notifications (id, user_id, project_id, type, status, title, body, created_at) values
    ('61111111-1111-4111-8111-111111111111', p_user_id, '11111111-1111-4111-8111-111111111111', 'analysis_completed', 'read', '분석이 최신 상태입니다', '저장된 commit SHA와 최신 확인 SHA가 같습니다.', '2026-08-30T21:01:00+09:00'),
    ('62222222-2222-4222-8222-222222222222', p_user_id, '22222222-2222-4222-8222-222222222222', 'changes_detected', 'unread', '새 커밋이 발견됐습니다', '기존 분석 결과는 유지됩니다. 변경분 분석을 선택할 수 있습니다.', '2026-08-31T08:42:00+09:00'),
    ('63333333-3333-4333-8333-333333333333', p_user_id, '33333333-3333-4333-8333-333333333333', 'analysis_failed', 'unread', '최신 분석에 실패했습니다', '이전 정상 스냅샷은 삭제되지 않았습니다.', '2026-08-30T22:08:00+09:00'),
    ('64444444-4444-4444-8444-444444444444', p_user_id, '44444444-4444-4444-8444-444444444444', 'analysis_running', 'unread', '변경분을 분석하고 있습니다', '다른 프로젝트로 이동해도 이 작업은 유지됩니다. 이 상태는 mock입니다.', '2026-08-31T08:01:00+09:00');
end;
$$;

revoke all on function public.seed_buildmirror_demo(uuid) from public, anon, authenticated, service_role;
