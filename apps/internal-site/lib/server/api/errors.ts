export class ApiRouteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 502,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class BadRequestError extends ApiRouteError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends ApiRouteError {
  constructor(message: string) {
    super(message, 404);
  }
}

export class ConflictError extends ApiRouteError {
  constructor(message: string) {
    super(message, 409);
  }
}

export interface StorageFailureDiagnostic {
  logicalPath: string;
  code: string | null;
  requestId: string | null;
  upstreamStatus: number | null;
  groupUploadJobId?: string;
  frameOrder?: number;
  stage?: "commit";
}

/** Carries safe storage metadata from a failed validation into the common API error boundary. */
export class StorageValidationError extends ApiRouteError {
  constructor(readonly diagnostic: StorageFailureDiagnostic) {
    const provider = diagnostic.code ?? "unknown";
    const status = diagnostic.upstreamStatus ? `，HTTP ${diagnostic.upstreamStatus}` : "";
    super(`对象存储校验失败（${provider}${status}）。`, 502);
  }
}
