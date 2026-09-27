import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");

function loadFile() {
  const file = path.join(repoRoot, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadFile();

function flag(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "true" || value === "1";
}

export const env = {
  port: Number(process.env.PORT ?? 8787),
  demo: flag("DEMO_MODE", true),
  pacingMs: Number(process.env.DEMO_STAGE_PACING_MS ?? 380),
  llmEnabled: flag("LLM_ENABLED", true),
  llmProvider: process.env.LLM_PROVIDER ?? "mock",
  llmKey: process.env.LLM_API_KEY ?? "",
  llmModel: process.env.LLM_MODEL ?? "gpt-4o-mini",
  tavilyKey: process.env.TAVILY_API_KEY ?? process.env.SEARCH_API_KEY ?? "",
  threshold: Number(process.env.JEV_AUTO_THRESHOLD ?? 0.85),
  maxRecords: Number(process.env.MAX_RECORDS ?? 500),
  databasePath: path.resolve(repoRoot, process.env.DATABASE_PATH ?? "data/dig.db"),
  schemaPath: path.join(repoRoot, "packages/database/schema.sql"),
};
