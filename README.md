# BuildMirror

AI가 만든 코드를 이해하고, 검증하고, 책임질 수 있게 만드는 **AI Code Ownership Platform**입니다.

이 저장소의 제품 요구사항 기준은 [`docs/BuildMirror_PRD_v0.2.md`](docs/BuildMirror_PRD_v0.2.md)입니다.

현재 코드는 전체 제품을 구현하지 않습니다. GitHub App **clone**, 분석 워커, AI 평가는 아직 없습니다. 웹 앱 기반, 다중 프로젝트 관리, 프로젝트 간 데이터 격리, GitHub App 설치·소유권 검증, 저장소 목록 조회와 프로젝트 연결, 서명된 webhook 수신과 기본 브랜치 push의 대기 작업 생성까지 제공합니다.

## 지금 구현된 범위

- Next.js App Router, TypeScript strict, Tailwind CSS
- 로그인 경계 (`/login`, `/projects` 보호)
- mock 모드에서 데모 계정으로 전체 화면 흐름 확인
- Supabase Auth/Postgres/RLS를 연결할 수 있는 클라이언트와 마이그레이션
- 사용자별 다중 프로젝트 목록, 검색, 생성, 전환, 보관, 재활성화, 삭제
- 프로젝트별 대시보드, 분석 스냅샷, 분석 작업 상태, 점수, 알림, 학습 과제 표시
- 프로젝트 A·B·C mock 데이터로 전환 시 기록 격리 확인
- 프로젝트·저장소·스냅샷 교차 참조를 막는 데이터베이스 제약조건
- 프로젝트 전환 경로와 snapshot ID 서버 검증
- GitHub Actions에서 mock 모드 테스트/타입/린트/빌드
- GitHub App 환경변수 검증, JWT/installation token 발급 모듈, API client 경계
- 로그인 사용자의 GitHub App 설치 시작, Setup URL, 사용자 승인 callback과 소유권 검증
- `github_installations` / `github_install_states` / `github_install_claims` (토큰·private key는 DB에 없음)
- 검증된 GitHub installation의 저장소 목록 조회(pagination)와 프로젝트 연결·변경·해제
- GitHub / 분석 워커 / AI 연동을 위한 adapter 경계와 `TODO`
- `POST /api/github/webhooks`에서 HMAC 검증, delivery 멱등 처리, 기본 브랜치 push의 pending analysis job 생성

## 지금 구현되지 않은 것

다음 기능은 화면에서 작동하는 것처럼 꾸미지 않았습니다. 호출하면 미구현 오류이거나 mock 안내를 보여 줍니다.

- 실제 GitHub 사용자 OAuth를 BuildMirror 로그인 수단으로 사용
- 저장소 clone
- build / typecheck / lint / test를 실행하는 분석 워커
- 가비아 클라우드 워커, Docker 샌드박스
- OpenAI API 호출과 AI 분석 결과 생성
- Repository Fingerprint / Project Constitution 판정
- 결제, 이메일, 음성 면접, 자동 코드 수정, Pull Request 생성

## 요구 환경

- Node.js 20 이상
- npm (이 저장소의 lockfile은 npm입니다)

## 깨끗한 설치

```bash
npm ci
copy .env.example .env.local
```

Windows PowerShell:

```powershell
npm ci
Copy-Item .env.example .env.local
```

기본값은 mock 모드입니다. `.env.local`에는 예시값만 두면 됩니다.

