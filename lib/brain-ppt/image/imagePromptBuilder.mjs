const SLIDE_TYPE_BY_PAGE = {
  1: "cover",
  2: "route_overview",
  3: "morning",
  4: "lunch",
  5: "afternoon",
  6: "evening",
  7: "notes",
  8: "closing"
};

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pageNumber(page, index) {
  return Number(page.page || page.page_number || index + 1);
}

function visualNeedFor(page, index) {
  const num = pageNumber(page, index);
  const title = cleanText(page.title);
  const direction = cleanText(page.visual_direction || page.visual_intent);
  if (num === 1) return "bright travel cover mood image for Ganzhou old town, riverside city feeling, light itinerary atmosphere";
  if (num === 2) return "abstract travel route timeline background, simplified path, not a real map";
  if (num === 3) return "old city street atmosphere illustration, cultural walk feeling, not a real scenic photo";
  if (num === 4) return "local food mood image, warm casual lunch atmosphere, not a real restaurant";
  if (num === 5) return "city stroll and riverside afternoon atmosphere, relaxed walking visual, not a verified location";
  if (num === 6) return "night riverside atmosphere image, soft city lights, not a real night scene photo";
  if (num === 7) return "lightweight checklist icons and simple travel note illustration, no large factual photo";
  if (num === 8) return "relaxed city closing image, light travel mood, non factual visual";
  return `${title} ${direction}`.trim() || "PPT concept atmosphere image";
}

function shouldGenerate(page, index) {
  const num = pageNumber(page, index);
  return num !== 7;
}

function promptFor(page, index, stylePack = {}) {
  const visualNeed = visualNeedFor(page, index);
  const style = cleanText(stylePack.image_style || stylePack.visual_style || "fresh bright travel editorial, clean PPT background, airy composition, soft natural light");
  return [
    visualNeed,
    style,
    "16:9 friendly composition, leave calm negative space for text, no text, no watermark, no logo",
    "must look like an AI-generated atmosphere or concept visual, not documentary evidence"
  ].join(". ");
}

export function buildImagePlan({ deckId, runId, pagePlan, visualAssetPlan, stylePack = {}, source = "inferred_by_sandun" }) {
  const visualSlides = Array.isArray(visualAssetPlan?.slides) ? visualAssetPlan.slides : [];
  const slides = (Array.isArray(pagePlan?.pages) ? pagePlan.pages : []).map((page, index) => {
    const num = pageNumber(page, index);
    const provided = visualSlides.find(item => Number(item.slide_id || item.page || item.page_number) === num) || {};
    const should = typeof provided.should_generate === "boolean" ? provided.should_generate : shouldGenerate(page, index);
    return {
      slide_id: String(page.slide_id || `slide_${String(num).padStart(2, "0")}`),
      page_number: num,
      slide_type: cleanText(provided.slide_type || page.page_type || SLIDE_TYPE_BY_PAGE[num] || "content"),
      visual_need: cleanText(provided.visual_need || visualNeedFor(page, index)),
      image_prompt: cleanText(provided.image_prompt || promptFor(page, index, stylePack)),
      image_style: cleanText(provided.image_style || stylePack.image_style || "fresh bright travel mood"),
      allowed_asset_type: "ai_generated_image",
      factual_boundary: "AI atmosphere/concept visual only; not factual evidence and not a real location photo.",
      should_generate: should,
      reason: should ? "visual slot benefits from non-factual atmosphere or concept support" : "text/checklist page should use lightweight icons or placeholders"
    };
  });
  return {
    schema_version: "SANDUN_IMAGE_PLAN_V1",
    deck_id: deckId || runId || `deck_${Date.now()}`,
    run_id: runId || deckId || "",
    generated_at: new Date().toISOString(),
    visual_asset_plan_source: source,
    image_policy: {
      allowed_usage: [
        "atmosphere image",
        "concept image",
        "abstract PPT background",
        "travel mood cover",
        "non-factual illustration",
        "draft visual placeholder"
      ],
      forbidden_usage: [
        "real scenic photo",
        "real project screenshot",
        "real field photo",
        "official map",
        "verified evidence",
        "real data chart"
      ],
      required_metadata: {
        asset_type: "ai_generated_image",
        is_factual_evidence: false,
        source_status: "ai_generated_unverified_visual",
        usage_boundary: "atmosphere_or_concept_only"
      }
    },
    slides
  };
}

export function imagePlanMarkdown(plan) {
  return [
    "# Sandun Image Plan",
    "",
    `- deck_id: ${plan.deck_id}`,
    `- run_id: ${plan.run_id}`,
    `- visual_asset_plan_source: ${plan.visual_asset_plan_source}`,
    "",
    "## Policy",
    "",
    "- AI images are atmosphere/concept visuals only.",
    "- They are not real scenic photos, official maps, project evidence, or verified materials.",
    "",
    "## Slides",
    "",
    ...plan.slides.flatMap(slide => [
      `### ${slide.page_number}. ${slide.slide_type}`,
      "",
      `- should_generate: ${slide.should_generate}`,
      `- visual_need: ${slide.visual_need}`,
      `- factual_boundary: ${slide.factual_boundary}`,
      `- prompt: ${slide.image_prompt}`,
      ""
    ])
  ].join("\n");
}

