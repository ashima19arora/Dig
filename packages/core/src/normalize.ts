const SUFFIX =
  /\s+(private limited|pvt\.?\s*ltd\.?|limited|ltd\.?|incorporated|inc\.?|corporation|corp\.?|l\.?l\.?c\.?|llp)\.?$/i;

export function collapseSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function canonicalCompanyName(input: string): string {
  let current = collapseSpace(input).replace(/,/g, "");
  let previous = "";
  while (current !== previous) {
    previous = current;
    current = current.replace(SUFFIX, "").trim();
  }
  return current;
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    url.hash = "";
    url.hostname = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname.replace(/\/$/, "");
    return `${url.protocol}//${url.hostname}${path}${url.search}`;
  } catch {
    return trimmed;
  }
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function normalizePhone(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  return digits;
}

const COMPANY_FIELDS = new Set(["company_name", "vendor", "organization", "organizer"]);
const URL_FIELDS = new Set(["website", "source_url"]);
const EMAIL_FIELDS = new Set(["email"]);
const DATE_FIELDS = new Set(["last_verified", "start_date", "deadline", "published_at"]);

export function normalizeFields(fields: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, raw] of Object.entries(fields)) {
    const value = raw ?? "";
    if (COMPANY_FIELDS.has(key)) next[key] = canonicalCompanyName(value);
    else if (URL_FIELDS.has(key)) next[key] = normalizeUrl(value);
    else if (EMAIL_FIELDS.has(key)) next[key] = normalizeEmail(value);
    else if (DATE_FIELDS.has(key)) next[key] = normalizeDate(value);
    else if (key === "phone") next[key] = normalizePhone(value);
    else next[key] = collapseSpace(value);
  }
  return next;
}

export function identityKey(fields: Record<string, string>, identityFields: string[]): string {
  return identityFields
    .map((field) => (fields[field] ?? "").toLowerCase())
    .join("|");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + cost);
      previous = current;
    }
  }
  return row[b.length] ?? 0;
}

export function similarity(a: string, b: string): number {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length);
}
