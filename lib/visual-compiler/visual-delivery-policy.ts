export type VisualDeliveryPolicy = {
  allowed: boolean;
  mode: "native_fallback" | "generated_complete" | "generated_partial";
  expectedVisualIds: string[];
  committedVisualIds: string[];
  missingVisualIds: string[];
};

export function evaluateVisualDelivery(
  expectedVisualIds: string[],
  renderManifest: Record<string, string>,
): VisualDeliveryPolicy {
  const expected = [...new Set(expectedVisualIds.filter(Boolean))];
  const committedVisualIds = expected.filter((id) => Boolean(renderManifest[id]));
  const missingVisualIds = expected.filter((id) => !renderManifest[id]);
  if (committedVisualIds.length === 0) {
    return { allowed: true, mode: "native_fallback", expectedVisualIds: expected, committedVisualIds, missingVisualIds };
  }
  if (missingVisualIds.length === 0) {
    return { allowed: true, mode: "generated_complete", expectedVisualIds: expected, committedVisualIds, missingVisualIds };
  }
  return { allowed: false, mode: "generated_partial", expectedVisualIds: expected, committedVisualIds, missingVisualIds };
}
