type JsonResponseParser<T> = (payload: unknown) => T;

interface ReadJsonResponseOptions<T> {
  allowEmpty?: boolean;
  fallbackMessage?: string;
  parse?: JsonResponseParser<T>;
}

interface RequestJsonOptions<T> extends ReadJsonResponseOptions<T> {
  init?: RequestInit;
}

export class InternalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = "InternalApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return null;
  return (
    value.find((item): item is string => typeof item === "string" && Boolean(item.trim())) ?? null
  );
}

/** Converts both string errors and Zod's flattened field errors into one readable client message. */
function errorMessageFromPayload(payload: unknown): string | null {
  if (!isRecord(payload)) return null;

  const directError = firstString(payload.error);
  if (directError) return directError;
  const directMessage = firstString(payload.message);
  if (directMessage) return directMessage;
  if (!isRecord(payload.error)) return null;

  const formError = firstString(payload.error.formErrors);
  if (formError) return formError;
  if (!isRecord(payload.error.fieldErrors)) return null;
  for (const [field, errors] of Object.entries(payload.error.fieldErrors)) {
    const message = firstString(errors);
    if (message) return `${field}: ${message}`;
  }
  return null;
}

function parseResponsePayload(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Reads a response body once so success parsing and structured error reporting cannot diverge. */
export async function readJsonResponse<T>(
  response: Response,
  options: ReadJsonResponseOptions<T> = {},
): Promise<T> {
  const text = await response.text();
  const payload = parseResponsePayload(text);
  const fallbackMessage =
    options.fallbackMessage ?? `Request failed with ${response.status || "an unknown status"}.`;

  if (!response.ok) {
    throw new InternalApiError(
      errorMessageFromPayload(payload) ?? fallbackMessage,
      response.status,
      payload,
    );
  }

  if (!text && options.allowEmpty) return undefined as T;
  if (payload === null) {
    throw new InternalApiError(fallbackMessage, response.status, payload);
  }

  if (!options.parse) return payload as T;
  try {
    return options.parse(payload);
  } catch (error) {
    if (error instanceof InternalApiError) throw error;
    throw new InternalApiError(
      error instanceof Error ? error.message : fallbackMessage,
      response.status,
      payload,
    );
  }
}

/** Leaves transport errors untouched while applying the shared JSON contract to HTTP responses. */
export async function requestJson<T>(
  input: RequestInfo | URL,
  options: RequestJsonOptions<T> = {},
): Promise<T> {
  const response = await fetch(input, options.init);
  return readJsonResponse(response, options);
}

export function postJson<T>(
  input: RequestInfo | URL,
  body: unknown,
  options: Omit<RequestJsonOptions<T>, "init"> & { signal?: AbortSignal } = {},
): Promise<T> {
  const { signal, ...responseOptions } = options;
  return requestJson<T>(input, {
    ...responseOptions,
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    },
  });
}
