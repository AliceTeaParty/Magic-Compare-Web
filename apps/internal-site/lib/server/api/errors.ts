export class ApiRouteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
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