```
APP_DATA_MODE=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

개발 서버:

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 연 뒤 **로그인 → 데모 계정으로 시작**을 선택합니다.

## 권장 검증 순서

`.next`가 없는 깨끗한 상태에서 타입 검사가 통과해야 합니다. `next build`로 생성 타입을 만든 뒤에만 typecheck가 되는 상태는 실패로 봅니다.

Windows PowerShell:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

macOS / Linux:

```bash
rm -rf .next
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
```

GitHub Actions(`.github/workflows/ci.yml`)도 같은 명령을 mock 모드 환경변수와 함께 실행합니다. 실제 Supabase 키는 CI에 넣지 않습니다.

## mock 모드와 Supabase 모드

| 항목 | mock (`APP_DATA_MODE=mock`) | supabase (`APP_DATA_MODE=supabase`) |
|------|-----------------------------|-------------------------------------|
| 인증 | 데모 쿠키 | Supabase Auth |
| 데이터 | 메모리 + `.data/mock-store.json` | Postgres + RLS |
| GitHub head SHA | mock provider | GitHub App 모듈은 있으나 설치 전이면 mock SHA 확인을 유지 |
| 분석 워커 | mock 작업만 생성 | 같은 mock 작업 행을 넣을 수 있음. 실제 워커 없음 |
| CI / 기본 개발 | GitHub 환경변수 없이 검증 | 로컬 또는 호스티드 Supabase가 있을 때만 |
| GitHub App 설정 | 없어도 빌드·테스트 가능 | JWT/token 모듈은 서버 환경변수가 있을 때만 호출 |
| GitHub webhook | 메모리 delivery. secret 없이 기존 테스트·빌드 가능 | HMAC 검증 후 RPC. secret 없으면 엔드포인트 503 |

`.env.example`에는 실제 비밀값이 없습니다. `service_role` 키와 GitHub private key는 앱 클라이언트에 넣지 마세요.

## 환경변수

| 이름 | 공개 여부 | 설명 |
|------|-----------|------|
| `APP_DATA_MODE` | 서버 전용 | `mock` 또는 `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 | RLS와 함께 쓰는 anon key. service_role이 아닙니다. |
| `NEXT_PUBLIC_APP_URL` | 공개 | 앱 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 비밀 | webhook 서버 모듈 전용. 브라우저·일반 store에 넣지 마세요. |
| `GITHUB_APP_ID` | 서버 전용 | GitHub App ID. mock/CI에서는 생략 가능 |
| `GITHUB_APP_CLIENT_ID` | 서버 전용 | JWT `iss`에 사용. mock/CI에서는 생략 가능 |
| `GITHUB_APP_PRIVATE_KEY` | 서버 전용 | PEM. `\n` 이스케이프를 허용. DB에 저장하지 않음 |
| `GITHUB_APP_SLUG` | 서버 전용 | 설치 URL `https://github.com/apps/{slug}/installations/new` |
| `GITHUB_APP_CLIENT_SECRET` | 서버 전용 | user-to-server code 교환. mock/CI에서는 생략 가능 |
| `GITHUB_USER_CALLBACK_URL` | 서버 전용 | `/api/github/user-callback`. mock/CI에서는 생략 가능 |
| `GITHUB_INSTALL_STATE_SECRET` | 서버 전용 | Setup/OAuth `state` HMAC. 32자 이상. 키에서 파생하지 않음 |
| `GITHUB_WEBHOOK_SECRET` | 서버 전용 | webhook HMAC. 16자 이상. mock 테스트/빌드에는 없어도 됨 |

## 데이터 무결성

초기 스키마는 `supabase/migrations/20260831000000_init.sql`입니다. 이미 적용됐을 수 있으므로 교차 참조 강화는 별도 파일입니다.

`supabase/migrations/20260831120000_referential_integrity.sql`

보장하는 관계:

- `projects.last_successful_snapshot_id` → 같은 `project_id`의 `analysis_snapshots.id`
- `scores.snapshot_id` → 같은 프로젝트의 스냅샷
- `analysis_jobs.snapshot_id` → null이 아니면 같은 프로젝트의 스냅샷
- `project_view_state.snapshot_id` → null이 아니면 같은 프로젝트의 스냅샷
- `analysis_snapshots.repository_id` → 해당 프로젝트의 `project_repositories` 연결
- `projects.active_repository_id` → 해당 프로젝트의 `project_repositories` 연결

