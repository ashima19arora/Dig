import { createHash } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function daysBetween(fromIso: string, now: Date): number {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return 365;
  return Math.max(0, (now.getTime() - then) / 86_400_000);
}

export function domainOf(url: string): string {
  try {
    const withProto = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

export function stable(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, inner]) => [key, sortValue(inner)]));
  }
  return value;
}

export function backoffMs(attemptIndex: number): number {
  return 1000 * 2 ** attemptIndex;
}

export class PipelineError extends Error {
  retryable: boolean;
  code: string;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    delay?: (attemptIndex: number) => number;
    jitter?: number;
    isRetryable?: (error: unknown) => boolean;
  },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const sleep = options?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const delay = options?.delay ?? backoffMs;
  const jitterRatio = options?.jitter ?? 0.15;
  const isRetryable =
    options?.isRetryable ??
    ((error: unknown) => (error instanceof PipelineError ? error.retryable : false));
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt === attempts || !isRetryable(error)) break;
      const base = delay(attempt - 1);
      const jitter = base * jitterRatio * Math.random();
      await sleep(Math.round(base + jitter));
    }
  }
  throw last;
}
