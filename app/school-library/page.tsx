"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  createSchoolLibraryDocument,
  deleteSchoolLibraryDocument,
  isSchoolLibraryFirebaseConfigured,
  listSchoolLibraryDocuments,
  type NewSchoolLibraryDocument,
} from "@/lib/school-library/firestore";
import { createClient } from "@/lib/supabase/client";
import styles from "./school-library.module.css";

type LibraryCategory =
  | "lesson-plan"
  | "operation-plan"
  | "research"
  | "forms"
  | "certificates";

type LibraryStatus = "reviewed" | "approved" | "draft" | "ready";

type LibraryDocument = {
  id: string;
  title: string;
  category: LibraryCategory;
  subcategory: string;
  owner: string;
  gradeLevel: string;
  subject: string;
  academicYear: string;
  fileType: "PDF" | "DOCX" | "DRIVE";
  status: LibraryStatus;
  updatedAt: string;
  keywords: string[];
  driveUrl: string;
  driveFileId?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
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
};

type SearchStat = {
  term: string;
  count: number;
  lastUsedAt: number;
};

const DRIVE_FOLDER_URL =
  "https://drive.google.com/drive/u/0/folders/1oqa3etlgk5LtqDLRY2SJn1mDinPL0_lJ";
const SEARCH_HISTORY_KEY = "school-library-search-history";

const CATEGORIES: Array<{
  id: LibraryCategory;
  label: string;
  icon: string;
  tone: "green" | "mint" | "purple" | "orange" | "blue";
}> = [
  { id: "lesson-plan", label: "แผนงานและโครงการ", icon: "▤", tone: "green" },
  { id: "operation-plan", label: "การจัดการเรียนการสอน", icon: "☑", tone: "mint" },
  { id: "forms", label: "แบบฟอร์มต่างๆ", icon: "▧", tone: "orange" },
  { id: "research", label: "ผลงานและรางวัล", icon: "⌬", tone: "purple" },
  { id: "certificates", label: "วุฒิบัตร-ใบประกาศ", icon: "☆", tone: "blue" },
];

const INITIAL_DOCUMENTS: LibraryDocument[] = [
  {
    id: "doc-1",
    title: "แผนการจัดการเรียนรู้ วิชาคณิตศาสตร์ ป.4",
    category: "lesson-plan",
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
    category: "research",
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
    category: "operation-plan",
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
  category: "lesson-plan",
  subcategory: "",
  gradeLevel: "",
  subject: "",
  academicYear: "2569",
  keywords: "",
};

function statusLabel(status: LibraryStatus) {
  return "พร้อมใช้";
}

function fileIcon(fileType: LibraryDocument["fileType"]) {
  if (fileType === "PDF") return "PDF";
  if (fileType === "DOCX") return "W";
  return "▶";
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

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} bytes`;
}

function driveFileIdOf(document: LibraryDocument) {
  const directId = document.driveFileId?.trim();
  if (directId) return directId;

  const url = document.driveUrl || "";
  const filePathMatch = url.match(/\/file\/d\/([^/?#]+)/);
  if (filePathMatch?.[1]) return decodeURIComponent(filePathMatch[1]);

  try {
    const parsed = new URL(url);
    return parsed.searchParams.get("id")?.trim() || "";
  } catch {
    return "";
  }
}

function shouldOpenInBrowser(document: LibraryDocument) {
  const mimeType = (document.mimeType || "").toLowerCase();
  return document.fileType === "PDF" || mimeType === "application/pdf" || mimeType.startsWith("image/");
}

function documentAccessUrl(document: LibraryDocument) {
  if (shouldOpenInBrowser(document)) return document.driveUrl;

  const fileId = driveFileIdOf(document);
  return fileId
    ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`
    : document.driveUrl;
}

function normalizeSearchTerm(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 60);
}