복합 UNIQUE `(analysis_snapshots.project_id, id)`와 복합 FOREIGN KEY를 사용합니다.

활성 저장소는 “연결만 되어 있다”가 아니라 **현재 링크(`unlinked_at is null`)이고 같은 사용자 소유**여야 합니다. 이 조건은 복합 FK만으로 표현하기 어려워 제한된 트리거를 둡니다.

- `assert_active_project_repository` / `assert_snapshot_repository_link`
- 프로젝트 생성 RPC와 데모 seed는 프로젝트 행을 링크 행보다 먼저 넣습니다. 그래서 활성 저장소 검사와 해당 FK는 `DEFERRABLE INITIALLY DEFERRED`이며 트랜잭션 커밋 시점에 검사합니다.

적용 전 위반 데이터 탐지: `supabase/verify_integrity.sql` (각 쿼리는 0행이어야 함).

GitHub App 설치 메타데이터는 `supabase/migrations/20260831140000_github_installations.sql`입니다. 식별자 명칭은 `supabase/migrations/20260831160000_github_install_setup.sql`에서 나눕니다. 이미 적용됐을 수 있는 초기 GitHub 마이그레이션은 직접 수정하지 않습니다.

- `github_installations.id`는 BuildMirror 내부 UUID입니다.
- `github_installations.github_external_installation_id`는 GitHub 숫자형 `installation_id`이며 전역 UNIQUE입니다. 한 설치는 한 사용자만 연결할 수 있습니다.
- `repositories.github_installation_id`는 내부 UUID FK입니다. GitHub 숫자가 아닙니다.
- `repositories (user_id, github_installation_id)` → `github_installations (user_id, id)`
- `github_install_states`는 설치 시작 때 만든 일회용 nonce를 저장합니다.
- `github_install_claims`는 Setup 이후 소유권 검증 전의 pending claim입니다. 토큰은 저장하지 않습니다.
- GitHub 저장소는 `provider = 'github'`일 때만 installation/repo id를 가질 수 있습니다.
- `repositories.github_repository_id`는 GitHub numeric ID이며 `(user_id, github_repository_id)`로 중복을 막습니다. 이름이 바뀌어도 같은 행을 갱신합니다.
- 저장소 동기화 컬럼은 `supabase/migrations/20260831200000_github_repository_sync.sql`입니다. 목록에서 사라진 저장소는 삭제하지 않고 `inaccessible`로 표시합니다.
- webhook delivery와 pending job 컬럼은 `supabase/migrations/20260831220000_github_webhooks.sql`입니다. 전체 payload·secret·token은 저장하지 않습니다.
- webhook RPC는 `supabase/migrations/20260831220100_github_webhook_rpcs.sql`입니다. `SECURITY DEFINER`이며 `anon`/`authenticated` EXECUTE를 회수하고 `service_role`만 호출합니다.
- `supabase/migrations/20260831220200_github_webhook_hardening.sql`은 webhook RPC `search_path`를 비우고, 인증 사용자가 `github_push` job이나 `github_delivery_id`를 직접 넣지 못하게 합니다.
- `supabase/migrations/20260831220300_security_definer_hardening.sql`은 모든 함수의 `search_path`와 EXECUTE 역할을 고정합니다. webhook과 `handle_new_user`만 `SECURITY DEFINER`입니다.
- **installation access token과 App private key 컬럼은 없습니다.** 토큰은 메모리에서만 발급합니다.

## GitHub App 설치와 Setup URL

로그인 사용자가 `/projects`에서 **GitHub App 설치**를 누르면 서버가 일회용 `state`를 만들고 GitHub 설치 페이지로 보냅니다.

```
https://github.com/apps/{slug}/installations/new?state=...
```

GitHub App 등록의 Setup URL은 앱의 `/api/github/setup`이어야 합니다. GitHub는 설치 후 다음 쿼리를 붙입니다.

```
installation_id, setup_action, state
```

