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

  constructor(apiKey: string, orgId: string) {
    this.headers = {
      Authorization: `Token ${apiKey}`,
      "X-Elorus-Organization": orgId,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
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

  async patch<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let details = response.statusText;
      try {
        const body = await response.json();
        details = JSON.stringify(body);
      } catch {
        // use statusText
      }
      throw new Error(formatError(response.status, details));
    }
    return response.json() as Promise<T>;
  }
}

function formatError(status: number, details: string): string {
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
