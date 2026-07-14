export const IMAGE_USAGE_BOUNDARY = {
  asset_type: "ai_generated_image",
  is_factual_evidence: false,
  source_status: "ai_generated_unverified_visual",
  usage_boundary: "atmosphere_or_concept_only",
  allowed_usage: [
    "atmosphere_image",
    "concept_image",
    "abstract_background",
    "travel_mood_cover",
    "non_factual_illustration",
    "draft_visual_placeholder"
  ],
  forbidden_usage: [
    "real_scenic_photo",
    "real_project_screenshot",
    "real_field_photo",
    "policy_document_screenshot",
    "client_case_evidence",
    "official_map",
    "verified_data_chart",
    "verified_source_material"
  ]
};

export class ImageProvider {
  async probe() {
    throw new Error("probe() must be implemented by provider");
  }

  async generateImage() {
    throw new Error("generateImage() must be implemented by provider");
  }
}

export function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  return `${"*".repeat(Math.max(0, text.length - 4))}${text.slice(-4)}`;
}

export function redactSecret(value, secret) {
  const text = String(value || "");
  const key = String(secret || "");
  return key ? text.replaceAll(key, "[REDACTED_API_KEY]") : text;
}

