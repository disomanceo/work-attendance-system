"use client";

import { type DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import {
  createSchoolLibraryDocument,
  deleteSchoolLibraryDocument,
  isSchoolLibraryFirebaseConfigured,
  listSchoolLibraryDocuments,
  type NewSchoolLibraryDocument,
  updateSchoolLibraryDocument,
} from "@/lib/school-library/firestore";
import {
  DEFAULT_SCHOOL_LIBRARY_CATEGORY,
  SCHOOL_LIBRARY_CATEGORIES,
  type SchoolLibraryCategory,
} from "@/lib/school-library/categories";
import { createClient } from "@/lib/supabase/client";
import styles from "./school-library.module.css";

type LibraryCategory = SchoolLibraryCategory;

type LibraryStatus = "reviewed" | "approved" | "draft" | "ready";

type LibraryFileType = "PDF" | "DOCX" | "DRIVE";

type LibraryDocumentFile = {
  driveUrl: string;
  driveFileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  fileType: LibraryFileType;
};

type DriveLinkDraft = {
  url: string;
  name: string;
};

type LibraryDocument = {
  id: string;
  title: string;
  category: LibraryCategory;
  subcategory: string;
  owner: string;
  gradeLevel: string;
  subject: string;
  academicYear: string;
  fileType: LibraryFileType;
  status: LibraryStatus;
  updatedAt: string;
  keywords: string[];
  driveUrl: string;
  driveFileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  files?: LibraryDocumentFile[];
  uploadedByUserId?: string;
  uploadedByName?: string;
};

type DraftDocument = {
  title: string;
  category: LibraryCategory;
  subcategory: string;
  gradeLevel: string;
  subject: string;
  academicYear: string;
  keywords: string;
};

type CurrentProfile = {
  id: string;
  full_name: string | null;
  role: string | null;
};

type PersonnelOption = {
  id: string;
  full_name: string;
  position?: string | null;
  role?: string | null;
  account_status?: string | null;
};

type SearchStat = {
  term: string;
  count: number;
  lastUsedAt: number;
};

const DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/u/0/folders/1oqa3etlgk5LtqDLRY2SJn1mDinPL0_lJ";
const SEARCH_HISTORY_KEY = "school-library-search-history";
const MAX_UPLOAD_FILE_SIZE = 4 * 1024 * 1024;

const CATEGORIES = SCHOOL_LIBRARY_CATEGORIES;

const INITIAL_DOCUMENTS: LibraryDocument[] = [
  {
    id: "doc-1",
    title: "แผนการจัดการเรียนรู้ วิชาคณิตศาสตร์ ป.4",
    category: "learning-management",
    subcategory: "แผนการจัดการเรียนรู้",
    owner: "ครูมนัสศรี",
    gradeLevel: "ป.4",
    subject: "คณิตศาสตร์",
    academicYear: "2569",
    fileType: "PDF",
    status: "reviewed",
    updatedAt: "วันนี้",
    keywords: ["Active Learning", "คณิตศาสตร์", "ป.4"],
    driveUrl: DRIVE_FOLDER_URL,
  },
  {
    id: "doc-2",
    title: "วิจัยการพัฒนาทักษะการอ่านออกเขียนได้",
    category: "innovation-works",
    subcategory: "วิจัยในชั้นเรียน",
    owner: "ครูบุษรา",
    gradeLevel: "ป.3",
    subject: "ภาษาไทย",
    academicYear: "2569",
    fileType: "DOCX",
    status: "approved",
    updatedAt: "เมื่อวาน",
    keywords: ["อ่านออกเขียนได้", "ภาษาไทย", "วิจัย"],
    driveUrl: DRIVE_FOLDER_URL,
  },
  {
    id: "doc-3",
    title: "โครงการส่งเสริมสุขภาพนักเรียน",
    category: "administration-planning",
    subcategory: "โครงการ",
    owner: "ครูณัฐกฤตา",
    gradeLevel: "ทั้งโรงเรียน",
    subject: "สุขศึกษา",
    academicYear: "2569",
    fileType: "DRIVE",
    status: "ready",
    updatedAt: "12 ก.ค. 2569",
    keywords: ["สุขภาพ", "โครงการ", "นักเรียน"],
    driveUrl: DRIVE_FOLDER_URL,
  },
];

const EMPTY_DRAFT: DraftDocument = {
  title: "",
  category: DEFAULT_SCHOOL_LIBRARY_CATEGORY,
  subcategory: "",
  gradeLevel: "",
  subject: "",
  academicYear: "2569",
  keywords: "",
};

function statusLabel(_status: LibraryStatus) {
  return "พร้อมใช้";
}

function fileExtensionOf(name = "") {
  const cleanName = name.split(/[?#]/)[0] || "";
  const dotIndex = cleanName.lastIndexOf(".");
  return dotIndex >= 0 ? cleanName.slice(dotIndex + 1).trim().toLowerCase() : "";
}

function fileKindOf(input: {
  fileName?: string;
  mimeType?: string;
  fileType?: LibraryDocument["fileType"];
}) {
  const extension = fileExtensionOf(input.fileName);
  const mimeType = (input.mimeType || "").toLowerCase();

  if (extension === "pdf" || mimeType === "application/pdf" || input.fileType === "PDF") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "tif", "tiff", "svg", "heic", "heif", "avif", "ico"].includes(extension) || mimeType.startsWith("image/")) return "image";
  if (["doc", "docx", "docm", "dot", "dotx", "rtf", "odt", "pages"].includes(extension) || mimeType.includes("word") || mimeType.includes("officedocument.wordprocessingml")) return "word";
  if (["xls", "xlsx", "xlsm", "xlsb", "csv", "tsv", "ods", "numbers"].includes(extension) || mimeType.includes("excel") || mimeType.includes("spreadsheet") || mimeType.includes("csv")) return "excel";
  if (["ppt", "pptx", "pptm", "pps", "ppsx", "odp", "key"].includes(extension) || mimeType.includes("powerpoint") || mimeType.includes("presentation")) return "powerpoint";
  if (["mp4", "mov", "avi", "mkv", "webm", "wmv", "m4v", "mpeg", "mpg", "3gp"].includes(extension) || mimeType.startsWith("video/")) return "video";
  if (["mp3", "wav", "m4a", "aac", "ogg", "flac", "wma", "aiff"].includes(extension) || mimeType.startsWith("audio/")) return "audio";
  if (["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso"].includes(extension) || mimeType.includes("zip") || mimeType.includes("compressed")) return "archive";
  if (["txt", "md", "json", "xml", "html", "htm", "css", "js", "ts", "yaml", "yml", "log"].includes(extension) || mimeType.startsWith("text/")) return "text";

  return "file";
}

function fileIconLabel(kind: ReturnType<typeof fileKindOf>, fileName?: string) {
  const extension = fileExtensionOf(fileName).toUpperCase();
  if (kind === "image") return extension && extension.length <= 4 ? extension : "IMG";
  if (kind === "word") return "DOC";
  if (kind === "excel") return "XLS";
  if (kind === "powerpoint") return "PPT";
  if (kind === "archive") return "ZIP";
  if (kind === "text") return "TXT";
  if (kind === "file") return extension && extension.length <= 4 ? extension : "FILE";
  return kind.toUpperCase();
}

function inferFileTypeFromFile(file: File | null): LibraryDocument["fileType"] {
  if (!file) return "DRIVE";

  const extension = file.name.split(".").pop()?.trim().toLowerCase() ?? "";

  if (extension === "pdf" || file.type === "application/pdf") return "PDF";

  if (
    ["doc", "docx", "docm", "dot", "dotx", "rtf"].includes(extension) ||
    file.type.includes("word") ||
    file.type.includes("officedocument.wordprocessingml")
  ) {
    return "DOCX";
  }

  return "DRIVE";
}

function selectedFileTypeLabel(files: File[]) {
  if (files.length === 0) return "FILE";

  const types = Array.from(
    new Set(
      files.map((file) =>
        fileIconLabel(
          fileKindOf({
            fileName: file.name,
            mimeType: file.type,
            fileType: inferFileTypeFromFile(file),
          }),
          file.name,
        ),
      ),
    ),
  );
  return types.length === 1 ? types[0] : "หลายประเภท";
}

function formatFileSize(size: number) {
  if (size >= 1024 * 1024 * 1024) return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} bytes`;
}

type ApiResultBase = {
  ok?: boolean;
  message?: string;
};

async function readApiResult<T extends ApiResultBase>(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await response.json().catch(() => ({
      ok: false,
      message: "ข้อมูลตอบกลับจากเซิร์ฟเวอร์ไม่ถูกต้อง",
    }))) as T;
  }

  const text = (await response.text().catch(() => "")).trim();
  const message = /request entity too large/i.test(text)
    ? `ไฟล์ใหญ่เกินกว่าระบบรับผ่านหน้าเว็บได้ กรุณาเลือกไฟล์ไม่เกิน ${formatFileSize(
        MAX_UPLOAD_FILE_SIZE,
      )}`
    : text.slice(0, 220) || `เซิร์ฟเวอร์ตอบกลับไม่สำเร็จ (${response.status})`;

  return { ok: false, message } as T;
}

function documentFileCount(document: LibraryDocument) {
  return documentFilesOf(document).length;
}

function documentFileSizeLabel(document: LibraryDocument) {
  const files = documentFilesOf(document);
  const count = files.length || 1;
  const totalSize = files.reduce((total, file) => total + (file.fileSize || 0), 0);
  const size = totalSize > 0 ? formatFileSize(totalSize) : "-";
  return `${count} ไฟล์ • ${size}`;
}

function documentInputWithFiles(
  document: LibraryDocument,
  files: LibraryDocumentFile[],
): NewSchoolLibraryDocument & { updatedAt: string } {
  const primaryFile = files[0];
  const totalFileSize = files.reduce((total, file) => total + (file.fileSize || 0), 0);

  return {
    title: document.title,
    category: document.category,
    subcategory: document.subcategory,
    owner: document.owner,
    gradeLevel: document.gradeLevel,
    subject: document.subject,
    academicYear: document.academicYear,
    fileType: primaryFile?.fileType || "DRIVE",
    status: document.status,
    updatedAt: "วันนี้",
    keywords: document.keywords,
    driveUrl: primaryFile?.driveUrl || DRIVE_FOLDER_URL,
    driveFileId: primaryFile?.driveFileId || "",
    fileName:
      files.length === 1
        ? primaryFile?.fileName || document.fileName || document.title
        : `${files.length} ไฟล์ในชุดเอกสาร`,
    mimeType: primaryFile?.mimeType || "",
    fileSize: totalFileSize || undefined,
    files,
    uploadedByUserId: document.uploadedByUserId,
    uploadedByName: document.uploadedByName,
  };
}

function fileIdentity(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function documentFilesOf(document: LibraryDocument): LibraryDocumentFile[] {
  if (document.files?.length) return document.files;

  if (!document.fileName && !document.driveUrl && !document.driveFileId) return [];

  return [
    {
      driveUrl: document.driveUrl,
      driveFileId: document.driveFileId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      fileType: document.fileType,
    },
  ];
}

function childFileMatchesQuery(file: LibraryDocumentFile, normalizedQuery: string) {
  if (!normalizedQuery) return false;

  return [
    file.fileName,
    file.mimeType,
    file.fileType,
    file.driveFileId,
    file.driveUrl,
    file.fileSize ? formatFileSize(file.fileSize) : "",
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function primaryDocumentFile(document: LibraryDocument) {
  return documentFilesOf(document)[0];
}

function driveFileIdOf(file: Pick<LibraryDocumentFile, "driveFileId" | "driveUrl">) {
  const directId = file.driveFileId?.trim();
  if (directId) return directId;

  const url = file.driveUrl || "";
  const filePathMatch = url.match(/\/file\/d\/([^/?#]+)/);
  if (filePathMatch?.[1]) return decodeURIComponent(filePathMatch[1]);

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("id")?.trim() || "";
  } catch {
    return "";
  }
}

function driveFileIdsOf(document: LibraryDocument) {
  return documentFilesOf(document)
    .map((file) => driveFileIdOf(file))
    .filter(Boolean);
}

function shouldOpenInBrowser(document: LibraryDocument) {
  const file = primaryDocumentFile(document);
  return shouldOpenDocumentFileInBrowser(
    file || {
      driveUrl: document.driveUrl,
      driveFileId: document.driveFileId,
      fileName: document.fileName,
      mimeType: document.mimeType,
      fileSize: document.fileSize,
      fileType: document.fileType,
    },
  );
}

function shouldOpenDocumentFileInBrowser(file: LibraryDocumentFile) {
  const mimeType = (file.mimeType || "").toLowerCase();
  return file.fileType === "PDF" || mimeType === "application/pdf" || mimeType.startsWith("image/");
}

function shouldOpenFileInBrowser(file: File) {
  return file.type === "application/pdf" || file.type.startsWith("image/");
}

function documentAccessUrl(document: LibraryDocument) {
  const file = primaryDocumentFile(document);
  if (file) return documentFileAccessUrl(file);

  const fallbackFile: LibraryDocumentFile = {
    driveUrl: document.driveUrl,
    driveFileId: document.driveFileId,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    fileType: document.fileType,
  };
  return documentFileAccessUrl(fallbackFile);
}

function documentFileAccessUrl(file: LibraryDocumentFile) {
  const driveUrl = file.driveUrl || DRIVE_FOLDER_URL;
  const fileId = driveFileIdOf(file);
  if (driveUrl.startsWith("blob:")) return driveUrl;

  if (shouldOpenDocumentFileInBrowser(file)) {
    return fileId
      ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`
      : driveUrl;
  }

  return fileId
    ? `/api/school-library/files/${encodeURIComponent(fileId)}/download?name=${encodeURIComponent(
        file.fileName || "school-library-file",
      )}&mime=${encodeURIComponent(file.mimeType || "")}`
    : driveUrl;
}

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 60);
}

