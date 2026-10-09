import {
  conflictFromJev,
  deterministicTrust,
  jevConflictCall,
  jevTrustCall,
  mockJevProvider,
  trustFromJev,
  type JevDecision,
  type JevInput,
  type JevProvider,
  type TrustDecision,
  type TrustInput,
  type TrustProvider,
} from "@dig/core";
import { env } from "./env.js";

const DEFAULT_URL = "https://openrouter.ai/api/alpha/decisions";

function endpoint() {
  const configured = env.jevBaseUrl.trim();
  return configured || DEFAULT_URL;
}

/** Live Jev only when a key is present and this is not a demo run. */
export function jevEnabled(demo = false) {
  return !demo && env.trustProvider === "jev" && Boolean(env.jevKey);
}

async function askJev(call: ReturnType<typeof jevTrustCall>): Promise<unknown> {
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.jevKey}`,
    },
    body: JSON.stringify({ model: env.jevModel, ...call }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Jev ${response.status}`);
  return response.json();
}

export function jevTrustProvider(): TrustProvider {
  if (!jevEnabled()) return { id: "mock", model: "deterministic", decide: (input) => deterministicTrust(input) };
  const model = env.jevModel;
  return {
    id: "jev",
    model,
    decide: (input) => oneTrust(input, model),
    decideMany: (inputs) => Promise.all(inputs.map((input) => oneTrust(input, model))),
  };
}

async function oneTrust(input: TrustInput, model: string): Promise<TrustDecision> {
  const body = await askJev(jevTrustCall(input));
  return trustFromJev(body, input, model) ?? deterministicTrust(input, "mock", "deterministic-fallback");
}

export function jevConflictProvider(demo = false): JevProvider {
  if (!jevEnabled(demo)) return mockJevProvider;
  return {
    id: "jev",
    async decide(input: JevInput): Promise<JevDecision> {
      try {
        const body = await askJev(jevConflictCall(input));
        return conflictFromJev(body, input) ?? mockJevProvider.decide(input);
      } catch {
        return mockJevProvider.decide(input);
      }
    },
  };
}
