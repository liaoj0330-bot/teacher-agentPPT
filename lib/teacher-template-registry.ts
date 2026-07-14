import type { TeacherTheme, TeacherVisualMode } from "@/lib/canvas-data";

export const A1_TEMPLATE_ID = "teacher_math_science_v1_5.concept_building" as const;

export type TeacherLessonType = "concept_building" | "general" | string;

export type TemplateDefinition = {
  templateId: string;
  scenario: "teacher_courseware";
  lessonType: "concept_building";
  stages: string[];
  subjects: string[];
  visualMode: TeacherVisualMode;
  theme: TeacherTheme;
  pageRoles: string[];
  visualForms: string[];
  layoutFamilies: string[];
  masters: string[];
  image2: { optional: true; fallback: "omit" };
  advisoryScoreProfile: { status: "UNTRUSTED_PENDING_V2"; p0: 0; p1: 0; p2: 0 };
};

export const A1_CONCEPT_BUILDING_TEMPLATE: TemplateDefinition = {
  templateId: A1_TEMPLATE_ID,
  scenario: "teacher_courseware",
  lessonType: "concept_building",
  stages: ["高中", "初中", "小学"],
  subjects: ["数学", "物理", "化学", "生物", "科学", "理科"],
  visualMode: "teaching_grid",
  theme: "rational_teal",
  pageRoles: ["cover", "learning_path", "learning_objectives", "concept_definition", "formula_visual", "parameter_comparison", "worked_example", "practice_feedback", "summary", "course_basis"],
  visualForms: ["teaching_grid", "formula_visual", "parameter_comparison", "worked_example", "practice_feedback"],
  layoutFamilies: ["cover", "agenda", "section", "split", "matrix", "comparison", "process", "checklist", "closing", "source"],
  masters: ["cover", "agenda", "section", "split", "matrix", "comparison"],
  image2: { optional: true, fallback: "omit" },
  advisoryScoreProfile: { status: "UNTRUSTED_PENDING_V2", p0: 0, p1: 0, p2: 0 }
};

export type TeacherTemplateSelectionInput = {
  scenario?: string;
  lessonType?: string;
  subject?: string;
  schoolStage?: string;
  planningMode?: string;
};

export function selectTeacherTemplate(input: TeacherTemplateSelectionInput): TemplateDefinition | undefined {
  const subject = String(input.subject || "");
  const subjectMatch = A1_CONCEPT_BUILDING_TEMPLATE.subjects.some((value) => subject.includes(value));
  const stageMatch = A1_CONCEPT_BUILDING_TEMPLATE.stages.some((value) => String(input.schoolStage || "").includes(value));
  if (input.scenario === A1_CONCEPT_BUILDING_TEMPLATE.scenario && input.lessonType === A1_CONCEPT_BUILDING_TEMPLATE.lessonType && subjectMatch && stageMatch && input.planningMode === "professional") {
    return A1_CONCEPT_BUILDING_TEMPLATE;
  }
  return undefined;
}
