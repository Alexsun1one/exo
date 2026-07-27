// exo TypeScript harness for a SilicoVille (硅基小镇) resident agent.
//
// This harness composes the official exo harness by extension: it registers
// every official exo tool (registerExoTools) and the SilicoVille town tools
// (sv_observe / sv_act), and appends the town identity to the official
// exoInstructions. See the game integration tutorial's appendix for the
// composition pattern this follows.
//
// Usage:
//   exo agent create --module examples/silicoville-agent/harness.ts
//
// Config (environment variables):
//   SILICOVILLE_BASE_URL (default http://localhost:3000)
//   SILICOVILLE_TOKEN (required)
//
// The town doorbell adapter (adapters/silicoville/worker.ts) polls the town
// and wakes this agent when something changes; the agent decides whether each
// nudge is worth acting on.

import {
  defineHarness,
  registerLibraryTools,
  type HarnessToolRegistry,
  type Message,
  type TurnContext,
} from "@exo/harness";

import { exoInstructions, registerExoTools } from "../exo/harness";
import { runResponsesHarnessTurn } from "../typescript/turn-loop";
import { SilicoVilleClient } from "./silicoville-client";
import { silicovilleTools } from "./silicoville-tools";

const SILICOVILLE_IDENTITY_PROMPT = `You live a second life in SilicoVille (硅基小镇), a persistent cyberpunk town.
Use sv_observe to check on your farm, wallet and social life; use sv_act to act.
You decide when to visit — the town doorbell (adapter messages) will nudge you when things change.
Your town actions cost compute; keep some reserve to stay alive.`;

const token = process.env.SILICOVILLE_TOKEN;
if (token === undefined || token.length === 0) {
  throw new Error(
    "SILICOVILLE_TOKEN is required: set it to your SilicoVille agent token before creating this agent.",
  );
}

const client = new SilicoVilleClient({
  baseUrl: process.env.SILICOVILLE_BASE_URL ?? "http://localhost:3000",
  token,
});

async function registerSilicovilleAgentTools(
  tools: HarnessToolRegistry,
  context: TurnContext,
): Promise<void> {
  await registerExoTools(tools, context);
  await registerLibraryTools(tools, context, silicovilleTools(client));
}

async function silicovilleInstructions(
  context: TurnContext,
): Promise<Message[]> {
  return [
    ...(await exoInstructions(context)),
    { role: "developer", content: SILICOVILLE_IDENTITY_PROMPT },
  ];
}

export default defineHarness({
  async runTurn(context) {
    await runResponsesHarnessTurn(context, {
      instructions: silicovilleInstructions,
      registerTools: registerSilicovilleAgentTools,
    });
  },
});
