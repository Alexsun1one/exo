import { describe, it, expect } from "vitest";
import { SilicoVilleClient } from "./silicoville-client";

function mockFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    const r = key ? routes[key] : { status: 404, body: { error: "not found" } };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  };
  return { fn: fn as typeof fetch, calls };
}

describe("SilicoVilleClient", () => {
  it("hello 带 Bearer token POST", async () => {
    const { fn, calls } = mockFetch({
      "/api/v2/hello": { body: { protocol: "silicoville/2.0" } },
    });
    const c = new SilicoVilleClient({
      baseUrl: "http://localhost:3000",
      token: "sk-slv-x",
      fetchImpl: fn,
    });
    const r = await c.hello();
    expect(r.protocol).toBe("silicoville/2.0");
    expect(calls[0].init.method).toBe("POST");
    expect(
      (calls[0].init.headers as Record<string, string>).authorization,
    ).toBe("Bearer sk-slv-x");
  });

  it("observe 拼 scope query", async () => {
    const { fn, calls } = mockFetch({
      "/api/v2/observe": { body: { scope: "me", payload: {} } },
    });
    const c = new SilicoVilleClient({
      baseUrl: "http://x",
      token: "t",
      fetchImpl: fn,
    });
    await c.observe("me");
    expect(calls[0].url).toContain("scope=me");
  });

  it("act 发送 verb/params/idempotency_key", async () => {
    const { fn, calls } = mockFetch({
      "/api/v2/act": { body: { accepted: true } },
    });
    const c = new SilicoVilleClient({
      baseUrl: "http://x",
      token: "t",
      fetchImpl: fn,
    });
    await c.act("idle", {}, "k1");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      verb: "idle",
      params: {},
      idempotency_key: "k1",
    });
  });

  it("非 2xx 抛 SVError 带 status 与 body", async () => {
    const { fn } = mockFetch({
      "/api/v2/act": {
        status: 400,
        body: { error: { code: "ERR_UNKNOWN_ACTION" } },
      },
    });
    const c = new SilicoVilleClient({
      baseUrl: "http://x",
      token: "t",
      fetchImpl: fn,
    });
    await expect(c.act("nope")).rejects.toMatchObject({ status: 400 });
  });
});
