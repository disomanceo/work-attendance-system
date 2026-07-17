"use client";

import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import {
  deleteTeachingInspection,
  isTeachingInspectionFirebaseConfigured,
  listTeachingInspections,
  saveTeachingInspection,
  updateTeachingInspectionPdfReport,
  type TeachingInspectionPayload,
  type TeachingInspectionPdfReport,
  type TeachingInspectionRecord,
  type TeachingInspectionStatus,
} from "@/lib/teaching-supervision/firestore";
import styles from "./teaching-supervision.module.css";

type Profile = {
  id: string;
  full_name: string;
  position: string | null;
  role: string;
  profile_image_file_id?: string | null;
  homeroomClassLevels?: string[];
};

type ActiveTab = "teachers" | "assessment" | "summary";

type RubricItem = {
  id: string;
  number: string;
  title: string;
};

type RubricSection = {
  id: string;
  title: string;
  fullScore: number;
  accent: "indigo" | "emerald" | "orange" | "sky" | "violet" | "rose";
  items: RubricItem[];
};

type FormState = {
  inspectionId: string;
  teacherId: string;
  teacherType: "homeroom" | "subject";
  inspectionRound: string;
  learningAreaName: string;
  subjectName: string;
  classLevelName: string;
  inspectionDate: string;
  startTime: string;
  endTime: string;
  supervisorId: string;
  coSupervisorId: string;
  learningMethod: string;
  academicYearBE: string;
  semester: string;
  strengths: string;
  improvements: string;
  recommendations: string;
  developmentAgreement: string;
  followUpDate: string;
};

type EvidenceImage = {
  slot: 1 | 2 | 3 | 4;
  category: string;
  caption: string;
  fileName: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  file?: File;
  driveFileId?: string;
  driveFolderId?: string;
  driveUrl?: string;
  uploadedAt?: string;
};

type UploadedDriveFile = {
  driveFileId: string;
  driveFolderId: string;
  driveUrl: string;
  fileName: string;
  mimeType: string;
  size: number;
};

type SavedInspectionSummary = {
  inspectionId: string;
  teacherName: string;
  teacherPosition: string;
  inspectionRound: number;
  academicYearBE: number;
  semester: number;
  classLevelName: string;
  learningAreaName: string;
  subjectName: string;
  inspectionDate: string;
  savedAt: string;
  total: {
    earnedScore: number;
    percentage: number;
    averageRating: number;
    qualityLevel: string;
    completedItems: number;
    totalItems: number;
  };
  sections: Array<{
    id: string;
    title: string;
    earnedScore: number;
    fullScore: number;
    averageRating: number;
    percentage: number;
    qualityLevel: string;
    completedItems: number;
    totalItems: number;
  }>;
  notes: Pick<
    FormState,
    "strengths" | "improvements" | "recommendations" | "developmentAgreement" | "followUpDate"
  >;
  images: EvidenceImage[];
  pdfReport?: TeachingInspectionPdfReport | null;
};

type TeacherInspectionRow = {
  profile: Profile;
  latestInspection: TeachingInspectionRecord | null;
};

const STORAGE_KEY = "teaching-supervision-draft";
const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
}).format(new Date());

const EMPTY_FORM: FormState = {
  inspectionId: "",
  teacherId: "",
  teacherType: "homeroom",
  inspectionRound: "1",
  learningAreaName: "ภาษาไทย",
  subjectName: "ภาษาไทย",
  classLevelName: "ประถมศึกษาปีที่ 3",
  inspectionDate: TODAY,
  startTime: "09:00",
  endTime: "10:00",
  supervisorId: "",
  coSupervisorId: "",
  learningMethod: "Active Learning",
  academicYearBE: "2569",
  semester: "1",
  strengths:
    "ครูเตรียมสื่อและอุปกรณ์พร้อม ใช้กิจกรรมให้นักเรียนมีส่วนร่วม และดูแลบรรยากาศในชั้นเรียนได้ดี",
  improvements:
    "ควรเปิดโอกาสให้นักเรียนอธิบายแนวคิดของตนเองมากขึ้น และใช้คำถามปลายเปิดเพื่อกระตุ้นการคิดวิเคราะห์",
  recommendations:
    "ควรใช้รูปแบบการจัดกิจกรรมที่เน้น Active Learning เพิ่มขึ้น พร้อมให้ข้อมูลย้อนกลับระหว่างเรียนทันที",
  developmentAgreement:
    "ครูจะปรับกิจกรรมการเรียนรู้ให้ผู้เรียนได้อธิบายแนวคิดมากขึ้น และนำเทคนิคการตั้งคำถามปลายเปิดมาใช้ในการสอน",
  followUpDate: "2026-08-15",
};

const LEARNING_AREAS = [
  "ปฐมวัย",
  "ภาษาไทย",
  "คณิตศาสตร์",
  "วิทยาศาสตร์และเทคโนโลยี",
  "สังคมศึกษา ศาสนา และวัฒนธรรม",
  "สุขศึกษาและพลศึกษา",
  "ศิลปะ",
  "การงานอาชีพ",
  "ภาษาต่างประเทศ",
  "กิจกรรมพัฒนาผู้เรียน",
];

const CLASS_LEVELS = [
  "อนุบาล 2",
  "อนุบาล 3",
  "ประถมศึกษาปีที่ 1",
  "ประถมศึกษาปีที่ 2",
  "ประถมศึกษาปีที่ 3",
  "ประถมศึกษาปีที่ 4",
  "ประถมศึกษาปีที่ 5",
  "ประถมศึกษาปีที่ 6",
];

const LEARNING_METHODS = [
  "การจัดการเรียนรู้ทั่วไป",
  "Active Learning",
  "Project-Based Learning",
  "Problem-Based Learning",
  "STEM",
  "Coding",
  "Cooperative Learning",
  "Inquiry-Based Learning",
  "อื่น ๆ",
];