`installation_id`는 스푸핑될 수 있습니다. Setup URL만으로는 연결을 확정하지 않습니다. 서버는 pending claim을 저장한 뒤 GitHub App **사용자 승인**(user-to-server OAuth)으로 보냅니다. Callback은 `/api/github/user-callback`이며, 발급된 user access token으로 `GET /user/installations`를 페이지 끝까지 확인합니다. Setup에서 받은 installation ID가 목록에 있고 App ID가 일치하며 중단되지 않았을 때만 BuildMirror 사용자와 연결합니다. user access token과 refresh token은 DB·쿠키·세션에 저장하지 않으며, 확인 직후 revoke합니다.

GitHub 사용자 OAuth는 BuildMirror 로그인 수단이 아닙니다. 로그인은 계속 데모 쿠키 또는 Supabase Auth입니다.

### GitHub App 등록 값

테스트용 GitHub App만 사용하세요. 운영 App을 바꾸거나 실제 사용 중인 저장소 설치를 삭제하지 마세요.

| GitHub App 설정 | 값 |
|-----------------|----|
| Setup URL | `{NEXT_PUBLIC_APP_URL}/api/github/setup` |
| User authorization callback URL | `{NEXT_PUBLIC_APP_URL}/api/github/user-callback` |
| Webhook URL | `{NEXT_PUBLIC_APP_URL}/api/github/webhooks` |
| Webhook secret | `.env.local`의 `GITHUB_WEBHOOK_SECRET`과 동일. 16자 이상 |

로컬 기본값:

```
http://localhost:3000/api/github/setup
http://localhost:3000/api/github/user-callback
http://localhost:3000/api/github/webhooks
```

최소 권한:

- Metadata: Read — 설치와 저장소 기본 메타데이터
- Contents: Read — `push` 이벤트 구독과 이후 저장소 콘텐츠 접근에 필요. 이 단계에서는 clone이나 파일 다운로드를 하지 않습니다.

구독 이벤트:

- `installation`
- `installation_repositories`
- `repository`
- `push`

Pull requests 권한과 `pull_request` 이벤트는 현재 사용하지 않습니다. 핸들러는 서명된 `pull_request`가 와도 job을 만들지 않고 delivery만 기록합니다.

Webhook secret은 GitHub App과 서버 환경변수에만 두고 DB에 저장하지 않습니다. 로컬에서 GitHub이 `localhost` webhook을 호출하려면 ngrok 등 공개 HTTPS URL이 필요합니다. 그 URL을 GitHub App Webhook URL과 `NEXT_PUBLIC_APP_URL`에 맞추세요.

검증 실패 시 외부 URL이 아니라 `/projects?github=cancelled|expired|invalid|already_linked|unavailable|pending_approval`로 보냅니다. JWT·private key·client secret·GitHub 원문 오류는 화면에 나오지 않습니다.

설치가 확정된 뒤에만 서버가 installation access token을 메모리에서 발급해 `GET /installation/repositories`를 pagination 끝까지 조회합니다. 토큰은 클라이언트·DB·로그에 남기지 않습니다. 프로젝트 설정에서 저장소를 연결·변경·해제할 수 있으며, 서버는 프로젝트 소유자, installation 소유자, 해당 installation API 목록의 실제 존재 여부를 다시 확인합니다. archived 저장소는 신규 연결을 막고, disabled 저장소는 연결과 분석 시작을 막습니다. 연결을 바꿔도 기존 snapshot·점수·학습 기록은 삭제하지 않습니다.

## 프로젝트 전환과 경로 검증

`switchProjectAction`은 클라이언트가 준 route를 그대로 redirect하지 않습니다.

서버에서 확인하는 내용:

- `fromProjectId` / `toProjectId`가 현재 사용자 소유인지
- 저장할 route가 `/projects/{fromProjectId}` 또는 그 하위(현재는 홈·설정)인지
- 불러온 route가 `/projects/{toProjectId}` 하위인지
- `//example.com`, URL scheme, 역슬래시, 인코딩 우회가 아닌지
- snapshot ID가 대상 프로젝트의 스냅샷인지
- filters에 `snapshot` UUID 외의 값이 없는지