function titleFromFileName(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  return withoutExtension.trim().replace(/\s+/g, " ").slice(0, 120) || name.slice(0, 120);
}

function fileNameFromDriveUrl(value: string) {
  try {
    const parsed = new URL(value);
    const pathName = decodeURIComponent(
      parsed.pathname.split("/").filter(Boolean).pop() || "",
    );
    return pathName && !["view", "edit", "preview"].includes(pathName)
      ? pathName.slice(0, 120)
      : "Google Drive file";
  } catch {
    return "Google Drive file";
  }
}

function normalizeDriveLinkDrafts(items: DriveLinkDraft[]) {
  return items
    .map((item) => ({
      url: item.url.trim(),
      name: item.name.trim(),
    }))
    .filter((item) => item.url);
}

function readSearchHistory(): SearchStat[] {
  if (typeof window === "undefined") return [];

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        term: normalizeSearchTerm(String(item?.term || "")),
        count: Number(item?.count) || 0,
        lastUsedAt: Number(item?.lastUsedAt) || 0,
      }))
      .filter((item) => item.term && item.count > 0);
  } catch {
    return [];
  }
}

function sortSearchHistory(items: SearchStat[]) {
  return [...items].sort(
    (left, right) =>
      right.count - left.count || right.lastUsedAt - left.lastUsedAt,
  );
}

function currentAcademicYear() {
  return String(new Date().getFullYear() + 543);
}

function profileName(profile: CurrentProfile | null) {
  return profile?.full_name?.trim() || "ผู้ใช้งานปัจจุบัน";
}

function canDeleteDocument(
  document: LibraryDocument,
  profile: CurrentProfile | null,
  currentUserId: string,
  sampleMode = false,
) {
  if (sampleMode) return true;
  if (profile?.role === "director") return true;
  return !!document.uploadedByUserId && !!currentUserId && document.uploadedByUserId === currentUserId;
}

