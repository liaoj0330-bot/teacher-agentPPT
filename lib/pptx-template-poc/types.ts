export type TemplateColor = { name: string; value: string; source: "srgb" | "system" | "scheme" | "preset" | "unknown" };
export type TemplateFontFace = { script: string; typeface: string };

export type TemplateThemeManifest = {
  id: string;
  path: string;
  name: string;
  colors: TemplateColor[];
  fonts: {
    majorLatin: string;
    majorEastAsian: string;
    majorComplexScript: string;
    minorLatin: string;
    minorEastAsian: string;
    minorComplexScript: string;
    supplemental: TemplateFontFace[];
  };
};

export type TemplatePlaceholderManifest = {
  id: string;
  name: string;
  type: string;
  index: number | null;
  geometry: { xEmu: number; yEmu: number; widthEmu: number; heightEmu: number } | null;
  inheritsGeometry: boolean;
};

export type TemplateLayoutManifest = {
  id: string;
  path: string;
  name: string;
  type: string;
  masterPath: string | null;
  preserve: boolean;
  showMasterShapes: boolean;
  placeholders: TemplatePlaceholderManifest[];
};

export type TemplateMasterManifest = {
  id: string;
  path: string;
  name: string;
  themePath: string | null;
  layoutPaths: string[];
  placeholders: TemplatePlaceholderManifest[];
};

export type TemplateAssetManifest = {
  id: string;
  path: string;
  fileName: string;
  extension: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  referencedBy: string[];
};

export type TemplateManifest = {
  schemaVersion: "teacher-pptx-template-manifest/v1";
  source: { fileName: string | null; sizeBytes: number; sha256: string };
  slideSize: {
    widthEmu: number;
    heightEmu: number;
    widthInches: number;
    heightInches: number;
    aspectRatio: number;
    orientation: "landscape" | "portrait" | "square";
    preset: "standard_4_3" | "wide_16_9" | "wide_16_10" | "custom";
  };
  counts: { slides: number; masters: number; layouts: number; themes: number; placeholders: number; assets: number };
  themes: TemplateThemeManifest[];
  masters: TemplateMasterManifest[];
  layouts: TemplateLayoutManifest[];
  assets: TemplateAssetManifest[];
  warnings: string[];
};
