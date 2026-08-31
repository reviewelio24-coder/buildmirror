# BuildMirror

AI가 만든 코드를 이해하고, 검증하고, 책임질 수 있게 만드는 **AI Code Ownership Platform**입니다.

이 저장소의 제품 요구사항 기준은 [`docs/BuildMirror_PRD_v0.2.md`](docs/BuildMirror_PRD_v0.2.md)입니다.

현재 코드는 전체 제품을 구현하지 않습니다. GitHub App, 분석 워커, AI 평가를 나중에 붙일 수 있도록 **웹 앱 기반과 다중 프로젝트 관리 흐름**만 제공합니다.

## 지금 구현된 범위

- Next.js App Router, TypeScript strict, Tailwind CSS
- 로그인 경계 (`/login`, `/projects` 보호)
- mock 모드에서 데모 계정으로 전체 화면 흐름 확인
- Supabase Auth/Postgres/RLS를 연결할 수 있는 클라이언트와 마이그레이션
- 사용자별 다중 프로젝트 목록, 검색, 생성, 전환, 보관, 재활성화, 삭제
- 프로젝트별 대시보드, 분석 스냅샷, 분석 작업 상태, 점수, 알림, 학습 과제 표시
- 프로젝트 A·B·C mock 데이터로 전환 시 기록 격리 확인
- GitHub / 분석 워커 / AI 연동을 위한 adapter 경계와 `TODO`

## 지금 구현되지 않은 것

다음 기능은 화면에서 작동하는 것처럼 꾸미지 않았습니다. 호출하면 미구현 오류이거나 mock 안내를 보여 줍니다.

- 실제 GitHub OAuth 또는 GitHub App 설치
- 저장소 clone
- build / typecheck / lint / test를 실행하는 분석 워커
- 가비아 클라우드 워커, Docker 샌드박스
- OpenAI API 호출과 AI 분석 결과 생성
- Repository Fingerprint / Project Constitution 판정
- 결제, 이메일, 음성 면접, 자동 코드 수정, Pull Request 생성

## 요구 환경

- Node.js 20 이상 (개발 시 24.x로 확인)
- npm (이 저장소의 lockfile은 npm입니다)

## 설치와 실행

```bash
npm install
copy .env.example .env.local
```

Windows PowerShell에서는 아래를 사용해도 됩니다.

```powershell
Copy-Item .env.example .env.local
```

기본값은 mock 모드입니다. `.env.local`에 최소한 다음을 두면 됩니다.

```
APP_DATA_MODE=mock
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

개발 서버:

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 연 뒤 **로그인 → 데모 계정으로 시작**을 선택합니다.

검증 명령:

```bash
npm run test
npm run lint
npm run typecheck
npm run build
```

## 환경변수

| 이름 | 공개 여부 | 설명 |
|------|-----------|------|
| `APP_DATA_MODE` | 서버 전용 | `mock` 또는 `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개 | RLS와 함께 쓰는 anon key. service_role이 아닙니다. |
| `NEXT_PUBLIC_APP_URL` | 공개 | 앱 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 비밀 | 앱 런타임과 클라이언트에 넣지 마세요. |

`.env.example`에는 실제 비밀값이 들어 있지 않습니다. `service_role` 키는 클라이언트 번들에 노출하지 마세요.

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
2. SQL Editor에서 `supabase/migrations/20260831000000_init.sql`을 실행합니다.
3. 같은 방식으로 `supabase/seed.sql`을 실행합니다.
4. Authentication에서 사용자를 만듭니다.
5. 아래를 실행해 데모 프로젝트를 넣습니다.

```sql
select public.seed_buildmirror_demo('<auth-user-uuid>');
```

6. `.env.local`을 수정합니다.

```
APP_DATA_MODE=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

RLS는 `auth.uid()`와 프로젝트 소유권을 비교합니다. 클라이언트가 보낸 `user_id`만 신뢰하지 않습니다.

## 라우트

- `/` 제품 소개
- `/login` 인증
- `/projects` 목록, 검색, 생성
- `/projects/[projectId]` 프로젝트 홈
- `/projects/[projectId]/settings` 이름 수정, 보관, 재활성화, 삭제

## 외부 연동 경계

- `src/lib/adapters/repository-provider.ts` — 저장소 조회 인터페이스
- `src/lib/adapters/mock-repository-provider.ts` — A·B·C 상태 재현
- `src/lib/adapters/github-repository-provider.ts` — GitHub App 연결 지점 (미구현)
- `src/lib/adapters/analysis-worker.ts` — 가비아 워커 연결 지점 (미구현)

데이터 접근은 UI에서 테이블을 직접 호출하지 않고 `ProjectStore`를 거칩니다.

- mock: `src/lib/data/mock-project-store.ts`
- supabase: `src/lib/data/supabase-project-store.ts`

## 다음 작업으로 권장하는 범위

1. GitHub App 설치와 저장소 목록/head SHA 조회를 `GitHubRepositoryProvider`에 연결
2. 분석 작업 큐와 가비아 워커 상태를 실제 `analysis_jobs` 갱신으로 연결
3. 불변 스냅샷에 build/typecheck/lint/test 결과를 저장
4. 그 다음에만 OpenAI structured output으로 설명과 학습 과제를 생성

## 라이선스

아직 지정하지 않았습니다.
