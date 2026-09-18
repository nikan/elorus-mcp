export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

/** Bounds the base64-encoded blob returned to an MCP client over stdio. */
const MAX_BINARY_RESPONSE_BYTES = 10 * 1024 * 1024;

/** Every request gets this deadline so a stalled connection can't hang a tool call indefinitely. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Bounded backoff for idempotent reads only — writes/payments are never auto-retried. */
const MAX_GET_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 10_000;

export interface BinaryResponse {
  data: Buffer;
  contentType: string;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return Math.max(0, Math.min(seconds * 1000, MAX_RETRY_DELAY_MS));
    }
    const dateMs = Date.parse(retryAfter);
    if (!Number.isNaN(dateMs)) {
      return Math.max(0, Math.min(dateMs - Date.now(), MAX_RETRY_DELAY_MS));
    }
  }
  return Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Field names that appear across Elorus GET responses but are always server-computed —
 * writing them back on a PUT is never correct. Not resource-specific: applied generically
 * by mergePut, since each field is either universally read-only (id, organization, created,
 * modified) or read-only wherever it does appear (representation, status, totals, permalink).
 */
const READ_ONLY_RESPONSE_FIELDS = new Set([
  "id",
  "organization",
  "created",
  "modified",
  "representation",
  "display_name",
  "status",
  "permalink",
  "initial",
  "net",
  "total",
  "payable",
  "paid",
  "last_execution",
  "next_execution",
]);

export class ElorusClient {
  private readonly baseUrl = "https://api.elorus.com/v1.2";
  private readonly headers: Record<string, string>;

  constructor(apiKey: string, orgId: string, demo = false) {
    this.headers = {
      Authorization: `Token ${apiKey}`,
      "X-Elorus-Organization": orgId,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (demo) {
      this.headers["X-Elorus-Demo"] = "1";
    }
  }

  /** Wraps fetch with the request deadline and a clear timeout error message. */
  private async fetchWithTimeout(url: string, init: RequestInit, path: string): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
        throw new Error(`Elorus API error: request to ${path} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  }

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    let response = await this.fetchWithTimeout(url.toString(), { headers: this.headers }, path);
    for (let attempt = 0; isRetryableStatus(response.status) && attempt < MAX_GET_RETRIES; attempt++) {
      await sleep(retryDelayMs(response, attempt));
      response = await this.fetchWithTimeout(url.toString(), { headers: this.headers }, path);
    }
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${path}`,
      { method: "POST", headers: this.headers, body: JSON.stringify(body) },
      path
    );
    return this.handleResponse<T>(response);
  }

