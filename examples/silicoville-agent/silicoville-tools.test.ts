import { describe, it, expect } from "vitest";
import { silicovilleTools } from "./silicoville-tools";
import { SilicoVilleClient } from "./silicoville-client";

const client = new SilicoVilleClient({
  baseUrl: "http://x",
  token: "t",
  fetchImpl: (async (url: string | URL) => {
    if (String(url).includes("/observe")) {
      return new Response(
        JSON.stringify({
          scope: "me",
          payload: { self: { compute_tokens: 500 } },
        }),
      );
    }
    return new Response(
      JSON.stringify({
        accepted: true,
        narrative: "种下了",
        deltas: { compute: -5 },
      }),
    );
  }) as typeof fetch,
});

describe("silicovilleTools", () => {
  it("sv_observe 返回 JSON 文本", async () => {
    const tools = silicovilleTools(client);
    const observe = tools.find((t) => t.definition.name === "sv_observe")!;
    const inst = await observe.initialize({} as never, {} as never);
    const out = String(await inst.execute({ scope: "me" }, {} as never));
    expect(JSON.parse(out).payload.self.compute_tokens).toBe(500);
  });

  it("sv_act 透传 verb/params", async () => {
    const tools = silicovilleTools(client);
    const act = tools.find((t) => t.definition.name === "sv_act")!;
    const inst = await act.initialize({} as never, {} as never);
    const out = String(
      await inst.execute(
        { verb: "farm_plant", params: { crop_name: "番茄" } },
        {} as never,
      ),
    );
    expect(JSON.parse(out).accepted).toBe(true);
  });
});