실패하면 오류 페이지나 외부 URL이 아니라 `/projects/{toProjectId}`로 보냅니다.

로그인 `next`와 데모 세션 `nextPath`도 `sanitizeNextPath`를 거칩니다. `startsWith("/")`만으로는 통과하지 않습니다.

다른 프로젝트의 `?snapshot=` 값이 오면 현재 프로젝트의 마지막 정상 스냅샷으로 표시하고, 그 ID를 view state에 저장하지 않습니다.

화면 상태는 프로젝트 전환 시에만 저장합니다. 홈/설정 GET 렌더링은 UPSERT를 하지 않습니다. `last_opened_at`은 전환 시에만 갱신합니다.

## 프로젝트 목록 조회

Supabase `listProjectSummaries()`는 프로젝트마다 repository/job을 조회하지 않습니다. 프로젝트 목록 1회, 활성 저장소 1회, 진행 중 job 1회로 조합합니다. 검색·활성·보관 필터는 이전과 같습니다.

## Supabase / RLS 테스트

CI와 기본 `npm run test`는 mock 저장소와 순수 함수만 실행합니다. 로컬 Supabase가 없는 상태에서 RLS 테스트를 통과했다고 보지 마세요.

로컬 또는 호스티드 Supabase가 있을 때:

1. 마이그레이션을 순서대로 적용합니다.
2. Auth 사용자 A, B를 만듭니다.
3. `select public.seed_buildmirror_demo('<user-a-uuid>');` 를 SQL editor(소유자)에서 실행합니다. 이 함수는 앱 클라이언트에 EXECUTE가 없습니다.
4. `supabase/verify_integrity.sql`로 교차 참조 위반이 0행인지 확인합니다.
5. `supabase/tests/rls_isolation.sql`의 시나리오를 사용자 A/B 세션으로 실행합니다.

`service_role` 키를 앱이나 CI에 넣어 RLS를 우회하지 마세요.

## GitHub Actions CI

`.github/workflows/ci.yml`은 `push`와 `pull_request`에서 다음을 순서대로 실행합니다. 한 단계가 실패하면 workflow가 실패합니다.

- Node.js 20, npm cache
- `npm ci`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

환경변수는 `APP_DATA_MODE=mock`, `NEXT_PUBLIC_APP_URL=http://localhost:3000`만 사용합니다.

## 데이터 준비

### mock 모드 (기본)

앱이 시작되면 A·B·C 프로젝트와 분석 중/보관 예시가 메모리와 `.data/mock-store.json`에 준비됩니다.

| 프로젝트 | 상태 | 확인 포인트 |
|----------|------|-------------|
| 포트폴리오 블로그 (A) | `up_to_date` | 저장 SHA와 최신 확인 SHA가 같음 |
| 팀 대시보드 (B) | `changes_detected` | SHA가 다르지만 이전 정상 스냅샷 유지 |
| 쇼핑몰 MVP (C) | `failed` | 최근 작업 실패, 이전 정상 스냅샷 표시 |
| 학습 노트 (D) | `analyzing` | 진행 중에도 다른 프로젝트로 이동 가능 |
| 랜딩 페이지 (E) | `archived` | 보관 후에도 기록 열람 가능 |

mock 저장소를 초기화하려면 `.data/mock-store.json`을 지우고 서버를 다시 시작하면 됩니다.

### Supabase 모드

