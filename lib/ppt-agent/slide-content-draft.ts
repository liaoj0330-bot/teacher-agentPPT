import type { SlideSection } from "@/lib/canvas-data";
import type { ContentPlanPPTType } from "@/lib/ppt-agent/content-plan";

export type VisibleContentBlockType =
  | "point"
  | "metric"
  | "step"
  | "comparison"
  | "risk"
  | "recommendation"
  | "action"
  | "example"
  | "evidence";

export type VisibleContentBlock = {
  type: VisibleContentBlockType;
  title: string;
  body: string;
  tag?: string;
  priority: "must" | "should" | "optional";
};

export type EvidenceSnippet = {
  text: string;
  sourceId?: string;
  evidenceBlockId?: string;
  reliability: "verified" | "traceable" | "user_claim" | "fallback" | "low";
  confidence: number;
  visible: boolean;
};

export type SlideContentQualityChecks = {
  titleLengthOk: boolean;
  titleIsConclusion: boolean;
  visibleBlocksPresent: boolean;
  scaffoldFree: boolean;
  evidenceRealized: boolean;
  noInternalFields: boolean;
  lowConfidenceMarked: boolean;
};

export type SlideContentDraft = {
  contentDraftId: string;
  planId: string;
  pagePlanId: string;
  layoutPlanId: string;
  slideIndex: number;
  pptType: ContentPlanPPTType;
  role: string;
  finalTitle: string;
  subtitle: string;
  leadSentence: string;
  visibleBlocks: VisibleContentBlock[];
  evidenceSnippets: EvidenceSnippet[];
  actionText: string;
  speakerNotes: string;
  sourceUseSummary: string;
  confidenceNote: string;
  contentQualityChecks: SlideContentQualityChecks;
  blockedScaffoldTerms: string[];
  warnings: string[];
  sections?: SlideSection[];
};

export type DeckContentQualityReport = {
  valid: boolean;
  averageScore: number;
  draftCount: number;
  scaffoldMatches: string[];
  titleIssueCount: number;
  evidenceRealizedSlides: number;
  autoFixedSlides: number;
  blockingSlides: Array<{ slideIndex: number; role: string; issues: string[] }>;
  warnings: string[];
  checkedAt: string;
};
