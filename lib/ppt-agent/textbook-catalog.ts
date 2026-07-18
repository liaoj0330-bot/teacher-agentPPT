export type TextbookCatalogInput = {
  displayName?: unknown;
  schoolStage?: unknown;
  grade?: unknown;
  subject?: unknown;
  publisher?: unknown;
  editionYear?: unknown;
  volume?: unknown;
};

export type TextbookCatalogResolution = {
  status: "exact" | "ambiguous" | "unmatched";
  confidence: number;
  catalogId?: string;
  candidateIds: string[];
  normalized: {
    displayName: string;
    schoolStage?: string;
    grade?: string;
    subject?: string;
    publisher?: string;
    editionYear?: string;
    volume?: string;
  };
  matchedFields: string[];
  missingFields: string[];
  conflicts: string[];
  requiresTeacherConfirmation: boolean;
  messageCode:
    | "textbook_identity_recognized"
    | "textbook_identity_incomplete"
    | "textbook_identity_ambiguous"
    | "textbook_identity_unrecognized";
};

type CatalogFamily = {
  id: string;
  edition: string;
  publisher: string;
  aliases: string[];
  subjects: string[];
  stages: string[];
};

export type TextbookCatalogEntry = {
  id: string;
  familyId: string;
  edition: string;
  publisher: string;
  schoolStage: "小学" | "初中" | "高中";
  grade?: string;
  subject: string;
  volume: string;
  coverage: "identity_only";
};

const CORE_SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "地理"];

const CATALOG_FAMILIES: CatalogFamily[] = [
  {
    id: "pep",
    edition: "人教版",
    publisher: "人民教育出版社",
    aliases: ["人教版", "人教", "人民教育出版社", "pep"],
    subjects: CORE_SUBJECTS,
    stages: ["小学", "初中", "高中"],
  },
  {
    id: "unified-pep",
    edition: "统编版",
    publisher: "人民教育出版社",
    aliases: ["统编版", "统编", "部编版", "部编"],
    subjects: ["语文", "历史", "道德与法治"],
    stages: ["小学", "初中"],
  },
  {
    id: "bnu",
    edition: "北师大版",
    publisher: "北京师范大学出版社",
    aliases: ["北师大版", "北师版", "北师大", "北京师范大学出版社"],
    subjects: ["数学", "英语", "物理", "生物", "历史"],
    stages: ["小学", "初中", "高中"],
  },
  {
    id: "sujiao",
    edition: "苏教版",
    publisher: "江苏凤凰教育出版社",
    aliases: ["苏教版", "苏教本", "苏教", "江苏凤凰教育出版社"],
    subjects: ["语文", "数学", "科学", "生物"],
    stages: ["小学", "初中", "高中"],
  },
  {
    id: "fltrp",
    edition: "外研版",
    publisher: "外语教学与研究出版社",
    aliases: ["外研版", "外研社版", "外研社", "外研", "外语教学与研究出版社"],
    subjects: ["英语"],
    stages: ["小学", "初中", "高中"],
  },
  {
    id: "shandong",
    edition: "鲁教版",
    publisher: "山东教育出版社",
    aliases: ["鲁教版", "鲁教", "山东教育出版社"],
    subjects: ["数学", "英语", "化学", "地理"],
    stages: ["小学", "初中", "高中"],
  },
  {
    id: "yilin",
    edition: "译林版",
    publisher: "译林出版社",
    aliases: ["译林版", "译林", "译林出版社"],
    subjects: ["英语"],
    stages: ["小学", "初中", "高中"],
  },
  {
    id: "education-science",
    edition: "教科版",
    publisher: "教育科学出版社",
    aliases: ["教科版", "教课版", "教育科学出版社"],
    subjects: ["科学", "物理"],
    stages: ["小学", "初中", "高中"],
  },
];

