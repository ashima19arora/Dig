import type { IntentId } from "@dig/schemas";
import { intentDefinition } from "./intents.js";

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN = /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;

/**
 * Google Scholar says "Verified email at iitmandi.ac.in", and extraction can copy just the domain
 * into the email field. A value without an @ is not an email: drop it, and when the row has no
 * website, keep the domain as one, so a contact lookup can search that domain for the real address.
 */
export function dropMalformedEmail<T extends { fields: Record<string, string> }>(record: T): T {
  const email = record.fields.email?.trim();
  if (!email || EMAIL.test(email)) return record;
  const { email: _dropped, ...fields } = record.fields;
  const domain = email.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  if (DOMAIN.test(domain) && !fields.website?.trim()) fields.website = `https://${domain}`;
  return { ...record, fields };
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateFields(fields: Record<string, string>, intent: IntentId): ValidationResult {
  const definition = intentDefinition(intent);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  for (const field of definition.requiredFields) {
    if (!fields[field]?.trim()) {
      errors.push({ field, message: `${field} is required` });
    }
  }

  if (fields.website && !isValidUrl(fields.website)) {
    errors.push({ field: "website", message: "website must be a valid URL" });
  }
  if (fields.source_url && !isValidUrl(fields.source_url)) {
    errors.push({ field: "source_url", message: "source_url must be a valid URL" });
  }
  if (fields.email && !EMAIL.test(fields.email)) {
    errors.push({ field: "email", message: "email must be a valid email address" });
  }
  if (fields.last_verified && Number.isNaN(Date.parse(fields.last_verified))) {
    errors.push({ field: "last_verified", message: "last_verified must be a valid date" });
  }

  for (const field of definition.optionalFields) {
    if (!fields[field]?.trim() && field !== "email") {
      warnings.push({ field, message: `${field} is empty` });
    }
  }
  if (!fields.email?.trim() && definition.optionalFields.includes("email")) {
    warnings.push({ field: "email", message: "email is empty" });
  }

  return { valid: errors.length === 0, errors, warnings };
}
