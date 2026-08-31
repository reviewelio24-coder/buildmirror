import type { AnalysisJob, AnalysisJobType } from "@/lib/types/domain";
import { NotImplementedError } from "@/lib/errors";

export type EnqueueAnalysisJobInput = {
  projectId: string;
  snapshotId?: string | null;
  type: AnalysisJobType;
};

export interface AnalysisWorker {
  enqueue(input: EnqueueAnalysisJobInput): Promise<AnalysisJob>;
  getJob(jobId: string): Promise<AnalysisJob | null>;
}

/**
 * 가비아 클라우드 분석 워커 연동 지점.
 * 큐 생성, clone, install, build, 리포트 생성은 여기서 구현한다.
 */
export class UnimplementedAnalysisWorker implements AnalysisWorker {
  async enqueue(): Promise<AnalysisJob> {
    throw new NotImplementedError("분석 워커 작업 큐", "ANALYSIS_WORKER_ENQUEUE");
  }

  async getJob(): Promise<AnalysisJob | null> {
    throw new NotImplementedError("분석 워커 작업 조회", "ANALYSIS_WORKER_GET_JOB");
  }
}