const RUBRIC_SECTIONS: RubricSection[] = [
  {
    id: "environment",
    title: "สภาพแวดล้อมและบรรยากาศในชั้นเรียน",
    fullScore: 15,
    accent: "indigo",
    items: [
      { id: "env-1", number: "1.1", title: "ห้องเรียนสะอาด เป็นระเบียบ และปลอดภัย" },
      { id: "env-2", number: "1.2", title: "มีบรรยากาศที่ส่งเสริมการเรียนรู้" },
      { id: "env-3", number: "1.3", title: "มีป้ายนิเทศหรือสื่อที่มีข้อมูลเป็นปัจจุบัน" },
      { id: "env-4", number: "1.4", title: "จัดสัญลักษณ์ชาติ ศาสนา พระมหากษัตริย์อย่างเหมาะสม" },
      { id: "env-5", number: "1.5", title: "มีมุมวิชาการหรือมุมประสบการณ์ที่เหมาะกับระดับชั้น" },
    ],
  },
  {
    id: "readiness",
    title: "การเตรียมความพร้อมของครู",
    fullScore: 15,
    accent: "emerald",
    items: [
      { id: "ready-1", number: "2.1", title: "มีแผนการจัดการเรียนรู้และบันทึกหลังการสอน" },
      { id: "ready-2", number: "2.2", title: "กำหนดจุดประสงค์การเรียนรู้ชัดเจนและวัดผลได้" },
      { id: "ready-3", number: "2.3", title: "เตรียมเนื้อหา สื่อ อุปกรณ์ และแหล่งเรียนรู้พร้อมใช้งาน" },
      { id: "ready-4", number: "2.4", title: "ออกแบบกิจกรรมสอดคล้องกับมาตรฐาน ตัวชี้วัด และผู้เรียน" },
      { id: "ready-5", number: "2.5", title: "เตรียมวิธีวัดและประเมินผลได้สอดคล้องกับจุดประสงค์" },
    ],
  },
  {
    id: "activity",
    title: "การจัดกิจกรรมการเรียนรู้",
    fullScore: 25,
    accent: "orange",
    items: [
      { id: "act-1", number: "3.1", title: "แจ้งจุดประสงค์หรือสิ่งที่นักเรียนจะได้เรียนรู้" },
      { id: "act-2", number: "3.2", title: "เชื่อมโยงความรู้เดิมกับเนื้อหาหรือสถานการณ์ใหม่" },
      { id: "act-3", number: "3.3", title: "จัดกิจกรรมตามลำดับขั้นตอนอย่างเหมาะสม" },
      { id: "act-4", number: "3.4", title: "ใช้วิธีสอนที่หลากหลายและเหมาะกับเนื้อหา" },
      { id: "act-5", number: "3.5", title: "เปิดโอกาสให้นักเรียนลงมือปฏิบัติ คิด และแก้ปัญหา" },
      { id: "act-6", number: "3.6", title: "ส่งเสริมการทำงานร่วมกันและการแลกเปลี่ยนความคิดเห็น" },
      { id: "act-7", number: "3.7", title: "จัดกิจกรรมเหมาะกับเวลาและสามารถดำเนินการได้จริง" },
    ],
  },
  {
    id: "media",
    title: "การใช้สื่อ เทคโนโลยี และแหล่งเรียนรู้",
    fullScore: 15,
    accent: "sky",
    items: [
      { id: "media-1", number: "4.1", title: "เลือกใช้สื่อเหมาะสมกับเนื้อหาและวัยของผู้เรียน" },
      { id: "media-2", number: "4.2", title: "ใช้เทคโนโลยีหรือแหล่งเรียนรู้ช่วยให้เข้าใจบทเรียน" },
      { id: "media-3", number: "4.3", title: "สื่อมีความถูกต้อง ชัดเจน และพร้อมใช้งาน" },
      { id: "media-4", number: "4.4", title: "เปิดโอกาสให้ผู้เรียนมีปฏิสัมพันธ์กับสื่อหรือแหล่งเรียนรู้" },
      { id: "media-5", number: "4.5", title: "ใช้สื่ออย่างคุ้มค่าและปลอดภัย" },
    ],
  },
  {
    id: "management",
    title: "การบริหารจัดการชั้นเรียนและดูแลผู้เรียน",
    fullScore: 15,
    accent: "violet",
    items: [
      { id: "manage-1", number: "5.1", title: "จัดเวลาเรียนและกิจกรรมได้เหมาะสม" },
      { id: "manage-2", number: "5.2", title: "ดูแลพฤติกรรมและสร้างวินัยเชิงบวกในชั้นเรียน" },
      { id: "manage-3", number: "5.3", title: "ให้ความช่วยเหลือนักเรียนที่ต้องการการดูแลเพิ่มเติม" },
      { id: "manage-4", number: "5.4", title: "สื่อสารกับผู้เรียนด้วยถ้อยคำสุภาพและสร้างกำลังใจ" },
      { id: "manage-5", number: "5.5", title: "จัดการชั้นเรียนให้ผู้เรียนมีส่วนร่วมอย่างทั่วถึง" },
    ],
  },
  {
    id: "assessment",
    title: "การวัดผล การสะท้อนผล และผลลัพธ์ของผู้เรียน",
    fullScore: 15,
    accent: "rose",
    items: [
      { id: "assess-1", number: "6.1", title: "ใช้วิธีวัดผลหลากหลายและตรงกับจุดประสงค์" },
      { id: "assess-2", number: "6.2", title: "ตรวจสอบความเข้าใจของผู้เรียนระหว่างจัดกิจกรรม" },
      { id: "assess-3", number: "6.3", title: "ให้ข้อมูลย้อนกลับที่นำไปพัฒนาการเรียนรู้ได้" },
      { id: "assess-4", number: "6.4", title: "ผู้เรียนแสดงผลลัพธ์หรือชิ้นงานตามเป้าหมาย" },
      { id: "assess-5", number: "6.5", title: "นำผลประเมินไปปรับการสอนหรือช่วยเหลือผู้เรียน" },
    ],
  },
];

function scoreLevel(score: number) {
  if (score >= 90) return "ดีเยี่ยม";
  if (score >= 80) return "ดีมาก";
  if (score >= 70) return "ดี";
  if (score >= 60) return "ปานกลาง";
  if (score >= 50) return "ควรพัฒนา";
  return "ต้องปรับปรุงเร่งด่วน";
}

function qualityFromAverage(average: number) {
  if (average >= 4.5) return "ดีเยี่ยม";
  if (average >= 3.5) return "ดี";
  if (average >= 2.5) return "ปานกลาง";
  if (average >= 1.5) return "ควรพัฒนา";
  return "ต้องปรับปรุง";
}

function formatNumber(value: number) {
  return value.toFixed(2);
}

