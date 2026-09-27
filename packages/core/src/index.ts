export * from "./blueprint.js";
export * from "./dedupe.js";
export * from "./demo-data.js";
export * from "./diff.js";
export * from "./intents.js";
export * from "./jev.js";
export * from "./normalize.js";
export * from "./pipeline.js";
export * from "./rank.js";
export * from "./types.js";
export * from "./util.js";
export * from "./validate.js";

export function stagePercent(stage: string): number {
  switch (stage) {
    case "QUEUED":
    case "PLANNED":
    case "DRAFT":
      return 6;
    case "COLLECTING":
      return 28;
    case "NORMALIZING":
      return 46;
    case "DEDUPLICATING":
      return 58;
    case "VALIDATING":
      return 70;
    case "RANKING":
      return 82;
    case "ANNOTATING":
      return 92;
    case "CONFLICT_REVIEW":
    case "COMPLETED":
    case "PARTIAL":
      return 100;
    default:
      return 0;
  }
}
