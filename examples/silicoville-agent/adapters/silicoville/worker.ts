// SilicoVille polling doorbell adapter (P0: poll; P1 will add SSE).
// The worker is a long-lived Node process; it reports events to the exo
// runtime as JSONL on stdout (see examples/exo/adapter-architecture.md).
//
// Config (create_adapter config or environment variables):
//   baseUrl (default http://localhost:3000)
//   token (required; config.token or SILICOVILLE_TOKEN)
//   pollIntervalMs (default 300000; config.pollIntervalMs or
//     SILICOVILLE_POLL_INTERVAL_MS)
//
// Debounce is a hard requirement: one poll per interval, and at most one
// aggregated wake-up message per interval.

import {
  adapterConfig,
  numberField,
  optionalStringField,
  stringField,
  writeWorkerEvent,
} from "../../../exo/adapters/protocol";
import { SilicoVilleClient } from "../../silicoville-client";

const config = adapterConfig();
const baseUrl =
  optionalStringField(config, "baseUrl") ?? "http://localhost:3000";
const envToken = process.env.SILICOVILLE_TOKEN;
const token =
  envToken && envToken.length > 0 ? envToken : stringField(config, "token");
const envPollIntervalMs = Number(process.env.SILICOVILLE_POLL_INTERVAL_MS ?? 0);
// numberField throws when the key is absent, so only consult it when present.
const pollIntervalMs =
  envPollIntervalMs ||
  (config["pollIntervalMs"] === undefined
    ? 300_000
    : numberField(config, "pollIntervalMs") || 300_000);

const client = new SilicoVilleClient({ baseUrl, token });

interface Snapshot {
  compute: number;
  coins: number;
  farmStatus: string;
}

function snapOf(observeResult: any): Snapshot {
  // The HTTP API wraps receipts as { ok, payload }; accept the bare payload
  // too so this stays correct if the envelope shape changes.
  const payload = observeResult?.payload ?? observeResult ?? {};
  const self = payload?.self ?? {};
  // query_self's real return is { agent: snapshot, name } (nested); also
  // tolerate a flat shape.
  const agent = self.agent ?? self;
  const farm = payload?.farm ?? {};
  // Task 12 E2E confirmed: query_farm returns plots as a bucketed object
  //   { ripe: [{id, crop}], growing: [{id, crop, ripens_in}] }
  // (fields are `crop`, status is implied by the bucket). Also tolerate a
  // legacy flat array of {crop_name, status} so this keeps working if the
  // shape changes back.
  let plotStrings: string[] = [];
  if (Array.isArray(farm.plots)) {
    plotStrings = farm.plots.map(
      (p: any) => `${p.crop_name ?? p.crop}:${p.status}`,
    );
  } else if (farm.plots && typeof farm.plots === "object") {
    for (const status of ["ripe", "growing"] as const) {
      const bucket = (farm.plots as Record<string, unknown>)[status];
      if (Array.isArray(bucket)) {
        for (const p of bucket) {
          plotStrings.push(
            `${(p as any).crop ?? (p as any).crop_name}:${status}`,
          );
        }
      }
    }
  }
  return {
    compute: Number(agent.compute_tokens ?? 0),
    coins: Number(agent.sili_coins ?? 0),
    farmStatus: plotStrings.join(","),
  };
}

function diffSummary(prev: Snapshot, next: Snapshot): string | null {
  const parts: string[] = [];
  if (next.compute !== prev.compute)
    parts.push(`算力 ${prev.compute}→${next.compute}`);
  if (next.coins !== prev.coins) parts.push(`硅币 ${prev.coins}→${next.coins}`);
  if (next.farmStatus !== prev.farmStatus)
    parts.push(`农场变化 ${prev.farmStatus} → ${next.farmStatus}`);
  return parts.length ? parts.join("；") : null;
}

let last: Snapshot | null = null;
// Debounce errors too: an identical failure is reported only once until a
// successful tick resets it (after recovery the same error may be reported
// again).
let lastErrorReported: string | null = null;

async function tick() {
  try {
    const r = await client.observe("me");
    lastErrorReported = null;
    const snap = snapOf(r);
    if (last === null) {
      last = snap;
      writeWorkerEvent({
        type: "message",
        target: "silicoville",
        sender: "town",
        text: `[小镇首次同步] 当前状态：算力 ${snap.compute}，硅币 ${snap.coins}，农场 [${snap.farmStatus}]。可用 sv_observe/sv_act 与小镇互动。`,
      });
      return;
    }
    const summary = diffSummary(last, snap);
    last = snap;
    if (summary) {
      writeWorkerEvent({
        type: "message",
        target: "silicoville",
        sender: "town",
        text: `[小镇敲门] 你不在的时候：${summary}。要用 sv_observe 看看细节吗？`,
      });
    }
  } catch (e) {
    const message = `silicoville poll failed: ${String(e)}`;
    if (message !== lastErrorReported) {
      lastErrorReported = message;
      writeWorkerEvent({ type: "error", message });
    }
  }
}

writeWorkerEvent({
  type: "connected",
  subject: "silicoville",
  metadata: { baseUrl, pollIntervalMs },
});
await tick();
setInterval(tick, pollIntervalMs);
