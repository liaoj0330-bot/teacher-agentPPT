import { runImageJob, type ImageJobPage } from "./image-generation-jobs.ts";
import { generateImageForRequest } from "./image-generation-provider.ts";

export function scheduleImageJob(jobId: string, ownerKey: string) {
  void runImageJob(jobId, ownerKey, async (page: ImageJobPage) => generateImageForRequest(
    page.prompt,
    page.size || String(process.env.OPENAI_IMAGE_SIZE || "1024x1024")
  )).catch((error) => console.error("[generate-image] async worker failed", error));
}
