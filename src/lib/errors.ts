export class AppError extends Error {
  readonly userMessage: string;
  readonly developerCause: string;
  readonly code: string;
  readonly status: number;

  constructor(options: {
    userMessage: string;
    developerCause: string;
    code: string;
    status?: number;
  }) {
    super(options.userMessage);
    this.name = "AppError";
    this.userMessage = options.userMessage;
    this.developerCause = options.developerCause;
    this.code = options.code;
    this.status = options.status ?? 400;
  }
}

export class NotImplementedError extends AppError {
  constructor(feature: string, code: string) {
    super({
      userMessage: `${feature}는 아직 구현되지 않았습니다.`,
      developerCause: `Not implemented adapter boundary: ${code}`,
      code,
      status: 501,
    });
    this.name = "NotImplementedError";
  }
}

export function toUserErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.userMessage;
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function toDeveloperCause(error: unknown): string {
  if (error instanceof AppError) {
    return `${error.code}: ${error.developerCause}`;
  }
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }
  return String(error);
}