1. Supabase 프로젝트를 만듭니다.
2. `supabase/migrations/20260831000000_init.sql`을 실행합니다.
3. `supabase/migrations/20260831120000_referential_integrity.sql`을 실행합니다.
4. `supabase/migrations/20260831140000_github_installations.sql`을 실행합니다.
5. `supabase/migrations/20260831160000_github_install_setup.sql`을 실행합니다.
6. `supabase/migrations/20260831180000_github_install_claims.sql`을 실행합니다.
7. `supabase/migrations/20260831200000_github_repository_sync.sql`을 실행합니다.
8. `supabase/migrations/20260831220000_github_webhooks.sql`을 실행합니다.
9. `supabase/migrations/20260831220100_github_webhook_rpcs.sql`을 실행합니다.
10. `supabase/migrations/20260831220200_github_webhook_hardening.sql`을 실행합니다.
11. `supabase/migrations/20260831220300_security_definer_hardening.sql`을 실행합니다.
12. `supabase/seed.sql`을 실행해 함수를 정의합니다.
13. Authentication에서 사용자를 만듭니다.
14. SQL editor에서 데모 프로젝트를 넣습니다.

```sql
select public.seed_buildmirror_demo('<auth-user-uuid>');
```

15. `.env.local`을 수정합니다.

