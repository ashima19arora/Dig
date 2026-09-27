import { fieldLabel } from "@dig/schemas";
import type { DiffEntry, DiffResult } from "./types.js";

const IGNORE = new Set(["evidence"]);

export function diffDatasets(input: {
  previous: Array<{ canonicalEntityId: string; fields: Record<string, string> }> | null;
  current: Array<{ canonicalEntityId: string; fields: Record<string, string> }>;
  compareFields: string[];
}): DiffResult {
  if (!input.previous) {
    return {
      firstVersion: true,
      added: [],
      removed: [],
      changed: [],
      unchanged: [],
      conflictIds: [],
    };
  }

  const fields = input.compareFields.filter((field) => !IGNORE.has(field));
  const previous = new Map(input.previous.map((record) => [record.canonicalEntityId, record]));
  const current = new Map(input.current.map((record) => [record.canonicalEntityId, record]));
  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const unchanged: DiffEntry[] = [];

  for (const [id, record] of current) {
    const prior = previous.get(id);
    if (!prior) {
      added.push(entry(id, record.fields, `${labelOf(record.fields)} joined this snapshot`, []));
      continue;
    }
    const fieldDiffs = fields
      .filter((field) => (prior.fields[field] ?? "") !== (record.fields[field] ?? ""))
      .map((field) => ({
        field,
        from: prior.fields[field] ?? "",
        to: record.fields[field] ?? "",
      }));
    if (fieldDiffs.length === 0) {
      unchanged.push(entry(id, record.fields, "No field changes", []));
    } else {
      changed.push(entry(id, record.fields, fieldDiffs.map((diff) => fieldLabel(diff.field)).join(", "), fieldDiffs));
    }
  }

  for (const [id, record] of previous) {
    if (!current.has(id)) {
      removed.push(entry(id, record.fields, "Not in the latest collection", []));
    }
  }

  return { firstVersion: false, added, removed, changed, unchanged, conflictIds: [] };
}

function entry(
  canonicalEntityId: string,
  fields: Record<string, string>,
  detail: string,
  fieldDiffs: DiffEntry["fields"],
): DiffEntry {
  return {
    canonicalEntityId,
    label: labelOf(fields),
    detail,
    fields: fieldDiffs,
    conflictIds: [],
  };
}

function labelOf(fields: Record<string, string>): string {
  return (
    fields.company_name ||
    fields.event_name ||
    fields.program_name ||
    fields.product_name ||
    fields.segment ||
    "Record"
  );
}
