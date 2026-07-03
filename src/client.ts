export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type QueryParams = Record<string, string | number | boolean | undefined>;

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

  async get<T>(path: string, params?: QueryParams): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    const response = await fetch(url.toString(), { headers: this.headers });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify(body),
    });
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
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: form,
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(body),
    });
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
   */
  async mergePut<T>(path: string, fields: Record<string, unknown>): Promise<T> {
    const current = await this.get<Record<string, unknown>>(path);
    const currentWithoutNulls = Object.fromEntries(
      Object.entries(current).filter(([, value]) => value !== null)
    );
    return this.put<T>(path, { ...currentWithoutNulls, ...fields });
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
