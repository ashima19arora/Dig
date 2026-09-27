export interface ProvenanceSource {
  url: string;
  title: string;
  domain: string;
  publishedAt: string;
  sourceType: string;
  authority: "official" | "secondary" | "press";
  excerpt: string;
  fieldNames: string[];
  extractionMethod: string;
  demo: boolean;
}

export interface CollectedRecord {
  canonicalEntityId: string;
  fields: Record<string, string>;
  sources: ProvenanceSource[];
  ambiguousFields?: string[];
}

export interface EvidenceItem {
  id: string;
  fieldName: string;
  value: string;
  sourceUrl: string;
  sourceTitle: string;
  excerpt: string;
  collectedAt: string;
  publishedAt: string;
  authority: ProvenanceSource["authority"];
  confidence: number;
}

export interface AlternateValue {
  field: string;
  value: string;
}

export type RecordStatus = "verified" | "needs_review" | "possible_duplicate" | "incomplete";

export interface DiffField {
  field: string;
  from: string;
  to: string;
}

export interface DiffEntry {
  canonicalEntityId: string;
  label: string;
  detail: string;
  fields: DiffField[];
  conflictIds: string[];
}

export interface DiffResult {
  firstVersion: boolean;
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
  unchanged: DiffEntry[];
  conflictIds: string[];
}

export interface ConflictDraft {
  id: string;
  canonicalEntityId: string;
  field: string;
  oldValue: string;
  newValue: string;
  oldEvidence: EvidenceItem | null;
  newEvidence: EvidenceItem | null;
  detectedAt: string;
  status: "PENDING" | "AUTO_RESOLVED";
  decision: "NEW" | "OLD" | "BOTH" | null;
  confidence: number;
  reason: string;
  ambiguous: boolean;
}

export interface PublishedRecord {
  id: string;
  canonicalEntityId: string;
  fields: Record<string, string>;
  rank: number;
  activityScore: number;
  activityComponents: {
    recency: number;
    sourceCount: number;
    officialSource: number;
    freshness: number;
  };
  confidence: number;
  confidenceComponents: {
    sourceAuthority: number;
    corroboration: number;
    freshness: number;
    extractionQuality: number;
  };
  status: RecordStatus;
  validation: {
    valid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  };
  sourceCount: number;
  contentHash: string;
  flags: string[];
  alternates: AlternateValue[];
  sources: ProvenanceSource[];
  evidence: EvidenceItem[];
  annotation: {
    remark: string;
    reasoning: string;
    confidence: number;
  };
}

export interface ReportFinding {
  text: string;
  evidenceIds: string[];
}

export interface IntelligenceReport {
  title: string;
  generatedAt: string;
  demo: boolean;
  summary: string;
  findings: ReportFinding[];
  annotations: Array<{ recordId: string; remark: string; reasoning: string; confidence: number }>;
  topRecords: Array<{ canonicalEntityId: string; label: string; rank: number; reason: string }>;
  changes: {
    firstVersion: boolean;
    added: number;
    removed: number;
    changed: number;
    unchanged: number;
    conflicts: number;
  };
  methodology: string[];
  limitations: string[];
  sources: Array<{ title: string; url: string; collectedAt: string; purpose: string; demo: boolean }>;
}

export interface PipelineStats {
  records: number;
  sources: number;
  documents: number;
  valid: number;
  duplicates: number;
  possibleDuplicates: number;
  conflicts: number;
  pendingConflicts: number;
  autoResolved: number;
  warnings: number;
  qualityScore: number;
  avgConfidence: number;
  avgFreshness: number;
  llmCalls: number;
  llmCacheHit: boolean;
  annotationModel: string;
}

export interface PipelineResult {
  records: PublishedRecord[];
  conflicts: ConflictDraft[];
  diff: DiffResult;
  report: IntelligenceReport;
  stats: PipelineStats;
  annotationHash: string;
  model: string;
}