const PRIMARY_GRADES = ["一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
const MIDDLE_GRADES = ["七年级", "八年级", "九年级"];
const HIGH_VOLUMES = ["必修第一册", "必修第二册", "选择性必修第一册", "选择性必修第二册", "选择性必修第三册"];

// This is an intentionally bounded identity directory, not a claim of complete national textbook coverage.
// It has no chapter/page/ISBN truth; uploaded source files or an official publisher feed remain the citation authority.
export const TEXTBOOK_CATALOG_COVERAGE = {
  schemaVersion: "teacher-textbook-catalog/initial-v1",
  source: "curated_identity_directory",
  coverage: "edition + publisher + stage + grade + subject + volume; no chapter/page/ISBN",
  families: CATALOG_FAMILIES.map((family) => family.id),
  familyCount: CATALOG_FAMILIES.length,
};

export const TEXTBOOK_CATALOG_ENTRIES: TextbookCatalogEntry[] = CATALOG_FAMILIES.flatMap((family) =>
  family.stages.flatMap((schoolStage): TextbookCatalogEntry[] => {
    const subjects = family.subjects;
    if (schoolStage === "高中") {
      return subjects.flatMap((subject) => HIGH_VOLUMES.map((volume) => ({
        id: `${family.id}-高中-${compact(subject)}-${compact(volume)}`,
        familyId: family.id,
        edition: family.edition,
        publisher: family.publisher,
        schoolStage: "高中" as const,
        subject,
        volume,
        coverage: "identity_only" as const,
      })));
    }
    return subjects.flatMap((subject) => (schoolStage === "小学" ? PRIMARY_GRADES : MIDDLE_GRADES)
      .flatMap((grade) => ["上册", "下册"].map((volume) => ({
        id: `${family.id}-${compact(grade)}-${compact(subject)}-${volume}`,
        familyId: family.id,
        edition: family.edition,
        publisher: family.publisher,
        schoolStage: schoolStage as "小学" | "初中",
        grade,
        subject,
        volume,
        coverage: "identity_only" as const,
      }))));
  }),
);

const SUBJECTS = [...CORE_SUBJECTS, "道德与法治", "科学", "信息科技", "音乐", "美术", "体育"];
const CHINESE_NUMBERS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const NUMBER_CHINESE = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compact(value: unknown) {
  return text(value)
    .toLowerCase()
    .replace(/统遍版/g, "统编版")
    .replace(/人名教育出版社/g, "人民教育出版社")
    .replace(/[\s·•,，。;；:：()（）\[\]【】_\-]/g, "");
}

function normalizedStage(value: unknown) {
  const source = compact(value);
  if (/幼儿园|学前/.test(source)) return "幼儿园";
  if (/小学/.test(source)) return "小学";
  if (/初中|初一|初二|初三/.test(source)) return "初中";
  if (/高中|高一|高二|高三/.test(source)) return "高中";
  return undefined;
}

function gradeFromNumber(number: number) {
  return number >= 1 && number <= 9 ? `${NUMBER_CHINESE[number]}年级` : undefined;
}

function normalizedGrade(value: unknown) {
  const source = compact(value);
  const schoolMatch = source.match(/([一二三四五六七八九1-9])年级/);
  if (schoolMatch) {
    const number = Number(schoolMatch[1]) || CHINESE_NUMBERS[schoolMatch[1]];
    return gradeFromNumber(number);
  }
  const primaryMatch = source.match(/小([一二三四五六1-6])/);
  if (primaryMatch) {
    const number = Number(primaryMatch[1]) || CHINESE_NUMBERS[primaryMatch[1]];
    return gradeFromNumber(number);
  }
  const middleMatch = source.match(/初([一二三1-3])/);
  if (middleMatch) {
    const offset = Number(middleMatch[1]) || CHINESE_NUMBERS[middleMatch[1]];
    return gradeFromNumber(offset + 6);
  }
  const highMatch = source.match(/高([一二三1-3])/);
  if (highMatch) {
    const number = Number(highMatch[1]) || CHINESE_NUMBERS[highMatch[1]];
    return `高${NUMBER_CHINESE[number]}`;
  }
  return undefined;
}

function stageForGrade(grade?: string) {
  if (!grade) return undefined;
  if (/高[一二三]/.test(grade)) return "高中";
  const number = CHINESE_NUMBERS[grade[0]];
  if (number >= 1 && number <= 6) return "小学";
  if (number >= 7 && number <= 9) return "初中";
  return undefined;
}

function normalizedSubject(value: unknown) {
  const source = compact(value);
  return SUBJECTS.find((subject) => source.includes(compact(subject)));
}

function volumeNumber(value: string) {
  const match = value.match(/([一二三四五六1-6])/);
  if (!match) return undefined;
  return Number(match[1]) || CHINESE_NUMBERS[match[1]];
}

function normalizedVolume(value: unknown) {
  const source = compact(value);
  const selective = source.match(/选择性必修第?([一二三四五六1-6])(?:册)?/);
  if (selective) return `选择性必修第${NUMBER_CHINESE[volumeNumber(selective[1]) || 0]}册`;
  const required = source.match(/必修第?([一二三四五六1-6])(?:册)?/);
  if (required) return `必修第${NUMBER_CHINESE[volumeNumber(required[1]) || 0]}册`;
  if (/全一册|全册/.test(source)) return "全一册";
  if (/上册|上$/.test(source)) return "上册";
  if (/下册|下$/.test(source)) return "下册";
  return undefined;
}

function normalizedYear(value: unknown) {
  return text(value).match(/(?:19|20)\d{2}/)?.[0];
}

function familyMatches(source: string) {
  return CATALOG_FAMILIES.filter((family) => family.aliases.some((alias) => source.includes(compact(alias))));
}

function publisherFamily(value: unknown) {
  const matches = familyMatches(compact(value));
  const ids = [...new Set(matches.map((item) => item.publisher))];
  return ids.length === 1 ? matches[0] : undefined;
}

function buildDisplayName(family: CatalogFamily | undefined, grade: string | undefined, subject: string | undefined, volume: string | undefined, fallback: string) {
  if (!family) return fallback;
  return [family.edition, grade, subject, volume].filter(Boolean).join("");
}

function catalogEntriesFor(
  familyIds: string[],
  schoolStage: string | undefined,
  grade: string | undefined,
  subject: string | undefined,
  volume: string | undefined,
) {
  return TEXTBOOK_CATALOG_ENTRIES.filter((entry) =>
    familyIds.includes(entry.familyId)
      && (!schoolStage || entry.schoolStage === schoolStage)
      && (!grade || !entry.grade || entry.grade === grade)
      && (!subject || entry.subject === subject)
      && (!volume || entry.volume === volume),
  );
}

export function resolveTextbookCatalog(input: TextbookCatalogInput): TextbookCatalogResolution {
  const displayName = text(input.displayName);
  const displayFamilies = familyMatches(compact(displayName));
  const explicitPublisherFamily = publisherFamily(input.publisher);
  let families = displayFamilies.length ? displayFamilies : explicitPublisherFamily ? [explicitPublisherFamily] : [];
  const explicitSubject = normalizedSubject(input.subject);
  const inferredSubject = normalizedSubject(displayName);
  const subject = explicitSubject || inferredSubject;
  const explicitGrade = normalizedGrade(input.grade);
  const inferredGrade = normalizedGrade(displayName);
  const grade = explicitGrade || inferredGrade;
  const explicitStage = normalizedStage(input.schoolStage);
  const inferredStage = stageForGrade(grade) || normalizedStage(displayName);
  const schoolStage = explicitStage || inferredStage;
  const explicitVolume = normalizedVolume(input.volume);
  const inferredVolume = normalizedVolume(displayName);
  const volume = explicitVolume || inferredVolume;
  const editionYear = normalizedYear(input.editionYear) || normalizedYear(displayName);
  const conflicts: string[] = [];

  if (explicitSubject && inferredSubject && explicitSubject !== inferredSubject) conflicts.push("subject_conflict");
  if (explicitGrade && inferredGrade && explicitGrade !== inferredGrade) conflicts.push("grade_conflict");
  if (explicitStage && inferredStage && explicitStage !== inferredStage) conflicts.push("school_stage_conflict");
  if (explicitVolume && inferredVolume && explicitVolume !== inferredVolume) conflicts.push("volume_conflict");
  if (displayFamilies.length && explicitPublisherFamily && !displayFamilies.some((family) => family.publisher === explicitPublisherFamily.publisher)) {
    conflicts.push("publisher_conflict");
  }

  if (!families.length) {
    families = CATALOG_FAMILIES.filter((family) =>
      (!subject || family.subjects.includes(subject)) && (!schoolStage || family.stages.includes(schoolStage)),
    );
  }
  const compatible = families.filter((family) =>
    (!subject || family.subjects.includes(subject)) && (!schoolStage || family.stages.includes(schoolStage)),
  );
  if (families.length && subject && compatible.length === 0) conflicts.push("edition_subject_conflict");
  const candidateFamilies = compatible.length ? compatible : families;
  const uniqueCandidates = [...new Set(candidateFamilies.map((family) => family.id))];
  const candidateEntries = catalogEntriesFor(uniqueCandidates, schoolStage, grade, subject, volume);
  const uniqueEntryIds = [...new Set(candidateEntries.map((entry) => entry.id))];
  const selectedEntry = uniqueEntryIds.length === 1 ? candidateEntries[0] : undefined;
  const selectedFamily = selectedEntry
    ? CATALOG_FAMILIES.find((family) => family.id === selectedEntry.familyId)
    : uniqueCandidates.length === 1 ? candidateFamilies[0] : undefined;
  const matchedFields = [
    selectedFamily && "edition",
    selectedFamily && "publisher",
    schoolStage && "schoolStage",
    grade && "grade",
    subject && "subject",
    volume && "volume",
    editionYear && "editionYear",
  ].filter((value): value is string => Boolean(value));
  const missingFields = [
    !selectedFamily && "edition",
    !subject && "subject",
    !schoolStage && "schoolStage",
    !grade && schoolStage !== "高中" && "grade",
    !volume && "volume",
  ].filter((value): value is string => Boolean(value));
  const enoughLocation = schoolStage === "高中" ? Boolean(volume) : Boolean(grade && volume);
  const isExact = Boolean(selectedEntry && subject && enoughLocation && conflicts.length === 0);
  const hasRecognizableIdentity = Boolean(selectedFamily || subject || grade || volume);

  let status: TextbookCatalogResolution["status"] = "unmatched";
  let messageCode: TextbookCatalogResolution["messageCode"] = "textbook_identity_unrecognized";
  let confidence = 10;
  if (!hasRecognizableIdentity) {
    status = "unmatched";
    messageCode = "textbook_identity_unrecognized";
    confidence = 10;
  } else if (isExact) {
    status = "exact";
    messageCode = "textbook_identity_recognized";
    confidence = 90;
  } else if (conflicts.length || uniqueCandidates.length > 1) {
    status = "ambiguous";
    messageCode = "textbook_identity_ambiguous";
    confidence = conflicts.length ? 35 : 48;
  } else if (hasRecognizableIdentity) {
    status = "ambiguous";
    messageCode = "textbook_identity_incomplete";
    confidence = 64;
  }

  return {
    status,
    confidence,
    catalogId: isExact ? selectedEntry?.id : undefined,
    candidateIds: hasRecognizableIdentity
      ? (uniqueEntryIds.length ? uniqueEntryIds.slice(0, 20) : uniqueCandidates)
      : [],
    normalized: {
      displayName: buildDisplayName(selectedFamily, grade, subject, volume, displayName),
      schoolStage,
      grade,
      subject,
      publisher: selectedFamily?.publisher || text(input.publisher) || undefined,
      editionYear,
      volume,
    },
    matchedFields,
    missingFields,
    conflicts: [...new Set(conflicts)],
    requiresTeacherConfirmation: !isExact,
    messageCode,
  };
}

export function isKnownCatalogFamily(catalogId: string) {
  return CATALOG_FAMILIES.some((family) => family.id === catalogId);
}

export function getTextbookCatalogEntry(catalogId: string) {
  return TEXTBOOK_CATALOG_ENTRIES.find((entry) => entry.id === catalogId);
}