  /**
   * Elorus attachment endpoints require multipart/form-data. The hardcoded
   * Content-Type on `this.headers` is for JSON requests, so it must be dropped
   * here — fetch sets the correct multipart boundary itself when given a FormData body.
   */
  async postMultipart<T>(path: string, form: FormData): Promise<T> {
    const headers = { ...this.headers };
    delete headers["Content-Type"];
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${path}`,
      { method: "POST", headers, body: form },
      path
    );
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${path}`,
      { method: "PATCH", headers: this.headers, body: JSON.stringify(body) },
      path
    );
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${path}`,
      { method: "PUT", headers: this.headers, body: JSON.stringify(body) },
      path
    );
    return this.handleResponse<T>(response);
  }

  /**
   * For endpoints (e.g. PDF exports) that return a binary body instead of JSON.
   * `handleResponse` always calls `response.json()`, so this bypasses it entirely.
   */
  async getBinary(path: string): Promise<BinaryResponse> {
    const headers = { ...this.headers, Accept: "application/pdf" };
    const response = await this.fetchWithTimeout(`${this.baseUrl}${path}`, { headers }, path);
    if (!response.ok) {
      let details = response.statusText;
      try {
        const body = await response.json();
        details = formatDrfError(body);
      } catch {
        // use statusText
      }
      throw new Error(formatHttpError(response.status, details));
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.includes("pdf")) {
      throw new Error(
        `Elorus API error: expected a PDF response from ${path} but got Content-Type "${contentType}"`
      );
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_BINARY_RESPONSE_BYTES) {
      throw new Error(
        `Elorus API error: PDF at ${path} is ${contentLength} bytes, exceeding the ` +
          `${MAX_BINARY_RESPONSE_BYTES}-byte limit for inline MCP responses`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > MAX_BINARY_RESPONSE_BYTES) {
      throw new Error(
        `Elorus API error: PDF at ${path} is ${arrayBuffer.byteLength} bytes, exceeding the ` +
          `${MAX_BINARY_RESPONSE_BYTES}-byte limit for inline MCP responses`
      );
    }
    return { data: Buffer.from(arrayBuffer), contentType };
  }

  async delete<T>(path: string): Promise<T> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${path}`,
      { method: "DELETE", headers: this.headers },
      path
    );
    return this.handleResponse<T>(response);
  }

  /**
   * Elorus doesn't support PATCH on every resource (expenses, contacts, products
   * only accept PUT, which requires the full representation — e.g. expenses reject
   * a PUT missing `items`). This fetches the current record, merges the partial
   * fields on top, and PUTs the result so callers still get PATCH-like semantics.
   *
   * Some optional relations (e.g. a contact's `default_template`) round-trip as
   * `null` from GET but reject an explicit `null` on write ("This field may not
   * be null") — they must be omitted instead. So null-valued fields from the
   * fetched record are dropped before merging; explicit nulls the caller passes
   * in `fields` are preserved.
   *
   * GET responses also include server-computed fields (id, organization, created,
   * modified, computed totals, permalinks, status, ...) that are never legal to
   * write back. These are stripped so the PUT only resends real input fields —
   * writing back read-only noise risks the API rejecting the request outright on
   * some resources, and always risks masking a concurrent server-side change to
   * one of those computed values between the GET and the PUT.
   */
  async mergePut<T>(path: string, fields: Record<string, unknown>): Promise<T> {
    const current = await this.get<Record<string, unknown>>(path);
    const writableCurrent = Object.fromEntries(
      Object.entries(current).filter(
        ([key, value]) => value !== null && !READ_ONLY_RESPONSE_FIELDS.has(key)
      )
    );
    return this.put<T>(path, { ...writableCurrent, ...fields });
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let details = response.statusText;
      try {
        const body = await response.json();
        details = formatDrfError(body);
      } catch {
        // use statusText
      }
      throw new Error(formatHttpError(response.status, details));
    }
    if (response.status === 204) {
      return {} as T;
    }
    return response.json() as Promise<T>;
  }
}

/**
 * Converts a Django REST Framework error body into a human-readable string.
 * DRF produces three shapes:
 *   {"detail": "string"}          — single top-level message
 *   {"field": ["msg", ...], ...}  — per-field validation errors
 *   ["msg", ...]                  — non-field errors list
 */
export function formatDrfError(body: unknown): string {
  if (typeof body === "string") return body;

  if (Array.isArray(body)) {
    return body
      .map((item) =>
        item !== null && typeof item === "object" ? formatDrfError(item) : String(item)
      )
      .join("; ");
  }

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;

    if (typeof obj["detail"] === "string") {
      return obj["detail"];
    }

    const parts: string[] = [];
    for (const [field, messages] of Object.entries(obj)) {
      if (Array.isArray(messages)) {
        parts.push(`${field}: ${formatDrfError(messages)}`);
      } else if (typeof messages === "string") {
        parts.push(`${field}: ${messages}`);
      } else if (messages && typeof messages === "object") {
        parts.push(`${field}: ${formatDrfError(messages)}`);
      }
    }
    if (parts.length > 0) return parts.join("; ");
  }

  return JSON.stringify(body);
}

export function formatHttpError(status: number, details: string): string {
  const labels: Record<number, string> = {
    400: "Bad request",
    401: "Unauthorized — check ELORUS_API_KEY",
    403: "Forbidden — check ELORUS_ORG_ID and user permissions",
    404: "Not found",
    429: "Rate limit exceeded — retry after a moment",
  };
  const label = labels[status] ?? `HTTP ${status}`;
  return `Elorus API error: ${label}: ${details}`;
}
