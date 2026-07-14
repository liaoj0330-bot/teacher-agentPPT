import type { TeacherCoursewareTask } from "@/lib/teacher-courseware-task";

export type NormalizedTeacherTopic = {
  topic: string;
  sourceTopic: string;
  confidence: "explicit" | "textbook_match" | "fallback";
};

/** Keep filenames, prompts, lesson plans and slide titles on one canonical topic. */
export function normalizeTeacherTopic(task: Pick<TeacherCoursewareTask, "topic" | "pastedMaterials" | "textbook" | "chapter">): NormalizedTeacherTopic {
  const sourceTopic = String(task.topic || "").trim();
  const evidence = `${sourceTopic} ${task.textbook || ""} ${task.chapter || ""} ${task.pastedMaterials || ""}`;
  // An explicit teacher topic wins. Uploaded materials may contain related
  // chapters, but must not silently replace the teacher's requested lesson.
  if (sourceTopic) return { topic: sourceTopic, sourceTopic, confidence: "explicit" };
  const candidates = ["一次函数的图象与性质", "一次函数", "函数的单调性"];
  const matched = candidates.find((candidate) => evidence.includes(candidate));
  if (matched) return { topic: matched, sourceTopic, confidence: "textbook_match" };
  return { topic: sourceTopic || "未命名课题", sourceTopic, confidence: sourceTopic ? "explicit" : "fallback" };
}

export function normalizeTeacherTask(task: TeacherCoursewareTask): TeacherCoursewareTask & { topicSource?: string; topicConfidence?: NormalizedTeacherTopic["confidence"] } {
  const normalized = normalizeTeacherTopic(task);
  return { ...task, topic: normalized.topic, topicSource: normalized.sourceTopic, topicConfidence: normalized.confidence };
}
