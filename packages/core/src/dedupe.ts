import { identityKey, similarity } from "./normalize.js";
import type { CollectedRecord } from "./types.js";

export interface DedupeResult {
  records: Array<CollectedRecord & { flags: string[] }>;
  merged: number;
  possible: number;
}

export function dedupeRecords(records: CollectedRecord[], identityFields: string[]): DedupeResult {
  const buckets: Array<CollectedRecord & { flags: string[] }> = [];
  let merged = 0;
  let possible = 0;

  for (const record of records) {
    const key = identityKey(record.fields, identityFields);
    let matchIndex = -1;
    let possibleIndex = -1;
    buckets.forEach((existing, index) => {
      const existingKey = identityKey(existing.fields, identityFields);
      const score = similarity(key, existingKey);
      if (score >= 0.97 || key === existingKey) matchIndex = index;
      else if (score >= 0.9 && possibleIndex < 0) possibleIndex = index;
    });

    if (matchIndex >= 0) {
      const existing = buckets[matchIndex];
      if (!existing) continue;
      merged += 1;
      const fields = { ...existing.fields };
      for (const [field, value] of Object.entries(record.fields)) {
        if (!fields[field] && value) fields[field] = value;
      }
      buckets[matchIndex] = {
        ...existing,
        fields,
        sources: [...existing.sources, ...record.sources],
        ambiguousFields: [...new Set([...(existing.ambiguousFields ?? []), ...(record.ambiguousFields ?? [])])],
        flags: existing.flags.filter((flag) => flag !== "POSSIBLE_DUPLICATE"),
        contactability: existing.contactability ?? record.contactability,
        trust: existing.trust ?? record.trust,
      };
      continue;
    }

    const flags: string[] = [];
    if (possibleIndex >= 0) {
      possible += 1;
      flags.push("POSSIBLE_DUPLICATE");
      const other = buckets[possibleIndex];
      if (other && !other.flags.includes("POSSIBLE_DUPLICATE")) {
        buckets[possibleIndex] = { ...other, flags: [...other.flags, "POSSIBLE_DUPLICATE"] };
      }
    }
    buckets.push({ ...record, flags });
  }

  return { records: buckets, merged, possible };
}
