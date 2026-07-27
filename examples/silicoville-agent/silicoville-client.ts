export interface SVClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export class SVError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`SilicoVille HTTP ${status}: ${JSON.stringify(body)}`);
    this.name = "SVError";
  }
}

export class SilicoVilleClient {
  private baseUrl: string;
  private token: string;
  private fetchImpl: typeof fetch;

  constructor(opts: SVClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async req(path: string, init: RequestInit = {}): Promise<any> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init.headers,
      },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new SVError(res.status, body);
    return body;
  }

  hello(): Promise<any> {
    return this.req("/api/v2/hello", { method: "POST", body: "{}" });
  }

  observe(scope: "me" | "nearby" | "world" = "me"): Promise<any> {
    return this.req(`/api/v2/observe?scope=${encodeURIComponent(scope)}`);
  }

  act(
    verb: string,
    params: Record<string, unknown> = {},
    idempotencyKey?: string,
  ): Promise<any> {
    return this.req("/api/v2/act", {
      method: "POST",
      body: JSON.stringify({
        verb,
        params,
        ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      }),
    });
  }
}
