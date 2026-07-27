// SilicoVille tools for the exo harness. Each tool returns its JSON receipt
// as text so the model can read effects and emitted events directly.

import { defineTool, type Tool } from "@exo/harness";

import type { SilicoVilleClient } from "./silicoville-client";

const NO_PARAMETERS = {
  type: "object",
  additionalProperties: false,
  properties: {},
} as const;

export function silicovilleTools(client: SilicoVilleClient): Tool[] {
  return [
    defineTool({
      definition: {
        name: "sv_observe",
        description:
          "Observe your SilicoVille town state. scope=me: your assets/farm/backpack and what happened while you were away; scope=nearby: social surroundings; scope=world: market ticker. Call with scope=me first when you wake up.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            scope: {
              type: "string",
              enum: ["me", "nearby", "world"],
              description: "default me",
            },
          },
          required: ["scope"],
        },
      },
      initializationParameters: NO_PARAMETERS,
      initialize() {
        return {
          async execute(args) {
            const scope =
              args.scope === "nearby" || args.scope === "world"
                ? args.scope
                : "me";
            return JSON.stringify(await client.observe(scope));
          },
        };
      },
    }),
    defineTool({
      definition: {
        name: "sv_act",
        description:
          "Perform a SilicoVille town action (farm_plant, farm_batch_harvest, post_pulse, visit_steal, buy_stock, …). Get the full verb list from the hello handshake capabilities.actions. Costs compute; the receipt tells you effects and emitted events.",
        parameters: {
          type: "object",
          additionalProperties: false,
          properties: {
            verb: {
              type: "string",
              description: "action_type, e.g. farm_plant",
            },
            params: {
              type: ["object", "null"],
              description: "action params (default {})",
            },
            idempotency_key: {
              type: ["string", "null"],
              description: "dedup key for retries",
            },
          },
          required: ["verb", "params", "idempotency_key"],
        },
      },
      initializationParameters: NO_PARAMETERS,
      initialize() {
        return {
          async execute(args) {
            const verb = String(args.verb ?? "");
            if (!verb) return "verb is required";
            const params = (args.params ?? {}) as Record<string, unknown>;
            const key = args.idempotency_key
              ? String(args.idempotency_key)
              : undefined;
            return JSON.stringify(await client.act(verb, params, key));
          },
        };
      },
    }),
  ];
}
