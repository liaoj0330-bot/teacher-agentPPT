import { cleanText } from "@/lib/text-sanitize";
import type { EvidenceBlock, EvidenceBlockType, EvidenceReliability, SourceDocument } from "@/lib/ppt-agent/evidence-types";
import { clampEvidenceScore } from "@/lib/ppt-agent/evidence-types";

const STOP_WORDS = new Set(["以及", "通过", "进行", "需要", "支持", "实现", "一个", "这个", "我们", "用户", "页面", "内容", "方案"]);

function uniq<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function compact(value: string, max = 96) {
  const chars = [...cleanText(value)];
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}...` : chars.join("");
}

function splitBlocks(text: string) {
  return cleanText(text)
    .split(/\n{2,}|(?<=。)\s+|(?<=；)\s+|(?<=;)\s+|(?:^|\n)\s*[-*•]\s*/g)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 8)
    .slice(0, 80);
}

function keywordsOf(text: string) {
  const clean = cleanText(text);
  const english = clean.match(/[a-zA-Z][a-zA-Z0-9_-]{2,}/g) || [];
  const chinese = clean.match(/[\u4e00-\u9fa5]{2,8}/g) || [];
  const numbers = clean.match(/\d+(?:\.\d+)?%?|\d{4}年|\d+页|\d+天|\d+日/g) || [];
  return uniq([...english, ...chinese, ...numbers])
    .filter((item) => !STOP_WORDS.has(item) && item.length <= 14)
    .slice(0, 12);
}

function entitiesOf(text: string) {
  const clean = cleanText(text);
  const entities = [
    ...(clean.match(/[A-Z][A-Za-z0-9]{2,}/g) || []),
    ...(clean.match(/[\u4e00-\u9fa5]{2,12}(?:大学|学院|公司|集团|平台|系统|项目|政策|方案|景区|博物馆|机场|车站)/g) || []),
    ...(clean.match(/\d{4}年(?:Q[1-4]|第[一二三四]季度)?|\d+(?:\.\d+)?%|\d+(?:万|亿|千)?元/g) || [])
  ];
  return uniq(entities).slice(0, 10);
}

function classifyBlock(text: string, source: SourceDocument): EvidenceBlockType {
  const clean = cleanText(text);
  if (source.sourceType === "user_input") return "user_requirement";
  if (/政策|法规|规定|通知|意见|标准|指南|主管部门|教育部|财政部|发改委|条例|办法/.test(clean)) return "policy";
  if (/\d+(?:\.\d+)?%|同比|环比|营收|利润|收入|成本|预算|金额|指标|KPI|ROI|增长|下降/.test(clean)) return /指标|KPI|同比|环比|营收|利润/.test(clean) ? "metric" : "data";
  if (/功能|模块|能力|支持|集成|API|部署|权限|数据|架构|工作流|产品/.test(clean)) return "feature";
  if (/阶段|时间|计划|路线|日程|上午|下午|晚上|第[一二三四五六七八九十]天|\d{1,2}:\d{2}|\d+月|\d+日/.test(clean)) return "timeline";
  if (/风险|失败|注意|预警|不足|限制|依赖|待确认|不可|避免|兜底|备选/.test(clean)) return "risk";
  if (/“[^”]{6,}”|"[^"]{6,}"/.test(clean)) return "quote";
  if (/案例|客户|场景|实践|使用|参观|体验/.test(clean)) return "fact";
  return "general_context";
}

function reliabilityFor(source: SourceDocument): EvidenceReliability {
  if (source.sourceType === "search_result" && source.url && source.confidence >= 70) return "traceable";
  if (source.sourceType === "uploaded_file" && source.parseStatus === "parsed") return "verified";
  if (source.sourceType === "pasted_text") return "user_claim";
  if (source.sourceType === "user_input") return "user_claim";
  if (source.sourceType === "test_fixture") return "fallback";
  if (source.sourceType === "system_fallback") return "fallback";
  return source.confidence >= 70 ? "traceable" : "low";
}

function confidenceFor(source: SourceDocument, blockType: EvidenceBlockType) {
  const typeBoost = blockType === "policy" || blockType === "metric" || blockType === "data" ? 4 : 0;
  const sourcePenalty = source.sourceType === "user_input" ? 14 : source.sourceType === "system_fallback" ? 22 : 0;
  const statusPenalty = source.parseStatus === "partial" ? 8 : source.parseStatus === "failed" || source.parseStatus === "unsupported" ? 24 : 0;
  return clampEvidenceScore(source.confidence + typeBoost - sourcePenalty - statusPenalty);
}

function usableFor(blockType: EvidenceBlockType, text: string) {
  const base = [blockType];
  const clean = cleanText(text);
  if (/验收|指标|成效|KPI/.test(clean)) base.push("metric");
  if (/下一步|计划|阶段|路线/.test(clean)) base.push("timeline");
  if (/风险|备选|注意/.test(clean)) base.push("risk");
  if (/政策|依据|标准/.test(clean)) base.push("policy");
  if (/功能|模块|能力|架构|部署/.test(clean)) base.push("feature");
  return uniq(base);
}

export function extractEvidenceBlocks(sourceDocuments: SourceDocument[]): EvidenceBlock[] {
  const blocks: EvidenceBlock[] = [];
  sourceDocuments.forEach((source, sourceIndex) => {
    const sourceBlocks = splitBlocks(source.normalizedText || source.rawText);
    const fallbackBlocks = sourceBlocks.length ? sourceBlocks : source.sourceType === "user_input" && source.title ? [source.title] : [];
    fallbackBlocks.forEach((text, blockIndex) => {
      const blockType = classifyBlock(text, source);
      const confidence = confidenceFor(source, blockType);
      blocks.push({
        evidenceBlockId: `evidence-${sourceIndex + 1}-${blockIndex + 1}`,
        sourceId: source.sourceId,
        blockType,
        text: cleanText(text),
        summary: compact(text),
        keywords: keywordsOf(text),
        entities: entitiesOf(text),
        pageNumber: Number(text.match(/Page\s+(\d+)/i)?.[1]) || undefined,
        slideNumber: undefined,
        confidence,
        reliability: reliabilityFor(source),
        usableFor: usableFor(blockType, text),
        warnings: [
          source.sourceType === "user_input" ? "来自用户需求，只能作为需求证据。" : "",
          source.sourceType === "test_fixture" ? "来自本地测试夹具，不能当作真实公开来源。" : "",
          source.sourceType === "system_fallback" ? "来自兜底来源，不能当作已验证事实。" : "",
          confidence < 55 ? "证据置信度偏低，需要用户补充或确认。" : ""
        ].filter(Boolean)
      });
    });
  });
  return blocks.slice(0, 260);
}
