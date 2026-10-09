import type { Contactability, ContactChannel, ContactChannelStatus } from "../types.js";

export const CHANNEL_KEYS = ["email", "phone", "linkedin", "github", "website", "contactPage"] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

const FIELD_FOR: Record<ChannelKey, string> = {
  email: "email",
  phone: "phone",
  linkedin: "linkedin",
  github: "github",
  website: "website",
  contactPage: "contact_page",
};

export function fieldForChannel(channel: ChannelKey): string {
  return FIELD_FOR[channel];
}

export function emptyChannel(): ContactChannel {
  return {
    value: null,
    status: "NOT_FOUND",
    confidence: 0,
    provider: null,
    sourceUrl: null,
    fetchedAt: null,
    verificationStatus: null,
    matchingEvidence: null,
  };
}

export function emptyContactability(now: string): Contactability {
  return {
    score: 0,
    status: "NONE",
    channels: {
      email: { ...emptyChannel(), fetchedAt: now },
      phone: { ...emptyChannel(), fetchedAt: now },
      linkedin: { ...emptyChannel(), fetchedAt: now },
      github: { ...emptyChannel(), fetchedAt: now },
      website: { ...emptyChannel(), fetchedAt: now },
      contactPage: { ...emptyChannel(), fetchedAt: now },
    },
  };
}

export function channel(input: Partial<ContactChannel> & { status: ContactChannelStatus; fetchedAt: string }): ContactChannel {
  return { ...emptyChannel(), ...input };
}

/** Reachability is separate from whether the row itself is true. */
export function scoreContactability(book: Contactability): Contactability {
  const usable = CHANNEL_KEYS.filter((key) => {
    const status = book.channels[key].status;
    return status === "VERIFIED" || status === "IDENTITY_MATCHED" || status === "PROVIDER_MATCHED";
  });
  const score = Math.round((usable.length / CHANNEL_KEYS.length) * 100) / 100;
  const status = usable.length === 0 ? "NONE" : usable.length >= 2 || book.channels.email.status === "VERIFIED" ? "READY" : "PARTIAL";
  return { ...book, score, status };
}

/** A path may fill a blank field. It may not replace a value the research page already grounded. */
export function applyChannelToFields(fields: Record<string, string>, key: ChannelKey, item: ContactChannel): Record<string, string> {
  if (!item.value) return fields;
  if (item.status !== "VERIFIED" && item.status !== "IDENTITY_MATCHED" && item.status !== "PROVIDER_MATCHED") return fields;
  const field = FIELD_FOR[key];
  if (fields[field]) return fields;
  return { ...fields, [field]: item.value };
}
