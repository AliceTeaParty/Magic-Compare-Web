import { NextResponse } from "next/server";
import { ZodError } from "zod";

type RouteHandler = (request: Request) => Promise<NextResponse>;

/**
 * Wraps an API route handler with consistent error classification and logging so individual route
 * files stay focused on business logic instead of repeating identical try/catch boilerplate.
 */
export function withApiRoute(
  handler: (request: Request) => Promise<NextResponse>,
  options?: {
    /** Maps domain-specific error classes to HTTP status codes before the generic fallback runs. */
    classifyError?: (error: unknown) => number | null;
  },
): RouteHandler {
  return async (request: Request) => {
    try {
      return await handler(request);
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
  };
}
