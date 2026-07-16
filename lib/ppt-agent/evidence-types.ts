import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";

export type SourceDocumentType =
  | "uploaded_file"
  | "pasted_text"
  | "search_result"
  | "test_fixture"
  | "system_fallback"
  | "user_input";

export type SourceFileType = "txt" | "pdf" | "docx" | "pptx" | "md" | "html" | "unknown";

export type SourceParseStatus = "parsed" | "partial" | "failed" | "unsupported";

export type SourceProviderTier = "official_provider" | "experimental_fallback" | "local_or_user";

export type EvidenceBlockType =
  | "fact"
  | "data"
  | "quote"
  | "policy"
  | "feature"
  | "metric"
  | "timeline"
  | "risk"
  | "user_requirement"
  | "general_context";

export type EvidenceReliability = "verified" | "traceable" | "user_claim" | "fallback" | "low";

export type EvidencePriority = "high" | "medium" | "low";

export type SourceDocument = {
  sourceId: string;
  assetId?: string;
  sha256?: string;
  storageStatus?: "persisted" | "temporary";
  sourceType: SourceDocumentType;
  fileType: SourceFileType;
  title: string;
  fileName?: string;
  url?: string;
  provider?: string;
  providerTier?: SourceProviderTier;
  rawText: string;
  normalizedText: string;
  extractedAt: string;
  /** Versioned workbench provenance for materials added after generation. */
  origin?: string;
  addedAt?: string;
  confidence: number;
  parseStatus: SourceParseStatus;
  warnings: string[];
  chunks?: Array<{ id: string; text: string; page?: number; slide?: number; heading?: string }>;
};

export type EvidenceBlock = {
  evidenceBlockId: string;
  sourceId: string;
  blockType: EvidenceBlockType;
  text: string;
  summary: string;
  keywords: string[];
  entities: string[];
  pageNumber?: number;
  slideNumber?: number;
  confidence: number;
  reliability: EvidenceReliability;
  usableFor: string[];
  warnings: string[];
};

export type EvidenceNeed = {
  needId: string;
  pagePlanId: string;
  role: string;
  mustProve: string;
  evidenceNeedText: string;
  expectedEvidenceTypes: EvidenceBlockType[];
  priority: EvidencePriority;
  required: boolean;
};

export type MatchedEvidenceBlock = {
  evidenceBlockId: string;
  sourceId: string;
  blockType: EvidenceBlockType;
  summary: string;
  confidence: number;
  reliability: EvidenceReliability;
};

export type SlideEvidenceMap = {
  slideId: string;
  pagePlanId: string;
  role: string;
  coreClaim: string;
  mustProve: string;
  evidenceNeeds: EvidenceNeed[];
  matchedEvidenceBlocks: MatchedEvidenceBlock[];
  evidenceCoverage: number;
  sourceConfidence: number;
  unsupportedClaims: string[];
  lowConfidenceWarnings: string[];
  userConfirmationNeeded: string[];
};

export type DeckEvidenceReport = {
  totalSlides: number;
  slidesWithEvidence: number;
  averageCoverage: number;
  lowConfidenceSlides: Array<{
    slideId: string;
    pagePlanId: string;
    role: string;
    evidenceCoverage: number;
    sourceConfidence: number;
  }>;
  unsupportedClaims: Array<{
    slideId: string;
    pagePlanId: string;
    role: string;
    claims: string[];
  }>;
  sourceSummary: {
    totalSources: number;
    totalEvidenceBlocks: number;
    bySourceType: Record<SourceDocumentType, number>;
    byBlockType: Record<EvidenceBlockType, number>;
    verifiedOrTraceableSources: number;
    userInputOnlySlides: number;
  };
  blockingIssues: string[];
  warnings: string[];
  suggestedFixes: string[];
};

export const evidenceCriticalPptTypes: ContentPlanPPTType[] = [
  "project_report",
  "financial_report",
  "policy_interpretation",
  "proposal",
  "business_plan"
];

export function clampEvidenceScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
