export type SchoolLibraryCategory =
  | "administration-planning"
  | "learning-management"
  | "innovation-works"
  | "activities-pr"
  | "support-donation"
  | "central-forms";

export type SchoolLibraryCategoryTone =
  | "green"
  | "mint"
  | "purple"
  | "orange"
  | "blue"
  | "teal";

export type SchoolLibraryCategoryOption = {
  id: SchoolLibraryCategory;
  label: string;
  description: string;
  icon: string;
  tone: SchoolLibraryCategoryTone;
};

export const SCHOOL_LIBRARY_CATEGORIES: SchoolLibraryCategoryOption[] = [
  {
    id: "administration-planning",
    label: "บริหารและแผนงาน",
    description: "แผนงาน • โครงการ • SAR • ข้อมูลสารสนเทศ",
    icon: "▤",
    tone: "green",
  },
  {
    id: "learning-management",
    label: "การจัดการเรียนรู้",
    description: "หลักสูตร • แผนการสอน • สื่อ • แบบประเมิน",
    icon: "☑",
    tone: "mint",
  },
  {
    id: "innovation-works",
    label: "ผลงานและนวัตกรรม",
    description: "วิจัย • นวัตกรรม • Best Practice • ผลงานครู",
    icon: "⌬",
    tone: "purple",
  },
  {
    id: "activities-pr",
    label: "กิจกรรมและประชาสัมพันธ์",
    description: "ภาพกิจกรรม • ข่าว • วิดีโอ • สื่อเผยแพร่",
    icon: "▧",
    tone: "orange",
  },
  {
    id: "support-donation",
    label: "การสนับสนุนและบริจาค",
    description: "ขอความอนุเคราะห์ • รับบริจาค • หนังสือขอบคุณ",
    icon: "◇",
    tone: "blue",
  },
  {
    id: "central-forms",
    label: "แบบฟอร์มและเอกสารกลาง",
    description: "แบบฟอร์มเปล่า • หนังสือตัวอย่าง • เอกสารพร้อมใช้",
    icon: "□",
    tone: "teal",
  },
];

export const DEFAULT_SCHOOL_LIBRARY_CATEGORY: SchoolLibraryCategory =
  "administration-planning";

const LEGACY_CATEGORY_MAP: Record<string, SchoolLibraryCategory> = {
  "lesson-plan": "learning-management",
  "operation-plan": "administration-planning",
  research: "innovation-works",
  certificates: "innovation-works",
  forms: "central-forms",
};

export function normalizeSchoolLibraryCategory(
  value: unknown,
): SchoolLibraryCategory {
  if (typeof value !== "string") return DEFAULT_SCHOOL_LIBRARY_CATEGORY;

  const trimmed = value.trim();
  if (
    SCHOOL_LIBRARY_CATEGORIES.some((category) => category.id === trimmed)
  ) {
    return trimmed as SchoolLibraryCategory;
  }

  return LEGACY_CATEGORY_MAP[trimmed] || DEFAULT_SCHOOL_LIBRARY_CATEGORY;
}