```
APP_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

GitHub webhook을 이 모드에서 받으려면 서버 전용 값도 필요합니다. `SUPABASE_SERVICE_ROLE_KEY`는 `webhook-admin` 모듈에만 쓰고, GitHub private key·webhook secret은 DB에 넣지 마세요.

RLS는 `(select auth.uid())`와 프로젝트 소유권, 같은 프로젝트의 snapshot/repository 소속을 함께 봅니다. 클라이언트가 보낸 `user_id`만 신뢰하지 않습니다.

## 라우트

- `/` 제품 소개
- `/login` 인증
- `/projects` 목록, 검색, 생성, GitHub App 설치 상태
- `/projects/[projectId]` 프로젝트 홈
- `/projects/[projectId]/settings` 이름 수정, 보관, 재활성화, 삭제, GitHub 저장소 연결
- `/api/github/setup` GitHub App Setup URL
- `/api/github/user-callback` GitHub App 사용자 승인 callback
- `/api/github/webhooks` GitHub App webhook (HMAC 검증, pending job)

## 외부 연동 경계

- `src/lib/adapters/repository-provider.ts` — 저장소 조회 인터페이스
- `src/lib/adapters/mock-repository-provider.ts` — A·B·C 상태 재현
- `src/lib/adapters/github-repository-provider.ts` — GitHub head SHA 등 나머지 연결 지점 (아직 미구현)
- `src/lib/github/config.ts` — GitHub App 환경변수 검증과 PEM `\n` 정규화
- `src/lib/github/app-auth.ts` — App JWT (RS256)
- `src/lib/github/client.ts` — installation token·저장소 목록 pagination. 토큰은 메모리 전용
- `src/lib/github/install-state.ts` — 설치 `state` HMAC과 nonce
- `src/lib/github/install-url.ts` — GitHub 설치 URL
- `src/lib/github/setup.ts` — Setup URL 검증과 pending claim
- `src/lib/github/user-callback.ts` — 사용자 승인 callback과 소유권 증명
- `src/lib/github/sync-repositories.ts` — 검증된 installation 저장소 동기화
- `src/lib/projects/link-repository.ts` — 프로젝트-저장소 연결 재검증
- `src/lib/github/webhook-http.ts` — raw body HMAC 검증과 payload 크기 제한
- `src/lib/github/webhook-handler.ts` — allowlist 이벤트 처리. clone/워커는 호출하지 않음
- `src/lib/supabase/webhook-admin.ts` — service role 클라이언트. `server-only`
- `src/lib/adapters/analysis-worker.ts` — 가비아 워커 연결 지점 (미구현)

데이터 접근은 UI에서 테이블을 직접 호출하지 않고 store를 거칩니다.

- mock: `src/lib/data/mock-project-store.ts`, `src/lib/data/mock-github-store.ts`, `src/lib/data/mock-webhook-store.ts`
- supabase: `src/lib/data/supabase-project-store.ts`, `src/lib/data/supabase-github-store.ts`, `src/lib/data/supabase-webhook-store.ts`

## 다음 개발 단계로 넘어가기 위한 조건

저장소 **clone**과 분석 워커로 넘어가려면 아래가 유지되어야 합니다.

- `.next` 없이 `npm run typecheck` 통과
- `npm run test`, `npm run lint`, `npm run build` 통과 (mock 모드, GitHub 비밀키 없이)
- 프로젝트 간 snapshot/repository 교차 참조가 DB에서 차단됨
- GitHub installation이 다른 사용자에게 연결되지 않음
- installation token과 private key가 DB에 없음
- Setup URL이 pending claim만 만들고, 사용자 승인 callback에서 `/user/installations`로 소유권을 증명한 뒤에만 연결함
- user access token을 저장하지 않고 검증 후 revoke함
- 저장소 목록은 검증된 installation에서만 조회하고, 클라이언트가 보낸 repository ID를 그대로 신뢰하지 않음
- webhook은 raw body HMAC SHA-256을 JSON 파싱 전에 검증함
- 같은 delivery를 재처리해도 job을 중복 생성하지 않음
- 기본 브랜치 push만 pending job을 만들고 clone/워커/OpenAI는 호출하지 않음
- App 삭제·저장소 제거 시 snapshot/score/학습 기록을 삭제하지 않음

clone·워커·OpenAI는 이 다음 단계입니다.

## 통합 검증 결과 (2-5)

이 저장소의 로컬 `.env.local`에는 `APP_DATA_MODE=mock`과 `NEXT_PUBLIC_APP_URL`만 있습니다. Supabase URL/키, GitHub App 비밀값, Docker, `supabase` CLI, `psql`, `gh`는 없습니다. 아래는 그 환경에서 실제로 확인한 내용입니다.

확인한 것:

- 마이그레이션 파일 순서와 webhook RPC GRANT/REVOKE, `github_webhook_deliveries`에 대한 anon/authenticated REVOKE
- `SECURITY DEFINER` RPC가 테이블을 `public.`로 참조함. hardening 마이그레이션에서 `search_path = ''`
- 인증 세션이 `github_push` job과 delivery 행을 직접 만들지 못하도록 RLS 강화
- 2026년 이후 신규 Supabase 프로젝트는 새 테이블을 Data API에 자동 GRANT하지 않음. webhook 테이블은 anon/authenticated GRANT가 없음
- mock 단위 테스트에서 서명 실패 401, secret 누락 503, 과대 payload 차단, 중복 delivery, 기본 브랜치 push만 job 생성
- `npm run test` / `typecheck` / `lint` / `build` (mock)
- GitHub Actions workflow 파일은 있으나 origin에 이 작업 커밋이 없어 Actions run이 0건

확인하지 못한 것 (통과로 보지 않음):

- 로컬/호스티드 Supabase에 마이그레이션 적용
- `verify_integrity.sql` 실행
- 사용자 A/B 세션 RLS
- Supabase advisor
- 실제 GitHub App 설치·사용자 승인·저장소 연결
- 실제 webhook `ping` / 기본 브랜치 push
- 실제 delivery 재전송
- App suspend·삭제
- GitHub Actions CI 실행

실제 연결 후 필요한 작업:

1. 개발용 Supabase에 `supabase/migrations/*.sql`을 파일명 순으로 적용하고 `verify_integrity.sql`을 실행합니다.
2. Auth 사용자 A/B로 `supabase/tests/rls_isolation.sql`을 실행합니다.
3. 테스트 GitHub App URL을 위 표와 맞추고, 최소 권한·이벤트만 켭니다.
4. 공개 HTTPS로 앱을 연 뒤 테스트 저장소에서 설치 → 승인 → 프로젝트 연결 → `ping` → 기본 브랜치 push를 확인합니다.

pending analysis job 이후 clone·정적 분석·워커·OpenAI는 아직 없습니다.

## 라이선스

아직 지정하지 않았습니다.
