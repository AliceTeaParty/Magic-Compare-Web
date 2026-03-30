import { NextResponse } from "next/server";
import { ZodError } from "zod";

type WrappedRouteHandler<TArgs extends unknown[]> = (...args: TArgs) => Promise<NextResponse>;
type NextRouteHandler = (request: Request, context?: unknown) => Promise<NextResponse>;
type RouteHandler<TArgs extends unknown[]> = WrappedRouteHandler<TArgs> & NextRouteHandler;

type WithApiRouteOptions = {
  /** Maps domain-specific error classes to HTTP status codes before the generic fallback runs. */
  classifyError?: (error: unknown) => number | null;
};

/**
 * Wraps an API route handler with consistent error classification and 5xx logging so individual
 * route files stay focused on business logic instead of repeating identical try/catch boilerplate.
 */
export function withApiRoute(
  handler: () => Promise<NextResponse>,
  options?: WithApiRouteOptions,
): RouteHandler<[]>;
export function withApiRoute<TContext extends unknown[]>(
  handler: (request: Request, ...args: TContext) => Promise<NextResponse>,
  options?: WithApiRouteOptions,
): RouteHandler<[Request, ...TContext]>;
export function withApiRoute<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<NextResponse>,
  options?: WithApiRouteOptions,
): RouteHandler<TArgs> {
  return (async (...args: unknown[]) => {
    const maybeRequest = args[0];
    const request = maybeRequest instanceof Request ? maybeRequest : undefined;

    try {
      return await handler(...(args as TArgs));
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json({ error: error.flatten() }, { status: 400 });
      }

      const customStatus = options?.classifyError?.(error);
      if (customStatus) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Operation failed." },
          { status: customStatus },
        );
      }

      const message = error instanceof Error ? error.message : "Internal server error.";
      console.error(`[API] ${request?.url ?? "unknown"}:`, error);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }) as RouteHandler<TArgs>;
}
