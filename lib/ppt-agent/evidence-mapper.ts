import type { ContentPlan } from "@/lib/ppt-agent/content-plan";
import type { SlidePagePlan } from "@/lib/ppt-agent/slide-page-plan";
import type { EvidenceBlock, EvidenceNeed, SlideEvidenceMap, SourceDocument } from "@/lib/ppt-agent/evidence-types";
import { clampEvidenceScore } from "@/lib/ppt-agent/evidence-types";
import { cleanText } from "@/lib/text-sanitize";

type MapInput = {
  contentPlan: ContentPlan;
  slidePagePlans: SlidePagePlan[];
  evidenceNeeds: EvidenceNeed[];
  evidenceBlocks: EvidenceBlock[];
  sourceDocuments: SourceDocument[];
};

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function tokens(text: string) {
  const clean = cleanText(text).toLowerCase();
  return uniq([
    ...(clean.match(/[a-z0-9][a-z0-9_-]{2,}/g) || []),
    ...(clean.match(/[\u4e00-\u9fa5]{2,8}/g) || []),
    ...(clean.match(/\d+(?:\.\d+)?%?|\d{4}年|\d+页|\d+天/g) || [])
  ]).filter((token) => token.length > 1);
}

function overlapScore(left: string, right: string) {
  const a = tokens(left);
  const b = new Set(tokens(right));
  if (!a.length || !b.size) return 0;
  return a.filter((token) => b.has(token)).length / Math.max(1, Math.min(a.length, b.size));
}

function sourceById(sourceDocuments: SourceDocument[]) {
  return new Map(sourceDocuments.map((source) => [source.sourceId, source]));
}

function isExternal(source: SourceDocument | undefined) {
  return Boolean(source && source.sourceType !== "user_input" && source.sourceType !== "system_fallback" && source.sourceType !== "test_fixture");
}

function scoreBlock(block: EvidenceBlock, need: EvidenceNeed, plan: SlidePagePlan, source: SourceDocument | undefined) {
  const needText = `${need.evidenceNeedText} ${need.mustProve} ${plan.coreClaim} ${plan.role}`;
  const blockText = `${block.summary} ${block.text} ${block.keywords.join(" ")} ${block.entities.join(" ")}`;
  const keyword = overlapScore(needText, blockText) * 60;
  const type = need.expectedEvidenceTypes.includes(block.blockType) || need.expectedEvidenceTypes.some((item) => block.usableFor.includes(item)) ? 24 : 0;
  const reliability = block.reliability === "verified" ? 16 : block.reliability === "traceable" ? 12 : block.reliability === "user_claim" ? 3 : block.reliability === "fallback" ? -10 : -4;
  const externalBoost = isExternal(source) ? 8 : 0;
  return keyword + type + reliability + externalBoost + block.confidence / 10;
}

function matchedForSlide(needs: EvidenceNeed[], plan: SlidePagePlan, blocks: EvidenceBlock[], sources: Map<string, SourceDocument>) {
  const scored = blocks.flatMap((block) =>
    needs.map((need) => ({ block, need, score: scoreBlock(block, need, plan, sources.get(block.sourceId)) }))
  );
  const minScore = needs.some((need) => need.required) ? 20 : 16;
  const selected = scored
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .filter((item, index, list) => list.findIndex((other) => other.block.evidenceBlockId === item.block.evidenceBlockId) === index)
    .slice(0, 6)
    .map((item) => item.block);
  return selected;
}

function confidenceForBlocks(blocks: EvidenceBlock[], sources: Map<string, SourceDocument>) {
  if (!blocks.length) return 0;
  const total = blocks.reduce((sum, block) => {
    const source = sources.get(block.sourceId);
    const sourcePenalty = source?.sourceType === "user_input" ? 16 : source?.sourceType === "system_fallback" ? 28 : 0;
    return sum + Math.max(0, block.confidence - sourcePenalty);
  }, 0);
  return clampEvidenceScore(total / blocks.length);
}

function coverageFor(needs: EvidenceNeed[], blocks: EvidenceBlock[]) {
  if (!needs.length) return 0;
  const covered = needs.filter((need) =>
    blocks.some((block) =>
      need.expectedEvidenceTypes.includes(block.blockType) ||
      need.expectedEvidenceTypes.some((type) => block.usableFor.includes(type)) ||
      overlapScore(need.evidenceNeedText, `${block.summary} ${block.keywords.join(" ")}`) >= 0.12
    )
  ).length;
  return clampEvidenceScore((covered / needs.length) * 100);
}

export function mapSlideEvidence(input: MapInput): SlideEvidenceMap[] {
  const sources = sourceById(input.sourceDocuments);
  return input.slidePagePlans.map((plan, index) => {
    const pageNeeds = input.evidenceNeeds.filter((need) => need.pagePlanId === plan.pagePlanId);
    const matched = matchedForSlide(pageNeeds, plan, input.evidenceBlocks, sources);
    const evidenceCoverage = coverageFor(pageNeeds, matched);
    const sourceConfidence = confidenceForBlocks(matched, sources);
    const externalBlocks = matched.filter((block) => isExternal(sources.get(block.sourceId)));
    const unsupportedClaims = pageNeeds
      .filter((need) => need.required)
      .filter((need) => !matched.some((block) => overlapScore(need.evidenceNeedText, `${block.summary} ${block.keywords.join(" ")}`) >= 0.12 || need.expectedEvidenceTypes.includes(block.blockType)))
      .map((need) => need.evidenceNeedText)
      .slice(0, 5);
    const onlyUserOrFallback = matched.length > 0 && externalBlocks.length === 0;
    const lowConfidenceWarnings = [
      evidenceCoverage < 45 ? "本页证据覆盖不足，关键主张需要补充资料。" : "",
      sourceConfidence < 55 ? "本页来源置信度偏低，建议补充可追溯来源。" : "",
      onlyUserOrFallback ? "本页主要依据来自用户输入、测试夹具或兜底来源，不能当作外部事实。" : ""
    ].filter(Boolean);
    return {
      slideId: `slide-audit-${index + 1}`,
      pagePlanId: plan.pagePlanId,
      role: cleanText(plan.role),
      coreClaim: cleanText(plan.coreClaim),
      mustProve: cleanText(plan.mustProve),
      evidenceNeeds: pageNeeds,
      matchedEvidenceBlocks: matched.map((block) => ({
        evidenceBlockId: block.evidenceBlockId,
        sourceId: block.sourceId,
        blockType: block.blockType,
        summary: block.summary,
        confidence: block.confidence,
        reliability: block.reliability
      })),
      evidenceCoverage,
      sourceConfidence,
      unsupportedClaims,
      lowConfidenceWarnings,
      userConfirmationNeeded: uniq([
        ...unsupportedClaims,
        ...matched
          .filter((block) => {
            const source = sources.get(block.sourceId);
            return source?.sourceType === "user_input" || source?.sourceType === "pasted_text" || source?.parseStatus === "partial";
          })
          .map((block) => block.summary)
      ]).slice(0, 5)
    };
  });
}
