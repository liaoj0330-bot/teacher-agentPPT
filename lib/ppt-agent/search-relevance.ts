import type { PublicSearchResponse, PublicSearchResult } from "@/lib/ppt-agent/public-search-provider";

const STOP_TERMS = new Set(["资料", "信息", "内容", "介绍", "相关", "小学", "初中", "高中", "数学", "语文", "英语", "教材"]);
const TRUSTED_EDUCATION_HOSTS = [
  "moe.gov.cn",
  "smartedu.cn",
  "pep.com.cn",
  "bnup.com.cn",
  "fltrp.com",
  "jsen.cn",
  "gov.cn",
  "edu.cn",
];

function host(url: string) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function queryTerms(query: string) {
  const raw = query
    .replace(/[“”"'（）()【】\[\],，。；;：:、/\\]+/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  const important = query.match(/(?:\d+以内|加减法|乘除法|课程标准|课标|第[一二三四五六七八九十\d]+(?:单元|章|节|课)|[一二三四五六七八九十]年级|函数|几何|阅读|写作|实验)/g) || [];
  return [...new Set([...raw, ...important])].filter((term) => !STOP_TERMS.has(term)).slice(0, 16);
}

function scoreResult(query: string, result: PublicSearchResult) {
  const title = result.title.toLowerCase();
  const body = `${result.snippet} ${result.content || ""}`.toLowerCase();
  const terms = queryTerms(query).map((term) => term.toLowerCase());
  let score = 0;
  let matches = 0;
  for (const term of terms) {
    if (title.includes(term)) { score += 4; matches += 1; }
    else if (body.includes(term)) { score += 1; matches += 1; }
  }
  const hostname = host(result.url);
  const trusted = TRUSTED_EDUCATION_HOSTS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  const officialRequested = /\bofficial\b|官方|政府|教育部|出版社/i.test(query);
  const authoritative = trusted || result.sourceType === "official";
  if (authoritative && matches > 0) score += officialRequested ? 8 : 3;
  if (result.url && /^https:\/\//.test(result.url)) score += 1;
  return { result, score, matches, trusted, authoritative };
}

export function rankRelevantSearchResults(query: string, results: PublicSearchResult[]) {
  return results
    .map((result) => scoreResult(query, result))
    .filter((item) => item.matches > 0 && item.score >= 3)
    .sort((left, right) => right.score - left.score || Number(right.authoritative) - Number(left.authoritative))
    .map(({ result, score, trusted }) => ({
      ...result,
      confidence: Math.min(result.confidence, trusted ? 88 : 72, 48 + score * 4),
      warnings: [...new Set([...(result.warnings || []), trusted ? "" : "source_domain_not_trusted_for_curriculum"].filter(Boolean))],
    }));
}

export function enforceSearchRelevance(response: PublicSearchResponse): PublicSearchResponse {
  if (response.status !== "ok") return response;
  const results = rankRelevantSearchResults(response.query, response.results);
  if (results.length) return { ...response, results };
  return {
    ...response,
    status: "empty",
    results: [],
    warnings: [...new Set([...response.warnings, "search_results_rejected_as_irrelevant"])],
  };
}
