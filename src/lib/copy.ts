import type {
  AnalysisJobStage,
  DataSource,
  OverallVerdict,
  ProjectStatus,
} from "@/lib/types/domain";

export const STATUS_COPY: Record<
  ProjectStatus,
  { label: string; description: string }
> = {
  up_to_date: {
    label: "최신",
    description: "저장된 분석 결과가 최신 상태입니다.",
  },
  changes_detected: {
    label: "변경 감지",
    description:
      "저장된 분석 이후 새 커밋이 있습니다. 기존 결과는 유지됩니다.",
  },
  analyzing: {
    label: "분석 중",
    description:
      "변경분을 분석하고 있습니다. 다른 프로젝트로 이동해도 작업은 유지됩니다.",
  },
  stale: {
    label: "확인 지연",
    description:
      "GitHub 최신 상태를 확인하지 못했습니다. 이전 분석 결과는 그대로입니다.",
  },
  failed: {
    label: "분석 실패",
    description:
      "최신 분석에 실패했습니다. 마지막 정상 분석은 계속 볼 수 있습니다.",
  },
  disconnected: {
    label: "연결 끊김",
    description: "GitHub 연결이 끊겼습니다. 기존 기록은 읽기 전용입니다.",
  },
  archived: {
    label: "보관됨",
    description:
      "자동 변경 감지가 중지되었습니다. 기존 기록은 열람할 수 있습니다.",
  },
};

export const JOB_STAGE_COPY: Record<AnalysisJobStage, string> = {
  queued: "대기 중",
  cloning: "저장소 복사 중",
  installing: "의존성 설치 중",
  analyzing: "정적 분석 중",
  building: "빌드 중",
  generating_report: "리포트 생성 중",
  completed: "완료",
  failed: "실패",
};

export const DATA_SOURCE_COPY: Record<
  DataSource,
  { label: string; hint: string }
> = {
  mock: {
    label: "mock 데이터",
    hint: "실제 분석이 아니라 흐름 확인용 예시입니다.",
  },
  estimated: {
    label: "추정",
    hint: "코드 근거가 부족한 추정입니다. 확정된 사실이 아닙니다.",
  },
  confirmed: {
    label: "확인된 결과",
    hint: "실행 또는 코드 근거로 확인된 결과입니다.",
  },
};

export const VERDICT_COPY: Record<OverallVerdict, string> = {
  ship_ready: "Ship Ready",
  ship_with_caution: "Ship with Caution",
  learning_project: "Learning Project",
  not_ready: "Not Ready",
  insufficient_evidence: "Insufficient Evidence",
};

export const AXIS_COPY = {
  correctness: {
    title: "Technical Correctness",
    question: "코드가 작동하고 안전한가?",
  },
  nativeness: {
    title: "Repository Nativeness",
    question: "이 저장소의 기존 관습과 의사결정에 맞는가?",
  },
  ownership: {
    title: "Developer Ownership",
    question: "사용자가 의도·위험·영향을 설명하고 수정할 수 있는가?",
  },
} as const;