function titleFromFileName(name: string) {
  const withoutExtension = name.replace(/\.[^.]+$/, "");
  return withoutExtension.trim().replace(/\s+/g, " ").slice(0, 120) || name.slice(0, 120);
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
) {
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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

    async function loadPersonnelOptions() {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("account_status", "active")
        .order("full_name", { ascending: true });

      if (cancelled || !data) return;

      setPersonnelOptions(
        data
          .map((item) => ({
            id: String(item.id || ""),
            full_name: String(item.full_name || "").trim(),
          }))
          .filter((item) => item.id && item.full_name),
      );
    }

    void loadPersonnelOptions();

    return () => {
      cancelled = true;
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
    () =>
      personnelOptions.length > 0
        ? personnelOptions.map((person) => person.full_name)
        : Array.from(new Set(documents.map((document) => document.owner))).filter(Boolean),
    [documents, personnelOptions],
  );

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (!draft.title.trim()) {
      setFormError("กรุณากรอกชื่อเอกสารและผู้จัดทำ");
      return;
    }

    if (!selectedFile) {
      setFormError("กรุณาเลือกไฟล์จากเครื่อง");
      return;
    }

    if (selectedFile.size > 30 * 1024 * 1024) {
      setFormError("ไฟล์ต้องมีขนาดไม่เกิน 30 MB");
      return;
    }

    setSavingDocument(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      const uploaderName = profileName(currentProfile);
      if (!accessToken) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      const uploadData = new FormData();
      uploadData.append("file", selectedFile);
      uploadData.append("title", draft.title.trim());
      uploadData.append("category", draft.category);
      uploadData.append("academicYear", draft.academicYear.trim() || "2569");

      const uploadResponse = await fetch("/api/school-library/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: uploadData,
      });
      const uploadResult = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadResult.ok) {
        throw new Error(uploadResult.message || "อัปโหลดไฟล์ไป Google Drive ไม่สำเร็จ");
      }

      const newDocument: NewSchoolLibraryDocument & { updatedAt: string } = {
        title: draft.title.trim(),
        category: draft.category,
        subcategory: draft.subcategory.trim() || "เอกสารทั่วไป",
        owner: uploaderName,
        gradeLevel: draft.gradeLevel.trim() || "ทั้งโรงเรียน",
        subject: draft.subject.trim() || "-",
        academicYear: draft.academicYear.trim() || "2569",
        fileType: uploadResult.fileType || inferFileTypeFromFile(selectedFile),
        status: "ready",
        updatedAt: "วันนี้",
        keywords: draft.keywords
          .split(",")
          .map((keyword) => keyword.trim())
          .filter(Boolean),
        driveUrl: uploadResult.fileUrl || DRIVE_FOLDER_URL,
        driveFileId: uploadResult.fileId || "",
        fileName: uploadResult.fileName || selectedFile.name,
        mimeType: uploadResult.mimeType || selectedFile.type,
        fileSize: uploadResult.fileSize || selectedFile.size,
        uploadedByUserId: currentProfile?.id || session.user.id,
        uploadedByName: uploaderName,
      };

      if (firebaseConfigured) {
        const savedDocument = await createSchoolLibraryDocument(newDocument);
        setDocuments((current) => [savedDocument, ...current]);
        setDatabaseMessage("บันทึกเอกสารลง Firebase แล้ว");
      } else {
        setDocuments((current) => [
          { ...newDocument, id: `doc-${Date.now()}` },
          ...current,
        ]);
        setDatabaseMessage("ยังไม่ได้ตั้งค่า Firebase รายการนี้จึงบันทึกเฉพาะบนหน้าเว็บชั่วคราว");
      }

      setDraft(EMPTY_DRAFT);
      setSelectedFile(null);
      setFormOpen(false);
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
    if (!canDeleteDocument(document, currentProfile, currentUserId)) {
      const message = "ลบได้เฉพาะผู้ที่อัปโหลดไฟล์หรือ ผอ. เท่านั้น";
      setDatabaseMessage(message);
      window.alert(message);
      return;
    }

    const driveFileId = driveFileIdOf(document);

    if (!driveFileId) {
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

        setDocuments((current) => current.filter((item) => item.id !== document.id));
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
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ลบไฟล์ไม่สำเร็จ");
      }

      if (firebaseConfigured) {
        await deleteSchoolLibraryDocument(document.id);
      }

      setDocuments((current) => current.filter((item) => item.id !== document.id));
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
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => setFormOpen(true)}
          >
            <span aria-hidden="true">＋</span>
            เพิ่มเอกสาร
          </button>
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

        <p className={styles.databaseNotice} data-ready={firebaseConfigured}>
          {loadingDocuments ? "กำลังโหลดข้อมูลจาก Firebase..." : databaseMessage}
        </p>

        <section className={styles.categoryGrid} aria-label="หมวดเอกสารหลัก">
          {CATEGORIES.map((category) => {
            const count = documents.filter((document) => document.category === category.id).length;
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
                <span aria-hidden="true">{category.icon}</span>
                <b>{category.label}</b>
                <strong>{count}</strong>
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
              <option value="all">หมวดงานทั้งหมด</option>
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
                <span>ขนาดไฟล์</span>
                <span>แก้ไขล่าสุด</span>
                <span>สถานะ</span>
              </div>
              <div className={styles.documentList}>
                {latestDocuments.map((document) => {
                  const category = CATEGORIES.find((item) => item.id === document.category);
                  const accessUrl = documentAccessUrl(document);
                  const opensInBrowser = shouldOpenInBrowser(document);

                  return (
                    <article className={styles.documentRow} key={document.id}>
                      <div className={styles.documentTitle}>
                        <span className={`${styles.fileBadge} ${styles[document.fileType.toLowerCase()]}`}>
                          {fileIcon(document.fileType)}
                        </span>
                        <div>
                          <a
                            className={styles.documentLink}
                            href={accessUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={!opensInBrowser || undefined}
                          >
                            {document.title}
                          </a>
                        </div>
                      </div>
                      <span className={styles.categoryPill}>{category?.label}</span>
                      <span>{document.owner}</span>
                      <span>{document.fileSize ? formatFileSize(document.fileSize) : "-"}</span>
                      <span>{document.updatedAt}</span>
                      <div className={styles.rowActions}>
                        <span className={`${styles.statusPill} ${styles.ready}`}>
                          {statusLabel(document.status)}
                        </span>
                        {canDeleteDocument(document, currentProfile, currentUserId) && (
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
              <h2>เพิ่มเอกสาร</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="ปิด">
                ×
              </button>
            </div>

            {formError && <p className={styles.formError}>{formError}</p>}

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
                <strong>{inferFileTypeFromFile(selectedFile)}</strong>
                <small>ระบบคำนวณจากไฟล์ที่เลือกให้อัตโนมัติ</small>
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
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  const previousFileTitle = selectedFile
                    ? titleFromFileName(selectedFile.name)
                    : "";
                  setSelectedFile(file);
                  if (file) {
                    const nextTitle = titleFromFileName(file.name);
                    setDraft((current) =>
                      !current.title.trim() || current.title.trim() === previousFileTitle
                        ? { ...current, title: nextTitle }
                        : current,
                    );
                  }
                }}
                required
              />
              {selectedFile ? (
                <span>
                  {selectedFile.name} · {formatFileSize(selectedFile.size)}
                </span>
              ) : (
                <span>เลือกไฟล์จากเครื่อง ระบบจะอัปโหลดเข้า Google Drive ให้</span>
              )}
            </label>

            <div className={styles.modalActions}>
              <button
                type="button"
                onClick={() => {
                  setFormOpen(false);
                  setSelectedFile(null);
                  setFormError("");
                }}
              >
                ยกเลิก
              </button>
              <button type="submit" disabled={savingDocument}>
                {savingDocument ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