export default function SchoolLibraryPage() {
  const supabase = useMemo(() => createClient(), []);
  const firebaseConfigured = isSchoolLibraryFirebaseConfigured();
  const [documents, setDocuments] = useState(INITIAL_DOCUMENTS);
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<LibraryCategory | "all">("all");
  const [academicYear, setAcademicYear] = useState(currentAcademicYear);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<DraftDocument>(EMPTY_DRAFT);
  const [editingDocument, setEditingDocument] = useState<LibraryDocument | null>(null);
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [driveLinks, setDriveLinks] = useState<DriveLinkDraft[]>([]);
  const [formError, setFormError] = useState("");
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [currentUserId, setCurrentUserId] = useState("");
  const [personnelOptions, setPersonnelOptions] = useState<PersonnelOption[]>([]);
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const [searchHistory, setSearchHistory] = useState<SearchStat[]>([]);
  const [databaseMessage, setDatabaseMessage] = useState(
    firebaseConfigured
      ? "กำลังโหลดข้อมูลจาก Firebase..."
      : "ยังไม่ได้ตั้งค่า Firebase ใน .env.local ตอนนี้จึงใช้ข้อมูลตัวอย่างก่อน",
  );
  const [loadingDocuments, setLoadingDocuments] = useState(firebaseConfigured);
  const [savingDocument, setSavingDocument] = useState(false);
  const [dropZoneActive, setDropZoneActive] = useState(false);
  const [pendingDropFiles, setPendingDropFiles] = useState<File[]>([]);
  const [dropTargetQuery, setDropTargetQuery] = useState("");
  const [moveTargetQuery, setMoveTargetQuery] = useState("");
  const [draggedDocumentId, setDraggedDocumentId] = useState("");
  const [dragOverTargetId, setDragOverTargetId] = useState("");

  useEffect(() => {
    setSearchHistory(sortSearchHistory(readSearchHistory()).slice(0, 8));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (!userId) return;
      if (!cancelled) setCurrentUserId(userId);

      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", userId)
        .maybeSingle();

      if (!cancelled && data) {
        setCurrentProfile(data as CurrentProfile);
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadPersonnelOptions(accessToken?: string) {
      if (!accessToken) return;

      const response = await fetch("/api/school-library/profiles", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await readApiResult<{
        ok?: boolean;
        profiles?: PersonnelOption[];
        message?: string;
      }>(response);

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดรายชื่อครูและบุคลากรไม่สำเร็จ");
      }

      if (cancelled || !result.profiles) return;

      setPersonnelOptions(
        result.profiles
          .map((item) => ({
            id: String(item.id || ""),
            full_name: String(item.full_name || "").trim(),
            position: item.position || null,
            role: item.role || null,
            account_status: item.account_status || null,
          }))
          .filter((item) => item.id && item.full_name),
      );
    }

    async function loadFromCurrentSession() {
      const { data: sessionData } = await supabase.auth.getSession();
      await loadPersonnelOptions(sessionData.session?.access_token);
    }

    void loadFromCurrentSession().catch((error) => {
      console.error("Load school library personnel options error:", error);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadPersonnelOptions(session?.access_token).catch((error) => {
        console.error("Reload school library personnel options error:", error);
      });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      if (!firebaseConfigured) return;

      setLoadingDocuments(true);
      setDatabaseMessage("กำลังโหลดข้อมูลจาก Firebase...");

      try {
        const remoteDocuments = await listSchoolLibraryDocuments();
        if (cancelled) return;

        if (remoteDocuments.length > 0) {
          setDocuments(remoteDocuments);
          setDatabaseMessage("เชื่อมต่อ Firebase แล้ว");
        } else {
          setDatabaseMessage(
            "เชื่อมต่อ Firebase แล้ว แต่ยังไม่มีเอกสารใน collection จึงแสดงข้อมูลตัวอย่างก่อน",
          );
        }
      } catch (error) {
        console.error("Load school library documents error:", error);
        if (!cancelled) {
          setDatabaseMessage(
            "ยังโหลดข้อมูลจาก Firebase ไม่สำเร็จ กรุณาตรวจ config และ Firestore rules",
          );
        }
      } finally {
        if (!cancelled) setLoadingDocuments(false);
      }
    }

    void loadDocuments();

    return () => {
      cancelled = true;
    };
  }, [firebaseConfigured]);

  const owners = useMemo(
    () => {
      const names = [
        ...personnelOptions.map((person) => person.full_name),
        ...documents.map((document) => document.owner),
      ];

      return Array.from(new Set(names.filter(Boolean))).sort((left, right) =>
        left.localeCompare(right, "th"),
      );
    },
    [documents, personnelOptions],
  );

  const selectedFilesTotalSize = useMemo(
    () => selectedFiles.reduce((total, file) => total + file.size, 0),
    [selectedFiles],
  );

  const categoryStats = useMemo(() => {
    return CATEGORIES.reduce(
      (stats, category) => {
        const categoryDocuments = documents.filter(
          (document) => document.category === category.id,
        );

        stats[category.id] = {
          documentCount: categoryDocuments.length,
          fileCount: categoryDocuments.reduce(
            (total, document) => total + (documentFileCount(document) || 1),
            0,
          ),
          totalSize: categoryDocuments.reduce(
            (total, document) => total + (document.fileSize || 0),
            0,
          ),
        };

        return stats;
      },
      {} as Record<
        LibraryCategory,
        { documentCount: number; fileCount: number; totalSize: number }
      >,
    );
  }, [documents]);

  const academicYears = useMemo(
    () => {
      const years = Array.from(
        new Set(documents.map((document) => document.academicYear).filter(Boolean)),
      ).sort((a, b) => b.localeCompare(a, "th"));

      return years.length > 0 ? years : [currentAcademicYear()];
    },
    [documents],
  );

  useEffect(() => {
    if (academicYear !== "all" && !academicYears.includes(academicYear)) {
      setAcademicYear(academicYears[0] || currentAcademicYear());
    }
  }, [academicYear, academicYears]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return documents.filter((document) => {
      const matchesCategory =
        selectedCategory === "all" || document.category === selectedCategory;
      const matchesYear = academicYear === "all" || document.academicYear === academicYear;
      const matchesOwner = ownerFilter === "all" || document.owner === ownerFilter;
      const searchable = [
        document.title,
        document.fileName,
        ...documentFilesOf(document).flatMap((file) => [
          file.fileName,
          file.mimeType,
          file.fileSize ? formatFileSize(file.fileSize) : "",
        ]),
        document.subcategory,
        document.owner,
        document.uploadedByName,
        document.gradeLevel,
        document.subject,
        document.academicYear,
        document.fileType,
        statusLabel(document.status),
        document.driveFileId,
        document.driveUrl,
        document.mimeType,
        document.fileSize ? formatFileSize(document.fileSize) : "",
        ...document.keywords,
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesCategory &&
        matchesYear &&
        matchesOwner &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });
  }, [academicYear, documents, ownerFilter, query, selectedCategory]);

  const popularKeywords = useMemo(
    () => sortSearchHistory(searchHistory).slice(0, 6),
    [searchHistory],
  );
  const latestDocuments = useMemo(
    () => filteredDocuments.slice(0, 10),
    [filteredDocuments],
  );

  useEffect(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return;

    const matchingSetIds = latestDocuments
      .filter((document) => {
        const files = documentFilesOf(document);
        return files.length > 1 && files.some((file) => childFileMatchesQuery(file, normalizedQuery));
      })
      .map((document) => document.id);

    if (matchingSetIds.length === 0) return;

    setExpandedDocumentIds((current) => {
      const missingIds = matchingSetIds.filter((id) => !current.includes(id));
      return missingIds.length > 0 ? [...current, ...missingIds] : current;
    });
  }, [latestDocuments, query]);

  const dropTargetDocuments = useMemo(() => {
    const normalizedQuery = dropTargetQuery.trim().toLowerCase();

    return documents
      .filter((document) => {
        if (!normalizedQuery) return true;

        return [
          document.title,
          document.fileName,
          document.owner,
          document.subcategory,
          document.academicYear,
          ...document.keywords,
          ...documentFilesOf(document).map((file) => file.fileName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [documents, dropTargetQuery]);

  const moveTargetDocuments = useMemo(() => {
    const normalizedQuery = moveTargetQuery.trim().toLowerCase();

    return documents
      .filter((document) => {
        if (editingDocument?.id === document.id) return false;
        if (!normalizedQuery) return true;

        return [
          document.title,
          document.fileName,
          document.owner,
          document.subcategory,
          document.academicYear,
          ...document.keywords,
          ...documentFilesOf(document).map((file) => file.fileName),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [documents, editingDocument?.id, moveTargetQuery]);

  function rememberSearchTerm(value = query) {
    const term = normalizeSearchTerm(value);
    if (!term) return;

    const existing = readSearchHistory();
    const index = existing.findIndex(
      (item) => item.term.toLowerCase() === term.toLowerCase(),
    );
    const next =
      index >= 0
        ? existing.map((item, itemIndex) =>
            itemIndex === index
              ? { ...item, term, count: item.count + 1, lastUsedAt: Date.now() }
              : item,
          )
        : [{ term, count: 1, lastUsedAt: Date.now() }, ...existing];
    const sorted = sortSearchHistory(next).slice(0, 12);

    window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(sorted));
    setSearchHistory(sorted.slice(0, 8));
  }

  function resetFilters() {
    setQuery("");
    setSelectedCategory("all");
    setAcademicYear(academicYears[0] || currentAcademicYear());
    setOwnerFilter("all");
  }

  function updateDraft<Key extends keyof DraftDocument>(
    key: Key,
    value: DraftDocument[Key],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetDocumentForm() {
    setFormOpen(false);
    setDraft(EMPTY_DRAFT);
    setEditingDocument(null);
    setSelectedFiles([]);
    setDriveLinks([]);
    setFormError("");
    setMoveTargetQuery("");
  }

  function openCreateDocumentForm(initialFiles?: FileList | File[]) {
    const incomingFiles = Array.from(initialFiles || []);
    const validFiles = incomingFiles.filter((file) => file.size <= MAX_UPLOAD_FILE_SIZE);
    const rejectedFile = incomingFiles.find((file) => file.size > MAX_UPLOAD_FILE_SIZE);

    setDraft(
      validFiles[0]
        ? { ...EMPTY_DRAFT, title: titleFromFileName(validFiles[0].name) }
        : EMPTY_DRAFT,
    );
    setEditingDocument(null);
    setSelectedFiles(validFiles);
    setDriveLinks([]);
    setFormError(
      rejectedFile
        ? `ไฟล์ ${rejectedFile.name} ต้องมีขนาดไม่เกิน ${formatFileSize(MAX_UPLOAD_FILE_SIZE)}`
        : "",
    );
    setFormOpen(true);
  }

  function closeDropTargetPicker() {
    setPendingDropFiles([]);
    setDropTargetQuery("");
  }

  function openDroppedFilesAsNewDocument() {
    openCreateDocumentForm(pendingDropFiles);
    closeDropTargetPicker();
  }

  function openDroppedFilesForExistingDocument(document: LibraryDocument) {
    openEditDocumentForm(document, pendingDropFiles);
    closeDropTargetPicker();
  }

  function handleLibraryDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDropZoneActive(false);

    if (event.dataTransfer.files.length === 0) return;

    event.dataTransfer.dropEffect = "copy";
    setPendingDropFiles(Array.from(event.dataTransfer.files));
    setDropTargetQuery("");
  }

  function handleLibraryDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setDropZoneActive(true);
  }

  function handleLibraryDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setDropZoneActive(false);
  }

  function openEditDocumentForm(document: LibraryDocument, initialFiles?: FileList | File[]) {
    const incomingFiles = Array.from(initialFiles || []);
    const validFiles = incomingFiles.filter((file) => file.size <= MAX_UPLOAD_FILE_SIZE);
    const rejectedFile = incomingFiles.find((file) => file.size > MAX_UPLOAD_FILE_SIZE);

    setDraft({
      title: document.title,
      category: document.category,
      subcategory: document.subcategory,
      gradeLevel: document.gradeLevel,
      subject: document.subject,
      academicYear: document.academicYear,
      keywords: document.keywords.join(", "),
    });
    setEditingDocument(document);
    setSelectedFiles(validFiles);
    setDriveLinks([]);
    setFormError(
      rejectedFile
        ? `ไฟล์ ${rejectedFile.name} ต้องมีขนาดไม่เกิน ${formatFileSize(MAX_UPLOAD_FILE_SIZE)}`
        : "",
    );
    setFormOpen(true);
  }

  function toggleDocumentTree(documentId: string) {
    setExpandedDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  async function moveSingleFileDocumentToTarget(
    sourceDocument: LibraryDocument,
    targetDocument: LibraryDocument,
    options: { closeForm?: boolean; setModalError?: boolean } = {},
  ) {
    if (sourceDocument.id === targetDocument.id) return;

    const sourceFiles = documentFilesOf(sourceDocument);
    if (sourceFiles.length !== 1) {
      if (options.setModalError) {
        setFormError("ย้ายได้เฉพาะรายการไฟล์เดี่ยวก่อน หากเป็นชุดเอกสารให้ย้ายไฟล์ย่อยทีละรายการในเฟสถัดไป");
      } else {
        setDatabaseMessage("ย้ายได้เฉพาะรายการไฟล์เดี่ยวก่อน");
      }
      return;
    }

    if (!canDeleteDocument(sourceDocument, currentProfile, currentUserId, !firebaseConfigured)) {
      if (options.setModalError) {
        setFormError("ย้ายได้เฉพาะผู้ที่อัปโหลดไฟล์หรือ ผอ. เท่านั้น");
      } else {
        setDatabaseMessage("ย้ายได้เฉพาะผู้ที่อัปโหลดไฟล์หรือ ผอ. เท่านั้น");
      }
      return;
    }

    const confirmed = window.confirm(
      `ต้องการย้ายไฟล์ "${sourceDocument.title}" ไปไว้ใน "${targetDocument.title}" ใช่ไหม`,
    );
    if (!confirmed) return;

    setSavingDocument(true);
    setFormError("");
    setDatabaseMessage("กำลังย้ายไฟล์เข้าเอกสารเดิม...");

    try {
      const mergedFiles = [...documentFilesOf(targetDocument), ...sourceFiles];
      const updatedTargetInput = documentInputWithFiles(targetDocument, mergedFiles);
      const savedTarget = firebaseConfigured
        ? await updateSchoolLibraryDocument(targetDocument.id, updatedTargetInput)
        : { ...updatedTargetInput, id: targetDocument.id };

      if (firebaseConfigured) {
        await deleteSchoolLibraryDocument(sourceDocument.id);
      }

      setDocuments((current) =>
        current
          .filter((document) => document.id !== sourceDocument.id)
          .map((document) => (document.id === targetDocument.id ? savedTarget : document)),
      );
      setEditingDocument((current) => (current?.id === sourceDocument.id ? null : current));
      setExpandedDocumentIds((current) =>
        current.includes(targetDocument.id) ? current : [...current, targetDocument.id],
      );
      setDatabaseMessage("ย้ายไฟล์เข้าเอกสารเดิมเรียบร้อย");
      if (options.closeForm) resetDocumentForm();
    } catch (error) {
      console.error("Move school library document error:", error);
      const message = error instanceof Error ? error.message : "ย้ายไฟล์เข้าเอกสารเดิมไม่สำเร็จ";
      if (options.setModalError) {
        setFormError(message);
      } else {
        setDatabaseMessage(message);
      }
    } finally {
      setSavingDocument(false);
      setDraggedDocumentId("");
      setDragOverTargetId("");
    }
  }

  async function handleMoveEditingDocumentToTarget(targetDocument: LibraryDocument) {
    if (!editingDocument) return;
    await moveSingleFileDocumentToTarget(editingDocument, targetDocument, {
      closeForm: true,
      setModalError: true,
    });
  }

  function handleDocumentIconDragStart(event: DragEvent<HTMLElement>, document: LibraryDocument) {
    if (documentFilesOf(document).length !== 1) {
      event.preventDefault();
      return;
    }

    setDraggedDocumentId(document.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", document.id);
  }

  function handleDocumentDragEnd() {
    setDraggedDocumentId("");
    setDragOverTargetId("");
  }

  function handleDocumentSetDragOver(event: DragEvent<HTMLElement>, targetDocument: LibraryDocument) {
    if (!draggedDocumentId || draggedDocumentId === targetDocument.id) return;
    if (documentFilesOf(targetDocument).length <= 1) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTargetId(targetDocument.id);
  }

  function handleDocumentSetDragLeave(event: DragEvent<HTMLElement>, targetDocument: LibraryDocument) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    if (dragOverTargetId === targetDocument.id) setDragOverTargetId("");
  }

  async function handleDocumentSetDrop(event: DragEvent<HTMLElement>, targetDocument: LibraryDocument) {
    event.preventDefault();
    event.stopPropagation();

    const sourceId = event.dataTransfer.getData("text/plain") || draggedDocumentId;
    const sourceDocument = documents.find((document) => document.id === sourceId);
    setDragOverTargetId("");

    if (!sourceDocument || sourceDocument.id === targetDocument.id) {
      setDraggedDocumentId("");
      return;
    }

    if (documentFilesOf(targetDocument).length <= 1) {
      setDatabaseMessage("ปล่อยไฟล์ได้เฉพาะเอกสารที่เป็นชุดเอกสารก่อน");
      setDraggedDocumentId("");
      return;
    }

    await moveSingleFileDocumentToTarget(sourceDocument, targetDocument);
  }

  async function handleDeleteDocumentFile(document: LibraryDocument, fileIndex: number) {
    if (!canDeleteDocument(document, currentProfile, currentUserId, !firebaseConfigured)) {
      const message = "ลบได้เฉพาะผู้ที่อัปโหลดไฟล์หรือ ผอ. เท่านั้น";
      setDatabaseMessage(message);
      window.alert(message);
      return;
    }

    const files = documentFilesOf(document);
    const targetFile = files[fileIndex];
    if (!targetFile) return;

    if (files.length <= 1) {
      await handleDeleteDocument(document);
      resetDocumentForm();
      return;
    }

    const fileLabel = targetFile.fileName || `ไฟล์ที่ ${fileIndex + 1}`;
    const confirmed = window.confirm(`ต้องการลบไฟล์ "${fileLabel}" ออกจากชุดเอกสารนี้ใช่ไหม`);
    if (!confirmed) return;

    const deletingKey = `${document.id}:${fileIndex}`;
    setDeletingDocumentId(deletingKey);
    setDatabaseMessage(`กำลังลบไฟล์ ${fileLabel}...`);

    try {
      const driveFileId = driveFileIdOf(targetFile);
      if (driveFileId && firebaseConfigured) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error("กรุณาเข้าสู่ระบบใหม่");

        const response = await fetch("/api/school-library/delete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            driveFileId,
            uploadedByUserId: document.uploadedByUserId || "",
          }),
        });
        const result = await readApiResult<{ ok?: boolean; message?: string }>(
          response,
        );

        if (!response.ok || !result.ok) {
          throw new Error(result.message || "ลบไฟล์ไม่สำเร็จ");
        }
      }

      if (targetFile.driveUrl.startsWith("blob:")) URL.revokeObjectURL(targetFile.driveUrl);

      const remainingFiles = files.filter((_, index) => index !== fileIndex);
      const updatedInput = documentInputWithFiles(document, remainingFiles);
      const savedDocument = firebaseConfigured
        ? await updateSchoolLibraryDocument(document.id, updatedInput)
        : { ...updatedInput, id: document.id };

      setDocuments((current) =>
        current.map((item) => (item.id === document.id ? savedDocument : item)),
      );
      setEditingDocument((current) =>
        current?.id === document.id ? savedDocument : current,
      );
      setDatabaseMessage(`ลบไฟล์ ${fileLabel} ออกจากชุดเอกสารแล้ว`);
    } catch (error) {
      console.error("Delete school library child file error:", error);
      const message = error instanceof Error ? error.message : "ลบไฟล์ไม่สำเร็จ";
      setDatabaseMessage(message);
      window.alert(message);
    } finally {
      setDeletingDocumentId("");
    }
  }

  function addSelectedFiles(fileList: FileList | File[] | null) {
    const incomingFiles = Array.from(fileList || []);
    if (incomingFiles.length === 0) return;

    const validFiles = incomingFiles.filter((file) => file.size <= MAX_UPLOAD_FILE_SIZE);
    const rejectedFile = incomingFiles.find((file) => file.size > MAX_UPLOAD_FILE_SIZE);

    if (rejectedFile) {
      setFormError(
        `ไฟล์ ${rejectedFile.name} ต้องมีขนาดไม่เกิน ${formatFileSize(
          MAX_UPLOAD_FILE_SIZE,
        )}`,
      );
    } else {
      setFormError("");
    }

    if (validFiles.length === 0) return;

    setSelectedFiles((current) => {
      const existing = new Set(current.map(fileIdentity));
      const nextFiles = [
        ...current,
        ...validFiles.filter((file) => !existing.has(fileIdentity(file))),
      ];

      if (!draft.title.trim() && current.length === 0 && nextFiles[0]) {
        setDraft((currentDraft) => ({
          ...currentDraft,
          title: titleFromFileName(nextFiles[0].name),
        }));
      }

      return nextFiles;
    });
  }

  function removeSelectedFile(file: File) {
    setSelectedFiles((current) =>
      current.filter((item) => fileIdentity(item) !== fileIdentity(file)),
    );
  }

  function addDriveLinkField() {
    setDriveLinks((current) => [...current, { url: "", name: "" }]);
  }

  function updateDriveLink(index: number, key: keyof DriveLinkDraft, value: string) {
    setDriveLinks((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  }

  function removeDriveLink(index: number) {
    setDriveLinks((current) =>
      current.filter((_, itemIndex) => itemIndex !== index),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!draft.title.trim()) {
      setFormError("กรุณากรอกชื่อเอกสารและผู้จัดทำ");
      return;
    }

    const existingFiles = editingDocument ? documentFilesOf(editingDocument) : [];
    const validDriveLinks = normalizeDriveLinkDrafts(driveLinks);

    for (const link of validDriveLinks) {
      try {
        new URL(link.url);
      } catch {
        setFormError(`ลิงก์ไฟล์ไม่ถูกต้อง: ${link.url}`);
        return;
      }
    }

    if (!editingDocument && selectedFiles.length === 0 && validDriveLinks.length === 0) {
      setFormError("กรุณาเลือกไฟล์จากเครื่องหรือแนบลิงก์ Google Drive");
      return;
    }

    if (
      editingDocument &&
      existingFiles.length === 0 &&
      selectedFiles.length === 0 &&
      validDriveLinks.length === 0
    ) {
      setFormError("กรุณาเลือกไฟล์จากเครื่องหรือแนบลิงก์ Google Drive");
      return;
    }

    const oversizedFile = selectedFiles.find((file) => file.size > MAX_UPLOAD_FILE_SIZE);
    if (oversizedFile) {
      setFormError(
        `ไฟล์ ${oversizedFile.name} ต้องมีขนาดไม่เกิน ${formatFileSize(
          MAX_UPLOAD_FILE_SIZE,
        )}`,
      );
      return;
    }

    setDatabaseMessage("กำลังเตรียมส่งไฟล์เข้าคลังโรงเรียน...");
    setSavingDocument(true);

    try {
      const uploaderName = profileName(currentProfile);
      let sessionUserId = currentUserId;
      let accessToken = "";
      const uploadedFiles: LibraryDocumentFile[] = [];
      const baseTitle = draft.title.trim();

      if (firebaseConfigured) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        accessToken = session?.access_token || "";
        sessionUserId = session?.user.id || currentUserId;
        if (!accessToken) throw new Error("กรุณาเข้าสู่ระบบใหม่");
      }

      for (const [fileIndex, selectedFile] of selectedFiles.entries()) {
        setDatabaseMessage(
          `กำลังบันทึกไฟล์ ${fileIndex + 1}/${selectedFiles.length}: ${selectedFile.name}`,
        );

        let uploadResult: {
          ok?: boolean;
          message?: string;
          fileType?: LibraryDocument["fileType"];
          fileUrl?: string;
          fileId?: string;
          fileName?: string;
          mimeType?: string;
          fileSize?: number;
        } = {};
        const localPreviewUrl =
          !firebaseConfigured && shouldOpenFileInBrowser(selectedFile)
            ? URL.createObjectURL(selectedFile)
            : "";

        if (firebaseConfigured) {
          const uploadData = new FormData();
          uploadData.append("file", selectedFile);
          uploadData.append(
            "title",
            selectedFiles.length === 1
              ? baseTitle
              : `${baseTitle} - ${titleFromFileName(selectedFile.name)}`,
          );
          uploadData.append("category", draft.category);
          uploadData.append("academicYear", draft.academicYear.trim() || "2569");

          const uploadResponse = await fetch("/api/school-library/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}` },
            body: uploadData,
          });
          uploadResult = await readApiResult<typeof uploadResult>(
            uploadResponse,
          );

          if (!uploadResponse.ok || !uploadResult.ok) {
            throw new Error(uploadResult.message || "อัปโหลดไฟล์ไป Google Drive ไม่สำเร็จ");
          }
        }

        uploadedFiles.push({
          driveUrl: uploadResult.fileUrl || localPreviewUrl || DRIVE_FOLDER_URL,
          driveFileId: uploadResult.fileId || "",
          fileName: uploadResult.fileName || selectedFile.name,
          mimeType: uploadResult.mimeType || selectedFile.type,
          fileSize: uploadResult.fileSize || selectedFile.size,
          fileType: uploadResult.fileType || inferFileTypeFromFile(selectedFile),
        });
      }

      setDatabaseMessage("กำลังจัดเก็บรายละเอียดเอกสาร...");

      for (const [linkIndex, link] of validDriveLinks.entries()) {
        const fileName = link.name || fileNameFromDriveUrl(link.url);
        setDatabaseMessage(
          `กำลังบันทึกลิงก์ไฟล์ ${linkIndex + 1}/${validDriveLinks.length}: ${fileName}`,
        );

        uploadedFiles.push({
          driveUrl: link.url,
          driveFileId: driveFileIdOf({ driveUrl: link.url }),
          fileName,
          mimeType: "",
          fileSize: 0,
          fileType: "DRIVE",
        });
      }

      const mergedFiles = [...existingFiles, ...uploadedFiles];
      const primaryFile = mergedFiles[0];
      const totalFileSize = mergedFiles.reduce(
        (total, file) => total + (file.fileSize || 0),
        0,
      );
      const newDocument: NewSchoolLibraryDocument & { updatedAt: string } = {
        title: baseTitle,
        category: draft.category,
        subcategory: draft.subcategory.trim() || "เอกสารทั่วไป",
        owner: uploaderName,
        gradeLevel: draft.gradeLevel.trim() || "ทั้งโรงเรียน",
        subject: draft.subject.trim() || "-",
        academicYear: draft.academicYear.trim() || "2569",
        fileType: primaryFile?.fileType || "DRIVE",
        status: "ready",
        updatedAt: "วันนี้",
        keywords: draft.keywords
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        driveUrl: primaryFile?.driveUrl || DRIVE_FOLDER_URL,
        driveFileId: primaryFile?.driveFileId || "",
        fileName:
          mergedFiles.length === 1
            ? primaryFile?.fileName || selectedFiles[0]?.name || ""
            : `${mergedFiles.length} ไฟล์ในชุดเอกสาร`,
        mimeType: primaryFile?.mimeType || "",
        fileSize: totalFileSize || undefined,
        files: mergedFiles,
        uploadedByUserId: currentProfile?.id || sessionUserId || "local-sample-user",
        uploadedByName: uploaderName,
      };

      const savedDocument = editingDocument
        ? firebaseConfigured
          ? await updateSchoolLibraryDocument(editingDocument.id, newDocument)
          : { ...newDocument, id: editingDocument.id }
        : firebaseConfigured
          ? await createSchoolLibraryDocument(newDocument)
          : { ...newDocument, id: `doc-set-${Date.now()}` };

      setDocuments((current) =>
        editingDocument
          ? current.map((item) => (item.id === editingDocument.id ? savedDocument : item))
          : [savedDocument, ...current],
      );
      setExpandedDocumentIds((current) =>
        current.includes(savedDocument.id) ? current : [savedDocument.id, ...current],
      );
      setDatabaseMessage(
        editingDocument
          ? `ปรับปรุงชุดเอกสาร ${mergedFiles.length} ไฟล์แล้ว`
          : firebaseConfigured
            ? `บันทึกชุดเอกสาร ${mergedFiles.length} ไฟล์ลง Firebase แล้ว`
            : `บันทึกชุดเอกสาร ${mergedFiles.length} ไฟล์เฉพาะบนหน้าเว็บชั่วคราว`,
      );
      resetDocumentForm();
    } catch (error) {
      console.error("Save school library document error:", error);
      setFormError(
        error instanceof Error
          ? error.message
          : "บันทึกเอกสารไม่สำเร็จ กรุณาตรวจการตั้งค่า Google Drive/Firebase",
      );
    } finally {
      setSavingDocument(false);
    }
  }

  async function handleDeleteDocument(document: LibraryDocument) {
    if (!canDeleteDocument(document, currentProfile, currentUserId, !firebaseConfigured)) {
      const message = "ลบได้เฉพาะผู้ที่อัปโหลดไฟล์หรือ ผอ. เท่านั้น";
      setDatabaseMessage(message);
      window.alert(message);
      return;
    }

    const driveFileIds = driveFileIdsOf(document);

    if (driveFileIds.length === 0) {
      const confirmed = window.confirm(
        `รายการ "${document.title}" ไม่มี Drive file id ต้องการลบเฉพาะรายการออกจากคลังใช่ไหม`,
      );
      if (!confirmed) return;

      setDeletingDocumentId(document.id);
      setDatabaseMessage(`กำลังลบรายการ ${document.title}...`);

      try {
        if (firebaseConfigured) {
          await deleteSchoolLibraryDocument(document.id);
        }

        documentFilesOf(document).forEach((file) => {
          if (file.driveUrl.startsWith("blob:")) URL.revokeObjectURL(file.driveUrl);
        });
        setDocuments((current) => current.filter((item) => item.id !== document.id));
        setEditingDocument((current) => (current?.id === document.id ? null : current));
        setDatabaseMessage("ลบรายการออกจากคลังแล้ว แต่ไม่ได้ลบไฟล์ใน Drive เพราะไม่มี Drive file id");
        window.alert("ลบรายการออกจากคลังแล้ว");
      } catch (error) {
        console.error("Delete school library metadata error:", error);
        const message = error instanceof Error ? error.message : "ลบรายการไม่สำเร็จ";
        setDatabaseMessage(message);
        window.alert(message);
      } finally {
        setDeletingDocumentId("");
      }
      return;
    }

    const confirmed = window.confirm(`ต้องการลบไฟล์ "${document.title}" ใช่ไหม`);
    if (!confirmed) return;

    setDeletingDocumentId(document.id);
    setDatabaseMessage(`กำลังลบไฟล์ ${document.title}...`);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      for (const driveFileId of driveFileIds) {
        const response = await fetch("/api/school-library/delete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            driveFileId,
            uploadedByUserId: document.uploadedByUserId || "",
          }),
        });
        const result = await readApiResult<{ ok?: boolean; message?: string }>(
          response,
        );

        if (!response.ok || !result.ok) {
          throw new Error(result.message || "ลบไฟล์ไม่สำเร็จ");
        }
      }

      if (firebaseConfigured) {
        await deleteSchoolLibraryDocument(document.id);
      }

      documentFilesOf(document).forEach((file) => {
        if (file.driveUrl.startsWith("blob:")) URL.revokeObjectURL(file.driveUrl);
      });
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setEditingDocument((current) => (current?.id === document.id ? null : current));
      setDatabaseMessage("ลบไฟล์ออกจากคลังงานแล้ว");
      window.alert("ลบไฟล์ออกจากคลังงานแล้ว");
    } catch (error) {
      console.error("Delete school library document error:", error);
      const message = error instanceof Error ? error.message : "ลบไฟล์ไม่สำเร็จ";
      setDatabaseMessage(message);
      window.alert(message);
    } finally {
      setDeletingDocumentId("");
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.workspace}>
        <header className={styles.header}>
          <div>
            <h1>คลังงานโรงเรียน</h1>
            <p>ค้นหาและจัดเก็บองค์ความรู้ของโรงเรียน</p>
          </div>
          <section
            className={`${styles.headerDropZone} ${dropZoneActive ? styles.headerDropZoneActive : ""}`}
            aria-label="โยนไฟล์เข้าคลังตรงนี้ได้"
            onDragEnter={handleLibraryDragOver}
            onDragOver={handleLibraryDragOver}
            onDragLeave={handleLibraryDragLeave}
            onDrop={handleLibraryDrop}
          >
            <span>โยนไฟล์เข้าคลังตรงนี้ได้</span>
          </section>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => openCreateDocumentForm()}
            >
              <span aria-hidden="true">＋</span>
              เพิ่มเอกสาร
            </button>
            <p className={styles.databaseNotice} data-ready={firebaseConfigured}>
              {loadingDocuments ? "กำลังโหลดข้อมูลจาก Firebase..." : databaseMessage}
            </p>
          </div>
        </header>

        <div className={styles.searchBar}>
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => rememberSearchTerm()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                rememberSearchTerm();
              }
            }}
            placeholder="ค้นหาแผนการสอน วิจัย โครงการ หรือชื่อครู..."
          />
          <button type="button" aria-label="ล้างตัวกรอง" onClick={resetFilters}>
            ☷
          </button>
        </div>

        <section className={styles.categoryGrid} aria-label="หมวดเอกสารหลัก">
          {CATEGORIES.map((category) => {
            const count = documents.filter((document) => document.category === category.id).length;
            const stats = categoryStats[category.id];
            const active = selectedCategory === category.id;

            return (
              <button
                type="button"
                key={category.id}
                className={`${styles.categoryCard} ${styles[category.tone]} ${
                  active ? styles.categoryCardActive : ""
                }`}
                onClick={() => setSelectedCategory(active ? "all" : category.id)}
              >
                <span className={styles.categoryIcon} aria-hidden="true">{category.icon}</span>
                <b>{category.label}</b>
                <small>{category.description}</small>
                <span className={styles.categoryCount}>
                  <strong>{stats?.documentCount ?? count}</strong>
                  <span>เรื่อง</span>
                </span>
                <span className={styles.categoryMeta}>
                  {stats?.fileCount ?? count} ไฟล์ • {formatFileSize(stats?.totalSize ?? 0)}
                </span>
              </button>
            );
          })}
        </section>

        <section className={styles.filters} aria-label="ตัวกรองเอกสาร">
          <label>
            <span aria-hidden="true">▣</span>
            <select value={academicYear} onChange={(event) => setAcademicYear(event.target.value)}>
              <option value="all">ปีการศึกษาทั้งหมด</option>
              {academicYears.map((year) => (
                <option key={year} value={year}>
                  ปีการศึกษา {year}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span aria-hidden="true">▤</span>
            <select
              value={selectedCategory}
              onChange={(event) =>
                setSelectedCategory(event.target.value as LibraryCategory | "all")
              }
            >
              <option value="all">ทั้งหมด</option>
              {CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span aria-hidden="true">♙</span>
            <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="all">ครูและบุคลากรทั้งหมด</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className={styles.documentPanel}>
          <div className={styles.sectionHeader}>
            <h2>เอกสารล่าสุด</h2>
            <a href={DRIVE_FOLDER_URL} target="_blank" rel="noreferrer">
              โฟลเดอร์หลัก →
            </a>
          </div>

          {latestDocuments.length === 0 ? (
            <div className={styles.emptyState}>ยังไม่พบเอกสารในหมวดนี้</div>
          ) : (
            <>
              <div className={styles.tableHeader}>
                <span>ชื่อเอกสาร</span>
                <span>หมวดงาน</span>
                <span>ผู้จัดทำ</span>
                <span>ไฟล์ / ขนาด</span>
                <span>แก้ไขล่าสุด</span>
                <span>สถานะ</span>
              </div>
              <div className={styles.documentList}>
                {latestDocuments.map((document) => {
                  const category = CATEGORIES.find((item) => item.id === document.category);
                  const accessUrl = documentAccessUrl(document);
                  const opensInBrowser = shouldOpenInBrowser(document);
                  const files = documentFilesOf(document);
                  const isDocumentSet = files.length > 1;
                  const expanded = expandedDocumentIds.includes(document.id);
                  const primaryFile = primaryDocumentFile(document);
                  const fileKind = fileKindOf(primaryFile || document);
                  const isDropTarget = dragOverTargetId === document.id;
                  const canDragDocument = !isDocumentSet;

                  return (
                    <article
                      className={`${styles.documentRow} ${isDropTarget ? styles.documentDropTarget : ""}`}
                      key={document.id}
                      onDragOver={(event) => handleDocumentSetDragOver(event, document)}
                      onDragLeave={(event) => handleDocumentSetDragLeave(event, document)}
                      onDrop={(event) => void handleDocumentSetDrop(event, document)}
                    >
                      <div className={styles.documentTitle}>
                        {isDocumentSet ? (
                          <span className={styles.folderFileBadge} aria-hidden="true">
                            <span className={`${styles.fileBadge} ${styles[fileKind]}`}>
                              {fileIconLabel(fileKind, primaryFile?.fileName || document.fileName || document.title)}
                            </span>
                          </span>
                        ) : (
                          <span
                            className={`${styles.fileBadge} ${styles[fileKind]} ${canDragDocument ? styles.draggableFileBadge : ""}`}
                            aria-label="ลากไฟล์นี้ไปใส่ชุดเอกสาร"
                            draggable={canDragDocument}
                            role={canDragDocument ? "button" : undefined}
                            title={canDragDocument ? "ลากไปใส่ชุดเอกสาร" : undefined}
                            onDragStart={(event) => handleDocumentIconDragStart(event, document)}
                            onDragEnd={handleDocumentDragEnd}
                          >
                            {fileIconLabel(fileKind, primaryFile?.fileName || document.fileName || document.title)}
                          </span>
                        )}
                        <div>
                          {isDocumentSet ? (
                            <button
                              type="button"
                              className={styles.documentLinkButton}
                              onClick={() => toggleDocumentTree(document.id)}
                              aria-expanded={expanded}
                            >
                              {document.title}
                            </button>
                          ) : (
                            <a
                              className={styles.documentLink}
                              href={accessUrl}
                              target="_blank"
                              rel="noreferrer"
                              download={!opensInBrowser || undefined}
                            >
                              {document.title}
                            </a>
                          )}
                        </div>
                      </div>
                      <span
                        className={`${styles.categoryPill} ${
                          category ? styles[`${category.tone}Pill`] : ""
                        }`}
                      >
                        {category?.label}
                      </span>
                      <span>{document.owner}</span>
                      <span>{documentFileSizeLabel(document)}</span>
                      <span>{document.updatedAt}</span>
                      <div className={styles.rowActions}>
                        <span className={`${styles.statusPill} ${styles.ready}`}>
                          {statusLabel(document.status)}
                        </span>
                        <button
                          type="button"
                          className={styles.editButton}
                          onClick={() => openEditDocumentForm(document)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className={styles.addFileButton}
                          onClick={() => openEditDocumentForm(document)}
                        >
                          เพิ่มไฟล์
                        </button>
                        {canDeleteDocument(document, currentProfile, currentUserId, !firebaseConfigured) && (
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => void handleDeleteDocument(document)}
                            disabled={deletingDocumentId === document.id}
                            aria-label="ลบไฟล์"
                          >
                            {deletingDocumentId === document.id ? "..." : "ลบ"}
                          </button>
                        )}
                      </div>
                      {isDocumentSet && expanded && (
                        <div className={styles.fileTree}>
                          {files.map((file, fileIndex) => {
                            const childKind = fileKindOf(file);
                            const childUrl = documentFileAccessUrl(file);
                            const childOpensInBrowser = shouldOpenDocumentFileInBrowser(file);

                            return (
                              <div
                                className={styles.fileTreeItem}
                                key={`${file.fileName || file.driveUrl}-${fileIndex}`}
                              >
                                <span
                                  className={`${styles.fileBadge} ${styles[childKind]}`}
                                  aria-hidden="true"
                                >
                                  {fileIconLabel(childKind, file.fileName)}
                                </span>
                                <a
                                  href={childUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  download={!childOpensInBrowser || undefined}
                                >
                                  {file.fileName || `ไฟล์ที่ ${fileIndex + 1}`}
                                </a>
                                <small>{file.fileSize ? formatFileSize(file.fileSize) : "-"}</small>
                                {canDeleteDocument(document, currentProfile, currentUserId, !firebaseConfigured) && (
                                  <button
                                    type="button"
                                    className={styles.fileTreeDeleteButton}
                                    onClick={() => void handleDeleteDocumentFile(document, fileIndex)}
                                    disabled={deletingDocumentId === `${document.id}:${fileIndex}`}
                                    aria-label="ลบไฟล์ย่อย"
                                  >
                                    {deletingDocumentId === `${document.id}:${fileIndex}` ? "..." : "ลบ"}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <section className={styles.keywordPanel}>
          <h2>คำค้นหายอดนิยม</h2>
          <div>
            {popularKeywords.length === 0 && (
              <span className={styles.keywordEmpty}>ยังไม่มีประวัติคำค้นหา</span>
            )}
            {popularKeywords.map((item) => (
              <button
                type="button"
                key={item.term}
                onClick={() => {
                  setQuery(item.term);
                  rememberSearchTerm(item.term);
                }}
              >
                {item.term} <span>{item.count}</span>
              </button>
            ))}
          </div>
        </section>
      </section>

      {formOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <form className={styles.modal} onSubmit={handleSubmit}>
            <div className={styles.modalHeader}>
              <h2>{editingDocument ? "แก้ไขชุดเอกสาร" : "เพิ่มเอกสาร"}</h2>
              <button
                type="button"
                onClick={resetDocumentForm}
                aria-label="ปิด"
              >
                ×
              </button>
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

            {savingDocument && (
              <div className={styles.uploadLoader} role="status" aria-live="polite">
                <div className={styles.circuitBoard} aria-hidden="true">
                  <svg viewBox="0 0 220 130" focusable="false">
                    <rect x="22" y="20" width="176" height="90" rx="14" />
                    <path d="M46 48 H84 C94 48 94 34 104 34 H142" />
                    <path d="M46 82 H72 C86 82 88 96 102 96 H166" />
                    <path d="M84 48 V66 H122 C134 66 134 52 146 52 H176" />
                    <path d="M112 34 V20" />
                    <path d="M166 96 V110" />
                    <circle cx="46" cy="48" r="5" />
                    <circle cx="176" cy="52" r="5" />
                    <circle cx="166" cy="96" r="5" />
                    <circle cx="112" cy="64" r="13" />
                  </svg>
                  <span className={styles.circuitPulseOne} />
                  <span className={styles.circuitPulseTwo} />
                </div>
                <div className={styles.uploadLoaderText}>
                  <h3>กำลังส่งไฟล์เข้าคลังโรงเรียน</h3>
                  <p>{databaseMessage || "กำลังจัดเก็บข้อมูล..."}</p>
                </div>
                <div className={styles.uploadProgress} aria-hidden="true">
                  <span />
                </div>
              </div>
            )}

            <label>
              ชื่อเอกสาร
              <input
                value={draft.title}
                onChange={(event) => updateDraft("title", event.target.value)}
                required
              />
            </label>
            <label>
              หมวดงานหลัก
              <select
                value={draft.category}
                onChange={(event) => updateDraft("category", event.target.value as LibraryCategory)}
              >
                {CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <p className={styles.formHint}>
              ผู้จัดทำ: {profileName(currentProfile)}
            </p>
            <div className={styles.formGrid}>
              <label>
                ปีการศึกษา
                <input
                  value={draft.academicYear}
                  onChange={(event) => updateDraft("academicYear", event.target.value)}
                />
              </label>
              <div className={styles.detectedFileType}>
                <span>ประเภทไฟล์</span>
                <strong>{selectedFileTypeLabel(selectedFiles)}</strong>
                <small>
                  {selectedFiles.length > 0
                    ? `${selectedFiles.length} ไฟล์ • รวม ${formatFileSize(selectedFilesTotalSize)}`
                    : editingDocument
                      ? `${documentFilesOf(editingDocument).length} ไฟล์เดิม • เลือกไฟล์เพิ่มได้`
                    : "ระบบคำนวณจากไฟล์ที่เลือกให้อัตโนมัติ"}
                </small>
              </div>
            </div>
            <label>
              คำสำคัญ
              <input
                value={draft.keywords}
                onChange={(event) => updateDraft("keywords", event.target.value)}
                placeholder="คั่นด้วยเครื่องหมาย comma"
              />
            </label>
            <label className={styles.filePicker}>
              ไฟล์เอกสาร
              <input
                type="file"
                multiple
                onChange={(event) => {
                  addSelectedFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
                required={
                  !editingDocument &&
                  selectedFiles.length === 0 &&
                  normalizeDriveLinkDrafts(driveLinks).length === 0
                }
              />
              {selectedFiles.length > 0 ? (
                <span>
                  เลือกแล้ว {selectedFiles.length} ไฟล์ • รวม {formatFileSize(selectedFilesTotalSize)} • เลือกไฟล์เพิ่มได้
                </span>
              ) : (
                <span>เลือกไฟล์จากเครื่อง ระบบจะอัปโหลดเข้า Google Drive ให้</span>
              )}
            </label>

            <section className={styles.driveLinkPanel}>
              <div>
                <strong>ลิงก์ Google Drive สำหรับไฟล์ใหญ่</strong>
                <span>
                  ใช้เมื่อไฟล์เกิน {formatFileSize(MAX_UPLOAD_FILE_SIZE)} โดยอัปโหลดไฟล์เข้า
                  Google Drive ก่อน แล้วนำลิงก์มาแนบที่นี่
                </span>
              </div>

              {driveLinks.length > 0 && (
                <div className={styles.driveLinkList}>
                  {driveLinks.map((link, index) => (
                    <div className={styles.driveLinkRow} key={index}>
                      <input
                        value={link.url}
                        onChange={(event) =>
                          updateDriveLink(index, "url", event.target.value)
                        }
                        placeholder="https://drive.google.com/file/d/..."
                        inputMode="url"
                      />
                      <input
                        value={link.name}
                        onChange={(event) =>
                          updateDriveLink(index, "name", event.target.value)
                        }
                        placeholder="ชื่อไฟล์ที่จะแสดง"
                      />
                      <button type="button" onClick={() => removeDriveLink(index)}>
                        ลบ
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button type="button" onClick={addDriveLinkField}>
                + เพิ่มลิงก์ไฟล์ใหญ่
              </button>
            </section>

            {editingDocument && documentFilesOf(editingDocument).length > 0 && (
              <div className={`${styles.selectedFilesPanel} ${styles.existingFilesPanel}`} aria-live="polite">
                <div>
                  <strong>ไฟล์เดิมในชุดเอกสาร</strong>
                  <span>{documentFileSizeLabel(editingDocument)}</span>
                </div>
                <ul>
                  {documentFilesOf(editingDocument).map((file, fileIndex) => {
                    const existingKind = fileKindOf(file);
                    const existingUrl = documentFileAccessUrl(file);
                    const existingOpensInBrowser = shouldOpenDocumentFileInBrowser(file);

                    return (
                      <li key={`${file.fileName || file.driveUrl}-${fileIndex}`}>
                        <span>
                          <a
                            href={existingUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={!existingOpensInBrowser || undefined}
                          >
                            {file.fileName || `ไฟล์ที่ ${fileIndex + 1}`}
                          </a>
                          <small>
                            {fileIconLabel(existingKind, file.fileName)} •{" "}
                            {file.fileSize ? formatFileSize(file.fileSize) : "-"}
                          </small>
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDocumentFile(editingDocument, fileIndex)}
                          disabled={deletingDocumentId === `${editingDocument.id}:${fileIndex}`}
                        >
                          {deletingDocumentId === `${editingDocument.id}:${fileIndex}` ? "..." : "ลบ"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {editingDocument && documentFilesOf(editingDocument).length === 1 && (
              <section className={styles.moveFilePanel}>
                <div>
                  <strong>ย้ายไฟล์นี้เข้าเอกสารเดิม</strong>
                  <span>เลือกหัวข้อปลายทาง ระบบจะย้ายเฉพาะข้อมูลไฟล์ ไม่อัปโหลดซ้ำ</span>
                </div>
                <input
                  value={moveTargetQuery}
                  onChange={(event) => setMoveTargetQuery(event.target.value)}
                  placeholder="ค้นหาหัวข้อปลายทาง..."
                />
                <div className={styles.moveTargetList}>
                  {moveTargetDocuments.length > 0 ? (
                    moveTargetDocuments.map((document) => (
                      <button
                        type="button"
                        key={document.id}
                        onClick={() => void handleMoveEditingDocumentToTarget(document)}
                        disabled={savingDocument}
                      >
                        <strong>{document.title}</strong>
                        <span>
                          {documentFileSizeLabel(document)} • {document.owner} • {document.updatedAt}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>ไม่พบเอกสารเดิมที่ตรงกับคำค้น</p>
                  )}
                </div>
              </section>
            )}

            {selectedFiles.length > 0 && (
              <div className={styles.selectedFilesPanel} aria-live="polite">
                <div>
                  <strong>ไฟล์ที่รอบันทึก</strong>
                  <span>{selectedFiles.length} ไฟล์ • {formatFileSize(selectedFilesTotalSize)}</span>
                </div>
                <ul>
                  {selectedFiles.map((file) => (
                    <li key={fileIdentity(file)}>
                      <span>
                        {file.name}
                        <small>
                          {fileIconLabel(
                            fileKindOf({
                              fileName: file.name,
                              mimeType: file.type,
                              fileType: inferFileTypeFromFile(file),
                            }),
                            file.name,
                          )} • {formatFileSize(file.size)}
                        </small>
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSelectedFile(file)}
                        aria-label={`ลบ ${file.name}`}
                      >
                        ลบ
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={resetDocumentForm}
              >
                ยกเลิก
              </button>
              <button type="submit" disabled={savingDocument}>
                {savingDocument ? "กำลังบันทึก..." : editingDocument ? "บันทึกการแก้ไข" : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}

      {pendingDropFiles.length > 0 && !formOpen && (
        <div className={styles.modalBackdrop} role="presentation">
          <section className={styles.dropTargetModal} role="dialog" aria-modal="true">
            <div className={styles.modalHeader}>
              <h2>เลือกปลายทางของไฟล์</h2>
              <button type="button" onClick={closeDropTargetPicker} aria-label="ปิด">
                ×
              </button>
            </div>

            <p className={styles.dropTargetSummary}>
              ไฟล์ที่โยนมา {pendingDropFiles.length} ไฟล์ • รวม{" "}
              {formatFileSize(pendingDropFiles.reduce((total, file) => total + file.size, 0))}
            </p>

            <button
              type="button"
              className={styles.createNewDropButton}
              onClick={openDroppedFilesAsNewDocument}
            >
              สร้างเอกสารใหม่จากไฟล์นี้
            </button>

            <label className={styles.dropTargetSearch}>
              เพิ่มเข้าเอกสารเดิม
              <input
                value={dropTargetQuery}
                onChange={(event) => setDropTargetQuery(event.target.value)}
                placeholder="ค้นหาชื่อเอกสารเดิม..."
                autoFocus
              />
            </label>

            <div className={styles.dropTargetList}>
              {dropTargetDocuments.length > 0 ? (
                dropTargetDocuments.map((document) => (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() => openDroppedFilesForExistingDocument(document)}
                  >
                    <strong>{document.title}</strong>
                    <span>
                      {documentFileSizeLabel(document)} • {document.owner} • {document.updatedAt}
                    </span>
                  </button>
                ))
              ) : (
                <p>ไม่พบเอกสารเดิมที่ตรงกับคำค้น</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