function formatThaiShortDate(value?: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function fileSizeLabel(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function TeachingSupervisionPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [inspectionRecords, setInspectionRecords] = useState<TeachingInspectionRecord[]>([]);
  const [profileImageUrls, setProfileImageUrls] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<ActiveTab>("teachers");
  const [pendingAutoPdfInspectionId, setPendingAutoPdfInspectionId] = useState("");
  const [lastSavedSummary, setLastSavedSummary] =
    useState<SavedInspectionSummary | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [ratings, setRatings] = useState<Record<string, 1 | 2 | 3 | 4 | 5 | null>>({});
  const [images, setImages] = useState<EvidenceImage[]>([]);
  const [teacherSearch, setTeacherSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [learningAreaFilter, setLearningAreaFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("1");
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState(false);

  const firebaseConfigured = isTeachingInspectionFirebaseConfigured();

  useEffect(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => {
    async function loadProfiles() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.replace("/login");
          return;
        }

        const response = await fetch("/api/teaching-supervision/profiles", {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.message || "โหลดรายชื่อครูและบุคลากรไม่สำเร็จ");
        }

        const nextProfiles = (result.profiles ?? []) as Profile[];
        setProfiles(nextProfiles);
        setCurrentProfile((result.currentProfile ?? null) as Profile | null);
        const imageEntries = await Promise.all(
          nextProfiles
            .filter((profile) => profile.profile_image_file_id)
            .map(async (profile) => [
              profile.id,
              await getCachedProfileImageUrl(
                profile.profile_image_file_id,
                session.access_token,
              ),
            ] as const),
        );
        setProfileImageUrls(
          Object.fromEntries(imageEntries.filter(([, url]) => Boolean(url))),
        );
        setForm((current) => ({
          ...current,
          supervisorId: current.supervisorId || result.currentProfile?.id || "",
        }));
      } catch (error) {
        setMessageError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "โหลดรายชื่อครูและบุคลากรไม่สำเร็จ",
        );
      } finally {
        setLoadingProfiles(false);
      }
    }

    void loadProfiles();
  }, [router, supabase]);

  useEffect(() => {
    async function loadInspectionRecords() {
      if (!firebaseConfigured) return;

      try {
        const records = await listTeachingInspections();
        setInspectionRecords(records);
      } catch (error) {
        setMessageError(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "โหลดผลการนิเทศที่บันทึกไว้ไม่สำเร็จ",
        );
      }
    }

    void loadInspectionRecords();
  }, [firebaseConfigured]);

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.replace("/login");
      throw new Error("กรุณาเข้าสู่ระบบใหม่");
    }

    return session.access_token;
  }, [router, supabase]);

  useEffect(() => {
    return () => {
      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    };
  }, [images]);

  const profileById = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.id, profile]));
  }, [profiles]);

  const canManageInspections =
    currentProfile?.role === "director" || currentProfile?.role === "admin";

  const positions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .filter((profile) => profile.role !== "director" && profile.role !== "admin")
          .map((profile) => profile.position || profile.role)
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b, "th"));
  }, [profiles]);

  const inspectableProfiles = useMemo(() => {
    return profiles.filter((profile) => {
      return profile.role !== "director" && profile.role !== "admin";
    });
  }, [profiles]);

  const inspectionRounds = useMemo(() => {
    const rounds = new Set(["1"]);
    inspectionRecords.forEach((record) => {
      rounds.add(String(record.inspectionRound || 1));
    });
    return Array.from(rounds).sort((a, b) => Number(a) - Number(b));
  }, [inspectionRecords]);

  const latestInspectionByTeacher = useMemo(() => {
    const byTeacher = new Map<string, TeachingInspectionRecord>();
    const selectedRound = Number(roundFilter) || 1;

    inspectionRecords
      .filter((record) => {
        return (
          record.status === "completed" &&
          Number(record.academicYearBE || 0) === Number(form.academicYearBE || EMPTY_FORM.academicYearBE) &&
          Number(record.semester || 0) === Number(form.semester || 1) &&
          Number(record.inspectionRound || 1) === selectedRound
        );
      })
      .sort((a, b) => {
        const left = `${a.inspectionDate || ""}-${a.id}`;
        const right = `${b.inspectionDate || ""}-${b.id}`;
        return right.localeCompare(left);
      })
      .forEach((record) => {
        if (!byTeacher.has(record.teacherId)) byTeacher.set(record.teacherId, record);
      });

    return byTeacher;
  }, [form.academicYearBE, form.semester, inspectionRecords, roundFilter]);

  const teacherRows = useMemo<TeacherInspectionRow[]>(() => {
    const search = teacherSearch.trim().toLowerCase();

    return inspectableProfiles
      .map((profile) => ({
        profile,
        latestInspection: latestInspectionByTeacher.get(profile.id) ?? null,
      }))
      .filter(({ profile, latestInspection }) => {
        const position = profile.position || profile.role || "";
        const classText = (profile.homeroomClassLevels ?? []).join(" ");
        const haystack = `${profile.full_name} ${position} ${classText}`.toLowerCase();
        const matchesSearch = !search || haystack.includes(search);
        const matchesPosition = positionFilter === "all" || position === positionFilter;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "completed" && latestInspection) ||
          (statusFilter === "pending" && !latestInspection);
        const matchesLearningArea =
          learningAreaFilter === "all" ||
          latestInspection?.learningAreaName === learningAreaFilter;

        return (
          matchesSearch &&
          matchesPosition &&
          matchesStatus &&
          matchesLearningArea
        );
      });
  }, [
    latestInspectionByTeacher,
    inspectableProfiles,
    learningAreaFilter,
    positionFilter,
    statusFilter,
    teacherSearch,
  ]);

  const createSavedSummaryFromRecord = useCallback(
    (record: TeachingInspectionRecord): SavedInspectionSummary => ({
      inspectionId: record.id,
      teacherName: record.teacherName,
      teacherPosition: profileById.get(record.teacherId)?.position || "",
      inspectionRound: Number(record.inspectionRound || 1),
      academicYearBE: Number(record.academicYearBE || EMPTY_FORM.academicYearBE),
      semester: Number(record.semester || EMPTY_FORM.semester),
      classLevelName: record.classLevelName,
      learningAreaName: record.learningAreaName,
      subjectName: record.subjectName,
      inspectionDate: record.inspectionDate,
      savedAt: new Date().toISOString(),
      total: {
        earnedScore: record.totalEarnedScore,
        percentage: record.totalPercentage,
        averageRating: record.averageRating,
        qualityLevel: record.qualityLevel,
        completedItems: record.sections.reduce(
          (sum, section) => sum + section.completedItems,
          0,
        ),
        totalItems: record.sections.reduce((sum, section) => sum + section.totalItems, 0),
      },
      sections: record.sections.map((section) => ({
        id: section.sectionId,
        title: section.sectionName,
        earnedScore: section.earnedScore,
        fullScore: section.fullScore,
        averageRating: section.averageRating,
        percentage: section.percentage,
        qualityLevel: section.qualityLevel,
        completedItems: section.completedItems,
        totalItems: section.totalItems,
      })),
      notes: {
        strengths: record.strengths,
        improvements: record.improvements,
        recommendations: record.recommendations,
        developmentAgreement: record.developmentAgreement,
        followUpDate: record.followUpDate || "",
      },
      images: (record.images ?? []).map((image) => ({
        ...image,
        previewUrl: image.driveUrl || "",
      })) as EvidenceImage[],
      pdfReport: record.pdfReport ?? null,
    }),
    [profileById],
  );

  const openInspectionResult = useCallback(
    (record: TeachingInspectionRecord) => {
      setLastSavedSummary(createSavedSummaryFromRecord(record));
      setActiveTab("summary");
      setMessage("");
      setMessageError(false);
    },
    [createSavedSummaryFromRecord],
  );

  const resetInspectionForm = useCallback(() => {
    images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
    setForm((current) => ({
      ...EMPTY_FORM,
      supervisorId: currentProfile?.id ?? current.supervisorId,
    }));
    setRatings({});
    setImages([]);
    window.localStorage.removeItem(STORAGE_KEY);
  }, [currentProfile?.id, images]);

  const beginInspection = useCallback(
    (profile: Profile) => {
      const classLevel = profile.homeroomClassLevels?.[0] ?? "";
      const isKindergarten = classLevel.includes("อนุบาล");
      const learningAreaName = isKindergarten ? "ปฐมวัย" : EMPTY_FORM.learningAreaName;

      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      setForm((current) => ({
        ...EMPTY_FORM,
        teacherId: profile.id,
        teacherType: classLevel ? "homeroom" : "subject",
        inspectionRound: roundFilter,
        classLevelName: classLevel || EMPTY_FORM.classLevelName,
        learningAreaName,
        subjectName: isKindergarten ? "กิจกรรมปฐมวัย" : learningAreaName,
        supervisorId: current.supervisorId || currentProfile?.id || "",
      }));
      setRatings({});
      setImages([]);
      setMessage("");
      setMessageError(false);
      setActiveTab("assessment");
    },
    [currentProfile?.id, images, roundFilter],
  );

  const editInspection = useCallback(
    (record: TeachingInspectionRecord) => {
      if (!canManageInspections) {
        openInspectionResult(record);
        return;
      }

      images.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      const nextRatings: Record<string, 1 | 2 | 3 | 4 | 5 | null> = {};
      record.sections.forEach((section) => {
        section.items.forEach((item) => {
          nextRatings[item.itemId] = item.rating;
        });
      });

      setForm({
        inspectionId: record.id,
        teacherId: record.teacherId,
        teacherType: record.teacherType,
        inspectionRound: String(record.inspectionRound || 1),
        learningAreaName: record.learningAreaName,
        subjectName: record.subjectName,
        classLevelName: record.classLevelName,
        inspectionDate: record.inspectionDate,
        startTime: record.startTime,
        endTime: record.endTime,
        supervisorId: record.supervisorId || currentProfile?.id || "",
        coSupervisorId: record.coSupervisorId || "",
        learningMethod: record.learningMethod,
        academicYearBE: String(record.academicYearBE || EMPTY_FORM.academicYearBE),
        semester: String(record.semester || EMPTY_FORM.semester),
        strengths: record.strengths,
        improvements: record.improvements,
        recommendations: record.recommendations,
        developmentAgreement: record.developmentAgreement,
        followUpDate: record.followUpDate || "",
      });
      setRatings(nextRatings);
      setImages(
        (record.images ?? []).map((image) => ({
          ...image,
          previewUrl: image.driveUrl || "",
        })) as EvidenceImage[],
      );
      setMessage("");
      setMessageError(false);
      setActiveTab("assessment");
    },
    [canManageInspections, currentProfile?.id, images, openInspectionResult],
  );

  const sectionSummaries = useMemo(() => {
    return RUBRIC_SECTIONS.map((section) => {
      const rawScore = section.items.reduce(
        (sum, item) => sum + (ratings[item.id] ?? 0),
        0,
      );
      const completedItems = section.items.filter((item) => ratings[item.id]).length;
      const rawFullScore = section.items.length * 5;
      const earnedScore =
        rawFullScore > 0 ? (rawScore / rawFullScore) * section.fullScore : 0;
      const averageRating =
        completedItems > 0 ? rawScore / completedItems : 0;
      const percentage =
        section.fullScore > 0 ? (earnedScore / section.fullScore) * 100 : 0;

      return {
        ...section,
        rawScore,
        rawFullScore,
        earnedScore,
        averageRating,
        percentage,
        completedItems,
        totalItems: section.items.length,
        qualityLevel: completedItems
          ? qualityFromAverage(averageRating)
          : "รอประเมิน",
      };
    });
  }, [ratings]);

  const total = useMemo(() => {
    const earnedScore = sectionSummaries.reduce(
      (sum, section) => sum + section.earnedScore,
      0,
    );
    const completedItems = sectionSummaries.reduce(
      (sum, section) => sum + section.completedItems,
      0,
    );
    const totalItems = sectionSummaries.reduce(
      (sum, section) => sum + section.totalItems,
      0,
    );
    const rawScore = sectionSummaries.reduce((sum, section) => sum + section.rawScore, 0);
    const averageRating = completedItems > 0 ? rawScore / completedItems : 0;

    return {
      earnedScore,
      completedItems,
      totalItems,
      percentage: earnedScore,
      averageRating,
      qualityLevel: scoreLevel(earnedScore),
      complete: completedItems === totalItems,
    };
  }, [sectionSummaries]);

  const createSavedSummary = useCallback(
    (
      inspectionId: string,
      savedImages: EvidenceImage[],
      pdfReport?: TeachingInspectionPdfReport | null,
    ): SavedInspectionSummary => ({
      inspectionId,
      teacherName: profileById.get(form.teacherId)?.full_name ?? "",
      teacherPosition: profileById.get(form.teacherId)?.position || "",
      inspectionRound: Number(form.inspectionRound) || 1,
      academicYearBE: Number(form.academicYearBE) || 2569,
      semester: Number(form.semester) || 1,
      classLevelName: form.classLevelName,
      learningAreaName: form.learningAreaName,
      subjectName: form.subjectName,
      inspectionDate: form.inspectionDate,
      savedAt: new Date().toISOString(),
      total: {
        earnedScore: total.earnedScore,
        percentage: total.percentage,
        averageRating: total.averageRating,
        qualityLevel: total.qualityLevel,
        completedItems: total.completedItems,
        totalItems: total.totalItems,
      },
      sections: sectionSummaries.map((section) => ({
        id: section.id,
        title: section.title,
        earnedScore: section.earnedScore,
        fullScore: section.fullScore,
        averageRating: section.averageRating,
        percentage: section.percentage,
        qualityLevel: section.qualityLevel,
        completedItems: section.completedItems,
        totalItems: section.totalItems,
      })),
      notes: {
        strengths: form.strengths,
        improvements: form.improvements,
        recommendations: form.recommendations,
        developmentAgreement: form.developmentAgreement,
        followUpDate: form.followUpDate,
      },
      images: savedImages,
      pdfReport: pdfReport ?? null,
    }),
    [form, profileById, sectionSummaries, total],
  );

  const updateForm = useCallback(
    (key: keyof FormState, value: string) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const toggleRating = useCallback((itemId: string, rating: 1 | 2 | 3 | 4 | 5) => {
    setRatings((current) => ({
      ...current,
      [itemId]: current[itemId] === rating ? null : rating,
    }));
  }, []);

  const saveLocalDraft = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ form, ratings }));
  }, [form, ratings]);

  const buildPayload = useCallback(
    (
      status: TeachingInspectionStatus,
      imageOverride = images,
    ): TeachingInspectionPayload => {
      const teacher = profileById.get(form.teacherId);
      const supervisor = profileById.get(form.supervisorId) ?? currentProfile;
      const coSupervisor = form.coSupervisorId
        ? profileById.get(form.coSupervisorId)
        : null;

      return {
        teacherId: form.teacherId,
        teacherName: teacher?.full_name ?? "",
        teacherType: form.teacherType,
        inspectionRound: Number(form.inspectionRound) || 1,
        learningAreaName: form.learningAreaName,
        subjectName: form.subjectName,
        classLevelName: form.classLevelName,
        inspectionDate: form.inspectionDate,
        startTime: form.startTime,
        endTime: form.endTime,
        supervisorId: form.supervisorId,
        supervisorName: supervisor?.full_name ?? "",
        coSupervisorId: coSupervisor?.id ?? null,
        coSupervisorName: coSupervisor?.full_name ?? null,
        learningMethod: form.learningMethod,
        academicYearBE: Number(form.academicYearBE) || 2569,
        semester: Number(form.semester) || 1,
        status,
        sections: sectionSummaries.map((section) => ({
          sectionId: section.id,
          sectionName: section.title,
          fullScore: section.fullScore,
          earnedScore: section.earnedScore,
          rawScore: section.rawScore,
          rawFullScore: section.rawFullScore,
          averageRating: section.averageRating,
          percentage: section.percentage,
          qualityLevel: section.qualityLevel,
          completedItems: section.completedItems,
          totalItems: section.totalItems,
          items: section.items.map((item) => ({
            itemId: item.id,
            itemNumber: item.number,
            title: item.title,
            rating: ratings[item.id] ?? null,
            weightedScore:
              ratings[item.id] && section.rawFullScore > 0
                ? (ratings[item.id]! / section.rawFullScore) * section.fullScore
                : 0,
          })),
        })),
        totalEarnedScore: total.earnedScore,
        totalFullScore: 100,
        totalPercentage: total.percentage,
        averageRating: total.averageRating,
        qualityLevel: total.qualityLevel,
        strengths: form.strengths,
        improvements: form.improvements,
        recommendations: form.recommendations,
        developmentAgreement: form.developmentAgreement,
        followUpDate: form.followUpDate || null,
        images: imageOverride.map((image) => ({
          slot: image.slot,
          category: image.category,
          caption: image.caption,
          fileName: image.fileName,
          mimeType: image.mimeType,
          size: image.size,
          driveFileId: image.driveFileId,
          driveFolderId: image.driveFolderId,
          driveUrl: image.driveUrl,
          uploadedAt: image.uploadedAt,
        })),
        createdBy: currentProfile?.id ?? "",
        updatedBy: currentProfile?.id ?? "",
      };
    },
    [currentProfile, form, images, profileById, ratings, sectionSummaries, total],
  );

  const ensureInspectionId = useCallback(() => {
    return form.inspectionId || `inspection-${Date.now()}`;
  }, [form.inspectionId]);

  const uploadPendingImages = useCallback(
    async (inspectionId: string) => {
      const pendingImages = images.filter((image) => image.file && !image.driveFileId);
      if (pendingImages.length === 0) return images;

      const token = await getAccessToken();
      const uploadedImages: EvidenceImage[] = [];

      for (const image of pendingImages) {
        const formData = new FormData();
        formData.append("inspectionId", inspectionId);
        formData.append("inspectionDate", form.inspectionDate);
        formData.append("slot", String(image.slot));
        formData.append("category", image.category);
        formData.append("file", image.file as File);

        const response = await fetch("/api/teaching-supervision/images", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const result = (await response.json()) as {
          ok?: boolean;
          message?: string;
          image?: UploadedDriveFile;
        };

        if (!response.ok || !result.ok || !result.image) {
          throw new Error(result.message || "อัปโหลดรูปหลักฐานไม่สำเร็จ");
        }

        uploadedImages.push({
          ...image,
          fileName: result.image.fileName,
          mimeType: result.image.mimeType,
          size: result.image.size,
          driveFileId: result.image.driveFileId,
          driveFolderId: result.image.driveFolderId,
          driveUrl: result.image.driveUrl,
          uploadedAt: new Date().toISOString(),
        });
      }

      const nextImages = images.map((image) => {
        return uploadedImages.find((uploaded) => uploaded.slot === image.slot) ?? image;
      });
      setImages(nextImages);
      return nextImages;
    },
    [form.inspectionDate, getAccessToken, images],
  );

  const handleSave = useCallback(
    async (status: TeachingInspectionStatus) => {
      if (!form.teacherId) {
        setMessageError(true);
        setMessage("กรุณาเลือกครูผู้รับการนิเทศจากแท็บข้อมูลทั่วไปก่อน");
        setActiveTab("teachers");
        return;
      }

      if (status === "completed" && !total.complete) {
        setMessageError(true);
        setMessage(
          `ยังประเมินไม่ครบ ${total.completedItems}/${total.totalItems} ข้อ กรุณาประเมินให้ครบก่อนบันทึกผล`,
        );
        return;
      }

      setSaving(true);
      setMessage("");
      setMessageError(false);

      try {
        saveLocalDraft();

        if (!firebaseConfigured) {
          setMessageError(true);
          setMessage(
            "บันทึกร่างไว้ในเครื่องแล้ว แต่ยังไม่ได้ตั้งค่า Firebase สำหรับบันทึกลงฐานข้อมูล",
          );
          return;
        }

        const inspectionId = ensureInspectionId();
        const savedImages =
          status === "completed"
            ? await uploadPendingImages(inspectionId)
            : images;
        const payload = buildPayload(status, savedImages);
        const existingPdfReport =
          inspectionRecords.find((record) => record.id === (form.inspectionId || inspectionId))
            ?.pdfReport ?? null;

        const id = await saveTeachingInspection(
          form.inspectionId || inspectionId,
          payload,
          !form.inspectionId,
        );
        const savedRecord = {
          id,
          ...payload,
          pdfReport: existingPdfReport,
        } as TeachingInspectionRecord;
        setInspectionRecords((current) => [
          savedRecord,
          ...current.filter((record) => record.id !== id),
        ]);
        setForm((current) => ({ ...current, inspectionId: id }));
        if (status === "completed") {
          setLastSavedSummary(createSavedSummary(id, savedImages, existingPdfReport));
          setActiveTab("summary");
          setPendingAutoPdfInspectionId(id);
        }
        setMessage(
          status === "completed"
            ? "กำลังสร้างและบันทึกรายงาน PDF..."
            : "บันทึกร่างการนิเทศลง Firebase แล้ว",
        );
      } catch (error) {
        setMessageError(true);
        setMessage(
          error instanceof Error ? error.message : "บันทึกข้อมูลนิเทศไม่สำเร็จ",
        );
      } finally {
        setSaving(false);
      }
    },
    [
      buildPayload,
      createSavedSummary,
      ensureInspectionId,
      firebaseConfigured,
      form.teacherId,
      form.inspectionId,
      images,
      inspectionRecords,
      resetInspectionForm,
      saveLocalDraft,
      total,
      uploadPendingImages,
    ],
  );

  const handleDeleteInspection = useCallback(async () => {
    if (!canManageInspections || !form.inspectionId || saving) return;

    const confirmed = window.confirm("ลบการนิเทศครั้งนี้ออกจากระบบ?");
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setMessageError(false);

    try {
      const record =
        inspectionRecords.find((item) => item.id === form.inspectionId) ?? null;
      const token = await getAccessToken();
      const driveFileIds = [
        ...(record?.images ?? [])
          .map((image) => image.driveFileId)
          .filter((fileId): fileId is string => Boolean(fileId)),
        record?.pdfReport?.driveFileId,
      ].filter((fileId): fileId is string => Boolean(fileId));

      for (const driveFileId of driveFileIds) {
        const response = await fetch("/api/teaching-supervision/files/delete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ driveFileId }),
        });
        const result = (await response.json()) as {
          ok?: boolean;
          message?: string;
        };
        if (!response.ok || !result.ok) {
          throw new Error(result.message || "ลบไฟล์ประกอบการนิเทศไม่สำเร็จ");
        }
      }

      await deleteTeachingInspection(form.inspectionId);
      setInspectionRecords((current) =>
        current.filter((item) => item.id !== form.inspectionId),
      );
      setLastSavedSummary((current) =>
        current?.inspectionId === form.inspectionId ? null : current,
      );
      setPendingAutoPdfInspectionId("");
      resetInspectionForm();
      setActiveTab("teachers");
      setMessage("ลบการนิเทศครั้งนี้เรียบร้อยแล้ว");
    } catch (error) {
      setMessageError(true);
      setMessage(
        error instanceof Error ? error.message : "ลบการนิเทศครั้งนี้ไม่สำเร็จ",
      );
    } finally {
      setSaving(false);
    }
  }, [
    canManageInspections,
    form.inspectionId,
    getAccessToken,
    inspectionRecords,
    resetInspectionForm,
    saving,
  ]);

  const handleImageSelect = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setImages((current) => {
      const remainingSlots = [1, 2, 3, 4].filter(
        (slot) => !current.some((image) => image.slot === slot),
      ) as Array<1 | 2 | 3 | 4>;
      const nextImages = files.slice(0, remainingSlots.length).map((file, index) => ({
        slot: remainingSlots[index],
        category: ["ภาพรวมชั้นเรียน", "กิจกรรมการเรียนรู้", "การใช้สื่อ", "ผลงานนักเรียน"][
          remainingSlots[index] - 1
        ],
        caption: ["ภาพรวมชั้นเรียน", "กิจกรรมการเรียนรู้", "การใช้สื่อ", "ผลงานนักเรียน"][
          remainingSlots[index] - 1
        ],
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        file,
      }));

      return [...current, ...nextImages];
    });

    event.target.value = "";
  }, []);

  const removeImage = useCallback((slot: number) => {
    setImages((current) => {
      const removed = current.find((image) => image.slot === slot);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((image) => image.slot !== slot);
    });
  }, []);

  const handleGeneratePdf = useCallback(async (options?: { silent?: boolean }) => {
    if (!reportRef.current) return null;

    if (!options?.silent) {
      setSaving(true);
      setMessage("");
      setMessageError(false);
    }

    try {
      const inspectionId =
        activeTab === "summary" && lastSavedSummary
          ? lastSavedSummary.inspectionId
          : ensureInspectionId();
      const token = await getAccessToken();
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 1.5,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageWidth = pageWidth;
      const imageHeight = (canvas.height * imageWidth) / canvas.width;
      const imageData = canvas.toDataURL("image/jpeg", 0.92);
      let heightLeft = imageHeight;
      let position = 0;

      pdf.addImage(imageData, "JPEG", 0, position, imageWidth, imageHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imageHeight;
        pdf.addPage();
        pdf.addImage(imageData, "JPEG", 0, position, imageWidth, imageHeight);
        heightLeft -= pageHeight;
      }

      const blob = pdf.output("blob");
      const teacher =
        activeTab === "summary" && lastSavedSummary
          ? lastSavedSummary.teacherName
          : profileById.get(form.teacherId)?.full_name ?? "teacher";
      const inspectionDate =
        activeTab === "summary" && lastSavedSummary
          ? lastSavedSummary.inspectionDate
          : form.inspectionDate;
      const existingDriveFileId =
        activeTab === "summary" && lastSavedSummary
          ? lastSavedSummary.pdfReport?.driveFileId
          : inspectionRecords.find((record) => record.id === inspectionId)?.pdfReport?.driveFileId;
      const formData = new FormData();
      formData.append("inspectionId", inspectionId);
      formData.append("inspectionDate", inspectionDate);
      formData.append("teacherName", teacher);
      if (existingDriveFileId) {
        formData.append("existingDriveFileId", existingDriveFileId);
      }
      formData.append("file", blob, `teaching-supervision-${inspectionId}.pdf`);

      const response = await fetch("/api/teaching-supervision/pdf", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = (await response.json()) as {
        ok?: boolean;
        message?: string;
        pdfReport?: UploadedDriveFile;
      };

      if (!response.ok || !result.ok || !result.pdfReport) {
        throw new Error(result.message || "สร้างรายงาน PDF ไม่สำเร็จ");
      }

      const pdfReport: TeachingInspectionPdfReport = {
        ...result.pdfReport,
        uploadedAt: new Date().toISOString(),
      };

      await updateTeachingInspectionPdfReport(inspectionId, pdfReport);
      setInspectionRecords((current) =>
        current.map((record) =>
          record.id === inspectionId ? { ...record, pdfReport } : record,
        ),
      );
      setLastSavedSummary((current) =>
        current?.inspectionId === inspectionId ? { ...current, pdfReport } : current,
      );
      setForm((current) => ({ ...current, inspectionId }));
      if (!options?.silent) {
        setMessage(`สร้างรายงาน PDF แล้ว: ${result.pdfReport.fileName}`);
      }
      return pdfReport;
    } catch (error) {
      setMessageError(true);
      setMessage(
        error instanceof Error ? error.message : "สร้างรายงาน PDF ไม่สำเร็จ",
      );
      return null;
    } finally {
      if (!options?.silent) {
        setSaving(false);
      }
    }
  }, [
    activeTab,
    ensureInspectionId,
    form.inspectionDate,
    form.teacherId,
    getAccessToken,
    inspectionRecords,
    lastSavedSummary,
    profileById,
  ]);

  useEffect(() => {
    if (
      !pendingAutoPdfInspectionId ||
      activeTab !== "summary" ||
      lastSavedSummary?.inspectionId !== pendingAutoPdfInspectionId
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        const pdfReport = await handleGeneratePdf({ silent: true });
        setPendingAutoPdfInspectionId("");
        if (pdfReport) {
          resetInspectionForm();
          setActiveTab("teachers");
          setMessageError(false);
          setMessage("บันทึกเรียบร้อยแล้ว");
        }
      })();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [
    activeTab,
    handleGeneratePdf,
    lastSavedSummary?.inspectionId,
    pendingAutoPdfInspectionId,
    resetInspectionForm,
  ]);

  const teacherName = profileById.get(form.teacherId)?.full_name ?? "เลือกครูผู้รับการนิเทศ";
  const progressWidth = `${Math.min(100, Math.max(0, total.percentage))}%`;
  const completedCount = teacherRows.filter((row) => row.latestInspection).length;
  const pendingCount = teacherRows.length - completedCount;
  const displaySemester = `${form.semester}/${form.academicYearBE}`;
  const selectedSummaryRecord = lastSavedSummary
    ? inspectionRecords.find((record) => record.id === lastSavedSummary.inspectionId) ?? null
    : null;
  const directorProfile =
    profiles.find((profile) => profile.role === "director") ??
    profiles.find((profile) => profile.role === "admin") ??
    currentProfile;

  return (
    <main className={styles.page}>
      {message && (
        <div className={`${styles.notice} ${messageError ? styles.noticeError : ""}`}>
          {message}
        </div>
      )}

      <header className={styles.header}>
        <div>
          <h1>นิเทศการสอน</h1>
          <p>แบบประเมินการจัดการเรียนรู้ในชั้นเรียน</p>
        </div>
        <div className={styles.autoSave}>
          <span />
          {firebaseConfigured ? "พร้อมบันทึก Firebase" : "ยังไม่พร้อม Firebase"}
        </div>
      </header>

      <nav className={styles.steps} aria-label="ขั้นตอนนิเทศการสอน">
        <button
          type="button"
          className={activeTab === "teachers" ? styles.stepActive : ""}
          onClick={() => setActiveTab("teachers")}
        >
          1 ข้อมูลทั่วไป
        </button>
        <button
          type="button"
          className={activeTab === "assessment" ? styles.stepActive : ""}
          onClick={() => setActiveTab("assessment")}
          disabled={!form.teacherId}
        >
          2 แบบประเมิน
        </button>
        <button
          type="button"
          className={activeTab === "summary" ? styles.stepActive : ""}
          onClick={() => setActiveTab("summary")}
          disabled={!lastSavedSummary && total.completedItems === 0}
        >
          3 สรุปผลและรายงาน
        </button>
      </nav>

      {activeTab === "teachers" && (
        <section className={styles.teacherPanel}>
          <div className={styles.listHeader}>
            <div>
              <h2>รายการนิเทศการสอน</h2>
              <p>ภาพรวมการนิเทศการสอนทั้งหมด</p>
            </div>
          </div>

          <div className={styles.listStats} aria-label="สรุปรายการนิเทศ">
            <span>ทั้งหมด {teacherRows.length} รายการ</span>
            <span>นิเทศเรียบร้อย {completedCount} รายการ</span>
            <span>ยังไม่ได้นิเทศ {pendingCount} รายการ</span>
          </div>

          <div className={styles.filterBar}>
            <label className={styles.searchBox}>
              <span>ค้นหา</span>
              <input
                value={teacherSearch}
                onChange={(event) => setTeacherSearch(event.target.value)}
                placeholder="ค้นหาชื่อ, นามสกุล, ตำแหน่ง..."
              />
            </label>
            <label>
              <span>ตำแหน่ง</span>
              <select
                value={positionFilter}
                onChange={(event) => setPositionFilter(event.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                {positions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>สถานะ</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                <option value="completed">นิเทศเรียบร้อยแล้ว</option>
                <option value="pending">ยังไม่ได้นิเทศ</option>
              </select>
            </label>
            <label>
              <span>ภาคเรียน</span>
              <select
                value={form.semester}
                onChange={(event) => updateForm("semester", event.target.value)}
              >
                <option value="1">1/{form.academicYearBE}</option>
                <option value="2">2/{form.academicYearBE}</option>
              </select>
            </label>
            <label>
              <span>ครั้งที่</span>
              <select
                value={roundFilter}
                onChange={(event) => setRoundFilter(event.target.value)}
              >
                {inspectionRounds.map((round) => (
                  <option key={round} value={round}>
                    ครั้งที่ {round}
                  </option>
                ))}
                {!inspectionRounds.includes("2") && <option value="2">ครั้งที่ 2</option>}
              </select>
            </label>
            <label>
              <span>กลุ่มสาระ</span>
              <select
                value={learningAreaFilter}
                onChange={(event) => setLearningAreaFilter(event.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                {LEARNING_AREAS.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.resetFilterButton}
              onClick={() => {
                setTeacherSearch("");
                setPositionFilter("all");
                setStatusFilter("all");
                setLearningAreaFilter("all");
                setRoundFilter("1");
              }}
            >
              รีเซ็ต
            </button>
          </div>

          <div className={styles.inspectionTableWrap}>
            <table className={styles.inspectionTable}>
              <thead>
                <tr>
                  <th>ลำดับที่</th>
                  <th>รูป</th>
                  <th>ชื่อ - นามสกุล</th>
                  <th>ตำแหน่ง</th>
                  <th>ครั้งที่</th>
                  <th>วันที่นิเทศ</th>
                  <th>คะแนน (100)</th>
                  <th>ผล</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {teacherRows.map(({ profile, latestInspection }, index) => {
                  const classLevels = profile.homeroomClassLevels ?? [];
                  const score = latestInspection?.totalEarnedScore;
                  const canStart = canManageInspections && !latestInspection;
                  const canOpenResult = Boolean(latestInspection);

                  return (
                    <tr key={profile.id}>
                      <td>{index + 1}</td>
                      <td>
                        <div className={styles.profilePhotoCell}>
                          {profileImageUrls[profile.id] ? (
                            <Image
                              src={profileImageUrls[profile.id]}
                              alt={profile.full_name}
                              width={42}
                              height={42}
                              unoptimized
                            />
                          ) : (
                            <span>{profile.full_name.trim().charAt(0) || "?"}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.teacherNameCell}>
                          <span>{profile.full_name}</span>
                          <small>
                            {classLevels.length > 0
                              ? `ครูประจำชั้น ${classLevels.join(", ")}`
                              : "ยังไม่พบข้อมูลครูประจำชั้น"}
                          </small>
                        </div>
                      </td>
                      <td>{profile.position || profile.role || "-"}</td>
                      <td>{roundFilter}</td>
                      <td>{formatThaiShortDate(latestInspection?.inspectionDate)}</td>
                      <td>{typeof score === "number" ? formatNumber(score) : "-"}</td>
                      <td>
                        {latestInspection ? (
                          <span className={styles.resultBadge}>
                            {latestInspection.qualityLevel}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            latestInspection ? styles.statusDone : styles.statusPending
                          }`}
                        >
                          {latestInspection ? "นิเทศเรียบร้อยแล้ว" : "ยังไม่ได้นิเทศ"}
                        </span>
                      </td>
                      <td>
                        {canOpenResult ? (
                          <div className={styles.tableActionGroup}>
                            <button
                              type="button"
                              className={`${styles.tableActionButton} ${styles.resultActionButton}`}
                              onClick={() => openInspectionResult(latestInspection!)}
                            >
                              ผลการนิเทศ
                            </button>
                            {latestInspection?.pdfReport?.driveUrl ? (
                              <a
                                className={styles.iconActionButton}
                                href={latestInspection.pdfReport.driveUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="เปิดไฟล์ PDF"
                                aria-label={`เปิดไฟล์ PDF รายงานผลการนิเทศของ ${profile.full_name}`}
                              >
                                PDF
                              </a>
                            ) : (
                              <button
                                type="button"
                                className={styles.iconActionButton}
                                disabled
                                title="ยังไม่มีไฟล์ PDF"
                              >
                                PDF
                              </button>
                            )}
                          </div>
                        ) : canStart ? (
                          <button
                            type="button"
                            className={styles.tableActionButton}
                            onClick={() => beginInspection(profile)}
                          >
                            เริ่มการนิเทศ
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={styles.tableActionButton}
                            disabled
                          >
                            รอการนิเทศ
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!loadingProfiles && teacherRows.length === 0 && (
              <div className={styles.emptySummary}>ไม่พบรายการตามตัวกรองที่เลือก</div>
            )}
          </div>
          <div className={styles.mobileInspectionList}>
            {teacherRows.map(({ profile, latestInspection }, index) => {
              const classLevels = profile.homeroomClassLevels ?? [];
              const score = latestInspection?.totalEarnedScore;
              const canStart = canManageInspections && !latestInspection;
              const canOpenResult = Boolean(latestInspection);

              return (
                <article key={profile.id} className={styles.mobileInspectionCard}>
                  <div className={styles.mobileInspectionTop}>
                    <span className={styles.mobileSequence}>{index + 1}</span>
                    <div className={styles.profilePhotoCell}>
                      {profileImageUrls[profile.id] ? (
                        <Image
                          src={profileImageUrls[profile.id]}
                          alt={profile.full_name}
                          width={36}
                          height={36}
                          unoptimized
                        />
                      ) : (
                        <span>{profile.full_name.trim().charAt(0) || "?"}</span>
                      )}
                    </div>
                    <div className={styles.mobileTeacherInfo}>
                      <strong>{profile.full_name}</strong>
                      <span>{profile.position || profile.role || "-"}</span>
                    </div>
                    {canOpenResult ? (
                      <div className={styles.tableActionGroup}>
                        <button
                          type="button"
                          className={`${styles.tableActionButton} ${styles.resultActionButton}`}
                          onClick={() => openInspectionResult(latestInspection!)}
                        >
                          ผลการนิเทศ
                        </button>
                        {latestInspection?.pdfReport?.driveUrl ? (
                          <a
                            className={styles.iconActionButton}
                            href={latestInspection.pdfReport.driveUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="เปิดไฟล์ PDF"
                            aria-label={`เปิดไฟล์ PDF รายงานผลการนิเทศของ ${profile.full_name}`}
                          >
                            PDF
                          </a>
                        ) : (
                          <button
                            type="button"
                            className={styles.iconActionButton}
                            disabled
                            title="ยังไม่มีไฟล์ PDF"
                          >
                            PDF
                          </button>
                        )}
                      </div>
                    ) : canStart ? (
                      <button
                        type="button"
                        className={styles.tableActionButton}
                        onClick={() => beginInspection(profile)}
                      >
                        เริ่มนิเทศ
                      </button>
                    ) : (
                      <button type="button" className={styles.tableActionButton} disabled>
                        รอ
                      </button>
                    )}
                  </div>
                  <div className={styles.mobileInspectionMeta}>
                    <span>ครั้งที่ {roundFilter}</span>
                    <span>{formatThaiShortDate(latestInspection?.inspectionDate)}</span>
                    <span>{typeof score === "number" ? `${formatNumber(score)} คะแนน` : "ยังไม่มีคะแนน"}</span>
                    <span>{latestInspection?.qualityLevel || "ยังไม่ได้นิเทศ"}</span>
                  </div>
                  <p>
                    {classLevels.length > 0
                      ? `ครูประจำชั้น ${classLevels.join(", ")}`
                      : "ยังไม่พบข้อมูลครูประจำชั้น"}
                  </p>
                </article>
              );
            })}
            {!loadingProfiles && teacherRows.length === 0 && (
              <div className={styles.emptySummary}>ไม่พบรายการตามตัวกรองที่เลือก</div>
            )}
          </div>
          <p className={styles.tableFootnote}>
            แสดง 1 ถึง {teacherRows.length} จาก {inspectableProfiles.length} รายการ • ภาคเรียน {displaySemester}
          </p>
        </section>
      )}

      {activeTab === "assessment" && (
      <div className={styles.grid} ref={reportRef}>
        <section className={styles.leftColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>ข้อมูลการนิเทศ</h2>
              <span>{loadingProfiles ? "กำลังโหลดรายชื่อ..." : `${profiles.length} คน`}</span>
            </div>

            <div className={styles.formGrid}>
              <label className={`${styles.fieldWide} ${styles.mobileHiddenField}`}>
                <span>ครูผู้รับการนิเทศ</span>
                <select
                  value={form.teacherId}
                  onChange={(event) => updateForm("teacherId", event.target.value)}
                >
                  <option value="" disabled>
                    เลือกครูจากแท็บข้อมูลทั่วไป
                  </option>
                  {inspectableProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                      {profile.position ? ` - ${profile.position}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className={styles.radioGroup}>
                <legend>ประเภทครู</legend>
                <label>
                  <input
                    type="radio"
                    checked={form.teacherType === "homeroom"}
                    onChange={() => updateForm("teacherType", "homeroom")}
                  />
                  ครูประจำชั้น
                </label>
                <label>
                  <input
                    type="radio"
                    checked={form.teacherType === "subject"}
                    onChange={() => updateForm("teacherType", "subject")}
                  />
                  ครูกลุ่มสาระ
                </label>
              </fieldset>

              <label>
                <span>กลุ่มสาระการเรียนรู้</span>
                <select
                  value={form.learningAreaName}
                  onChange={(event) => updateForm("learningAreaName", event.target.value)}
                >
                  {LEARNING_AREAS.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>รายวิชา / กิจกรรม</span>
                <input
                  value={form.subjectName}
                  onChange={(event) => updateForm("subjectName", event.target.value)}
                />
              </label>

              <label>
                <span>ชั้นที่สอนในวันนิเทศ</span>
                <select
                  value={form.classLevelName}
                  onChange={(event) => updateForm("classLevelName", event.target.value)}
                >
                  {CLASS_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>วันที่นิเทศ</span>
                <input
                  type="date"
                  value={form.inspectionDate}
                  onChange={(event) => updateForm("inspectionDate", event.target.value)}
                />
              </label>

              <label>
                <span>เวลาเริ่ม</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(event) => updateForm("startTime", event.target.value)}
                />
              </label>

              <label>
                <span>เวลาสิ้นสุด</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(event) => updateForm("endTime", event.target.value)}
                />
              </label>

              <label>
                <span>ผู้นิเทศ</span>
                <select
                  value={form.supervisorId}
                  onChange={(event) => updateForm("supervisorId", event.target.value)}
                >
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>ผู้นิเทศร่วม (ถ้ามี)</span>
                <select
                  value={form.coSupervisorId}
                  onChange={(event) => updateForm("coSupervisorId", event.target.value)}
                >
                  <option value="">ไม่มี</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>ปีการศึกษา</span>
                <input
                  value={form.academicYearBE}
                  onChange={(event) => updateForm("academicYearBE", event.target.value)}
                />
              </label>

              <label>
                <span>ภาคเรียน</span>
                <select
                  value={form.semester}
                  onChange={(event) => updateForm("semester", event.target.value)}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>

              <label>
                <span>ครั้งที่</span>
                <select
                  value={form.inspectionRound}
                  onChange={(event) => updateForm("inspectionRound", event.target.value)}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                </select>
              </label>

              <label className={styles.fieldWide}>
                <span>รูปแบบการจัดการเรียนรู้</span>
                <select
                  value={form.learningMethod}
                  onChange={(event) => updateForm("learningMethod", event.target.value)}
                >
                  {LEARNING_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className={styles.scoreHint}>
              เกณฑ์การให้คะแนน: 5 = ดีเยี่ยม, 4 = ดี, 3 = ปานกลาง, 2 = ควรพัฒนา, 1 = ต้องปรับปรุง
            </p>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>แบบประเมินการจัดการเรียนรู้</h2>
              <span>รวม 100 คะแนน</span>
            </div>

            <div className={styles.rubricList}>
              {sectionSummaries.map((section, index) => (
                <section
                  key={section.id}
                  className={`${styles.rubricSection} ${styles[section.accent]}`}
                >
                  <div className={styles.sectionTitle}>
                    <h3>
                      {index + 1}. {section.title}
                    </h3>
                    <span>
                      {formatNumber(section.earnedScore)} / {section.fullScore} คะแนน
                    </span>
                  </div>

                  {section.items.map((item) => (
                    <div key={item.id} className={styles.rubricRow}>
                      <p>
                        <span>{item.number}</span>
                        {item.title}
                      </p>
                      <div className={styles.scoreButtons}>
                        {[5, 4, 3, 2, 1].map((score) => (
                          <button
                            key={score}
                            type="button"
                            className={
                              ratings[item.id] === score ? styles.scoreActive : ""
                            }
                            onClick={() =>
                              toggleRating(item.id, score as 1 | 2 | 3 | 4 | 5)
                            }
                          >
                            {score}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <div className={styles.sectionMeta}>
                    <span>
                      ตอบแล้ว {section.completedItems}/{section.totalItems} ข้อ
                    </span>
                    <span>เฉลี่ย {formatNumber(section.averageRating)}</span>
                    <span>{formatNumber(section.percentage)}%</span>
                  </div>
                </section>
              ))}
            </div>
          </section>
        </section>

        <aside className={styles.rightColumn}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>สรุปผลการประเมิน</h2>
              <span>{total.completedItems}/{total.totalItems} ข้อ</span>
            </div>
            <table className={styles.summaryTable}>
              <thead>
                <tr>
                  <th>ด้านการประเมิน</th>
                  <th>คะแนน</th>
                  <th>เฉลี่ย</th>
                  <th>ระดับ</th>
                </tr>
              </thead>
              <tbody>
                {sectionSummaries.map((section, index) => (
                  <tr key={section.id}>
                    <td>{index + 1}. {section.title}</td>
                    <td>{formatNumber(section.earnedScore)}</td>
                    <td>{formatNumber(section.averageRating)}</td>
                    <td>{section.qualityLevel}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className={styles.totalCard}>
              <div>
                <span>คะแนนรวม</span>
                <strong>{formatNumber(total.earnedScore)} / 100</strong>
              </div>
              <div>
                <span>ค่าเฉลี่ยรวม</span>
                <strong>{formatNumber(total.averageRating)}</strong>
              </div>
              <div>
                <span>ระดับคุณภาพ</span>
                <strong>{total.qualityLevel}</strong>
              </div>
              <div className={styles.progressTrack}>
                <span style={{ width: progressWidth }} />
              </div>
              <p>{formatNumber(total.percentage)}%</p>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>บันทึกผลการนิเทศ</h2>
              <span>{teacherName}</span>
            </div>
            <label className={styles.noteField}>
              <span>จุดเด่นที่พบ</span>
              <textarea
                value={form.strengths}
                onChange={(event) => updateForm("strengths", event.target.value)}
              />
            </label>
            <label className={styles.noteField}>
              <span>สิ่งที่ควรพัฒนา</span>
              <textarea
                value={form.improvements}
                onChange={(event) => updateForm("improvements", event.target.value)}
              />
            </label>
            <label className={styles.noteField}>
              <span>ข้อเสนอแนะและแนวทางพัฒนา</span>
              <textarea
                value={form.recommendations}
                onChange={(event) => updateForm("recommendations", event.target.value)}
              />
            </label>
            <label className={styles.noteField}>
              <span>ข้อตกลงในการพัฒนาร่วมกัน</span>
              <textarea
                value={form.developmentAgreement}
                onChange={(event) =>
                  updateForm("developmentAgreement", event.target.value)
                }
              />
            </label>
            <label className={styles.noteField}>
              <span>วันที่ติดตามผลครั้งถัดไป</span>
              <input
                type="date"
                value={form.followUpDate}
                onChange={(event) => updateForm("followUpDate", event.target.value)}
              />
            </label>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h2>หลักฐานประกอบการนิเทศ</h2>
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= 4}
              >
                เพิ่มรูป
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              multiple
              className={styles.fileInput}
              onChange={handleImageSelect}
            />
            <div className={styles.imageGrid}>
              {images.map((image) => (
                <figure key={image.slot} className={styles.imageCard}>
                  <Image
                    src={image.previewUrl}
                    alt={image.caption}
                    width={480}
                    height={270}
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(image.slot)}
                    aria-label={`ลบ ${image.caption}`}
                  >
                    ×
                  </button>
                  <figcaption>
                    <strong>ภาพที่ {image.slot}</strong>
                    <span>{image.caption}</span>
                    <small>{fileSizeLabel(image.size)}</small>
                    {image.driveUrl && (
                      <a href={image.driveUrl} target="_blank" rel="noreferrer">
                        เปิดใน Drive
                      </a>
                    )}
                  </figcaption>
                </figure>
              ))}
              {images.length === 0 && (
                <p className={styles.emptyEvidence}>
                  เลือกรูปหลักฐานได้สูงสุด 4 รูป และระบบจะเก็บเฉพาะ metadata ใน Firestore
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
      )}

      {activeTab === "summary" && (
        <section className={styles.summaryPanel}>
          <div className={styles.cardHeader}>
            <div>
              <h2>สรุปผลและรายงาน</h2>
              <p>
                {lastSavedSummary
                  ? `ผลการนิเทศล่าสุดของ ${lastSavedSummary.teacherName}`
                  : "ยังไม่มีผลการนิเทศที่บันทึกในรอบนี้"}
              </p>
            </div>
            {canManageInspections && selectedSummaryRecord && (
              <button
                type="button"
                className={styles.smallButton}
                onClick={() => editInspection(selectedSummaryRecord)}
              >
                แก้ไขผลการนิเทศ
              </button>
            )}
          </div>

          {lastSavedSummary ? (
            <div className={styles.printReport} ref={reportRef}>
              <header className={styles.reportTitle}>
                <h2>รายงานผลการนิเทศการสอน</h2>
                <p>
                  ครั้งที่ {lastSavedSummary.inspectionRound} • ภาคเรียน{" "}
                  {lastSavedSummary.semester}/{lastSavedSummary.academicYearBE}
                </p>
              </header>

              <section className={styles.reportSection}>
                <h3>ข้อมูลครูผู้รับการนิเทศ</h3>
                <div className={styles.reportInfoGrid}>
                  <p><span>ชื่อ - นามสกุล</span>{lastSavedSummary.teacherName}</p>
                  <p><span>ตำแหน่ง</span>{lastSavedSummary.teacherPosition || "ครู"}</p>
                  <p><span>ชั้นที่สอน</span>{lastSavedSummary.classLevelName}</p>
                  <p><span>กลุ่มสาระ</span>{lastSavedSummary.learningAreaName}</p>
                  <p><span>รายวิชา / กิจกรรม</span>{lastSavedSummary.subjectName}</p>
                  <p><span>วันที่นิเทศ</span>{formatThaiShortDate(lastSavedSummary.inspectionDate)}</p>
                </div>
              </section>

              <section className={styles.reportSection}>
                <h3>คะแนนแต่ละด้าน</h3>
                <table className={styles.reportScoreTable}>
                  <thead>
                    <tr>
                      <th>ด้านการประเมิน</th>
                      <th>คะแนน</th>
                      <th>ร้อยละ</th>
                      <th>ระดับคุณภาพ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastSavedSummary.sections.map((section, index) => (
                      <tr key={section.id}>
                        <td>{index + 1}. {section.title}</td>
                        <td>{formatNumber(section.earnedScore)} / {section.fullScore}</td>
                        <td>{formatNumber(section.percentage)}</td>
                        <td>{section.qualityLevel}</td>
                      </tr>
                    ))}
                    <tr className={styles.reportTotalRow}>
                      <td>รวมทั้งหมด</td>
                      <td>{formatNumber(lastSavedSummary.total.earnedScore)} / 100</td>
                      <td>{formatNumber(lastSavedSummary.total.percentage)}</td>
                      <td>{lastSavedSummary.total.qualityLevel}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className={styles.reportSection}>
                <h3>บันทึกผลการนิเทศ</h3>
                <dl className={styles.reportNotes}>
                  <dt>จุดเด่นที่พบ</dt>
                  <dd>{lastSavedSummary.notes.strengths || "-"}</dd>
                  <dt>สิ่งที่ควรพัฒนา</dt>
                  <dd>{lastSavedSummary.notes.improvements || "-"}</dd>
                  <dt>ข้อเสนอแนะและแนวทางพัฒนา</dt>
                  <dd>{lastSavedSummary.notes.recommendations || "-"}</dd>
                  <dt>ข้อตกลงในการพัฒนาร่วมกัน</dt>
                  <dd>{lastSavedSummary.notes.developmentAgreement || "-"}</dd>
                  <dt>วันที่ติดตามผลครั้งถัดไป</dt>
                  <dd>{formatThaiShortDate(lastSavedSummary.notes.followUpDate)}</dd>
                </dl>
              </section>

              <section className={styles.signatureGrid}>
                <div>
                  <p>ลงชื่อ........................................................ ผู้รับการนิเทศ</p>
                  <span>({lastSavedSummary.teacherName})</span>
                  <small>{lastSavedSummary.teacherPosition || "ครู"}</small>
                </div>
                <div>
                  <p>ลงชื่อ........................................................ ผู้นิเทศ</p>
                  <span>({directorProfile?.full_name || "........................................................"})</span>
                  <small>ผู้อำนวยการโรงเรียนวัดไผ่มุ้ง</small>
                </div>
              </section>
            </div>
          ) : (
            <div className={styles.emptySummary}>
              กรุณาเลือกครูในแท็บข้อมูลทั่วไปและบันทึกผลการนิเทศก่อน
            </div>
          )}
        </section>
      )}

      {activeTab === "assessment" && (
      <footer
        className={`${styles.actionBar} ${
          canManageInspections && form.inspectionId ? styles.actionBarWithDelete : ""
        }`}
      >
        {canManageInspections && form.inspectionId && (
          <button
            type="button"
            className={styles.dangerAction}
            onClick={() => void handleDeleteInspection()}
            disabled={saving}
          >
            ลบการนิเทศครั้งนี้
          </button>
        )}
        <button
          type="button"
          className={styles.primaryAction}
          onClick={() => void handleSave("completed")}
          disabled={saving}
        >
          บันทึกผลการนิเทศ
        </button>
      </footer>
      )}
    </main>
  );
}
