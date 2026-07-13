"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  STUDENT_CLASS_LEVELS,
  type StudentClassLevel,
} from "@/lib/students/settings";

type StudentRow = {
  id: string;
  student_code: string;
  full_name: string;
  class_level: string;
  class_room: string;
  status: string;
  photo_file_id?: string | null;
  photo_file_url?: string | null;
  photo_mime_type?: string | null;
  photo_uploaded_at?: string | null;
  photo_url?: string | null;
  image_url?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type StudentsResponse = {
  ok?: boolean;
  students?: StudentRow[];
  student?: StudentRow;
  message?: string;
  error?: string;
};

type StudentImportRow = {
  student_code: string;
  full_name: string;
  class_level: string;
  class_room: string;
  status: string;
};

type StudentImportResponse = {
  ok?: boolean;
  rows?: StudentImportRow[];
  students?: StudentRow[];
  count?: number;
  message?: string;
  error?: string;
};

type EditingStudent = {
  id: string;
  student_code: string;
  full_name: string;
  class_level: string;
  class_room: string;
  status: string;
};

type CropSelection = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type CropPoint = {
  x: number;
  y: number;
};

const CLASS_ROOMS = ["-", "1", "2", "3"];
const CLASS_FILTERS = ["ทั้งหมด", ...STUDENT_CLASS_LEVELS] as const;
const STATUS_FILTERS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "active", label: "กำลังเรียน" },
  { value: "transferred", label: "ย้ายออก" },
  { value: "inactive", label: "พักการเรียน" },
  { value: "graduated", label: "จบการศึกษา" },
] as const;
const SORT_OPTIONS = [
  { value: "class_code", label: "ชั้น / รหัส" },
  { value: "code", label: "รหัสนักเรียน" },
  { value: "name", label: "ชื่อ-สกุล" },
  { value: "status", label: "สถานะ" },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type ClassFilter = (typeof CLASS_FILTERS)[number];
type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];
type SortMode = (typeof SORT_OPTIONS)[number]["value"];

const blankStudent: EditingStudent = {
  id: "",
  student_code: "",
  full_name: "",
  class_level: STUDENT_CLASS_LEVELS[0],
  class_room: "-",
  status: "active",
};

function statusLabel(value: string) {
  if (value === "active") return "กำลังเรียน";
  if (value === "transferred") return "ย้ายออก";
  if (value === "inactive") return "พักการเรียน";
  if (value === "graduated") return "จบการศึกษา";
  if (value === "deleted") return "ลบแล้ว";
  return value || "-";
}

function classNameOf(student: Pick<StudentRow, "class_level" | "class_room">) {
  return shortClassLabel(student.class_level);
}

function shortClassLabel(value: string) {
  if (value === "อนุบาล 2") return "อ.2";
  if (value === "อนุบาล 3") return "อ.3";
  return value || "-";
}

function studentNo(_student: StudentRow, index: number) {
  return String(index + 1);
}

function classOrder(value: string) {
  const index = STUDENT_CLASS_LEVELS.findIndex((level) => level === value);
  return index === -1 ? STUDENT_CLASS_LEVELS.length : index;
}

function defaultAddClassLevel(value: ClassFilter): StudentClassLevel {
  return value === "ทั้งหมด" ? STUDENT_CLASS_LEVELS[0] : value;
}

function compareStudentCode(left: string, right: string) {
  return left.localeCompare(right, "th", { numeric: true, sensitivity: "base" });
}

function studentPhotoUrl(student: StudentRow, cachedUrl?: string) {
  return cachedUrl || student.photo_file_url || student.photo_url || student.image_url || student.avatar_url || "";
}

function StudentAvatar({ student, cachedUrl }: { student: StudentRow; cachedUrl?: string }) {
  const url = studentPhotoUrl(student, cachedUrl);

  return (
    <span className="mx-auto grid h-7 w-7 overflow-hidden rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-100">
      {url ? (
        <img
          src={url}
          alt={`รูป ${student.full_name}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="grid h-full w-full place-items-center" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21a8 8 0 0 0-16 0" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </span>
      )}
    </span>
  );
}

export default function StudentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const cropAreaRef = useRef<HTMLDivElement | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [query, setQuery] = useState("");
  const [activeClassLevel, setActiveClassLevel] = useState<ClassFilter>("ทั้งหมด");
  const [roomFilter, setRoomFilter] = useState("ทั้งหมด");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("class_code");
  const [editing, setEditing] = useState<EditingStudent | null>(null);
  const [mode, setMode] = useState<"add" | "edit" | "move" | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<StudentImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [studentPhotoFile, setStudentPhotoFile] = useState<File | null>(null);
  const [studentPhotoPreviewUrl, setStudentPhotoPreviewUrl] = useState("");
  const [studentPhotoUrls, setStudentPhotoUrls] = useState<Record<string, string>>({});
  const [cropSourceUrl, setCropSourceUrl] = useState("");
  const [cropSourceName, setCropSourceName] = useState("");
  const [cropSelection, setCropSelection] = useState<CropSelection>({ x: 10, y: 10, width: 80, height: 80 });
  const [cropDragStart, setCropDragStart] = useState<CropPoint | null>(null);
  const [message, setMessage] = useState("");

  const fetchJson = useCallback(async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
    const { data: { session } } = await supabase.auth.getSession();

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);

    const response = await fetch(url, { ...options, headers, cache: "no-store" });
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : { message: await response.text() };

    if (!response.ok) throw new Error(data?.message || data?.error || "ทำรายการไม่สำเร็จ");
    return data as T;
  }, [supabase]);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (activeClassLevel !== "ทั้งหมด") params.set("classLevel", activeClassLevel);
      if (roomFilter !== "ทั้งหมด") params.set("classRoom", roomFilter);

      const data = await fetchJson<StudentsResponse>(`/api/students?${params.toString()}`);
      setStudents(data.students ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "โหลดข้อมูลนักเรียนไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [activeClassLevel, fetchJson, query, roomFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadStudents(); }, 180);
    return () => window.clearTimeout(timer);
  }, [loadStudents]);

  useEffect(() => {
    const fileIds = Array.from(new Set(students.map((student) => student.photo_file_id).filter(Boolean) as string[]));
    let cancelled = false;
    const createdUrls: string[] = [];

    if (fileIds.length === 0) {
      setStudentPhotoUrls((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return {};
      });
      return () => undefined;
    }

    async function loadPhotoUrls() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const entries = await Promise.all(fileIds.map(async (fileId) => {
        try {
          const response = await fetch(`/api/students/photo?fileId=${encodeURIComponent(fileId)}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
            cache: "no-store",
          });
          if (!response.ok) return null;

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          return [fileId, objectUrl] as const;
        } catch {
          return null;
        }
      }));

      if (cancelled) {
        createdUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setStudentPhotoUrls((current) => {
        Object.values(current).forEach((url) => URL.revokeObjectURL(url));
        return Object.fromEntries(entries.filter(Boolean) as Array<readonly [string, string]>);
      });
    }

    void loadPhotoUrls();

    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [students, supabase]);

  useEffect(() => {
    return () => {
      if (studentPhotoPreviewUrl) URL.revokeObjectURL(studentPhotoPreviewUrl);
      if (cropSourceUrl) URL.revokeObjectURL(cropSourceUrl);
    };
  }, [cropSourceUrl, studentPhotoPreviewUrl]);

  const visibleStudents = useMemo(() => {
    const filtered = statusFilter === "all"
      ? students
      : students.filter((student) => student.status === statusFilter);

    return [...filtered].sort((left, right) => {
      if (sortMode === "name") {
        return (
          left.full_name.localeCompare(right.full_name, "th") ||
          compareStudentCode(left.student_code, right.student_code)
        );
      }

      if (sortMode === "status") {
        return (
          statusLabel(left.status).localeCompare(statusLabel(right.status), "th") ||
          classOrder(left.class_level) - classOrder(right.class_level) ||
          compareStudentCode(left.student_code, right.student_code)
        );
      }

      if (sortMode === "code") {
        return compareStudentCode(left.student_code, right.student_code);
      }

      return (
        classOrder(left.class_level) - classOrder(right.class_level) ||
        compareStudentCode(left.student_code, right.student_code) ||
        left.full_name.localeCompare(right.full_name, "th")
      );
    });
  }, [sortMode, statusFilter, students]);

  function startAdd() {
    setEditing({ ...blankStudent, class_level: defaultAddClassLevel(activeClassLevel) });
    clearSelectedStudentPhoto();
    setMode("add");
    setMessage("");
  }

  function startEdit(student: StudentRow) {
    setEditing({
      id: student.id,
      student_code: student.student_code || "",
      full_name: student.full_name || "",
      class_level: student.class_level || STUDENT_CLASS_LEVELS[0],
      class_room: student.class_room || "-",
      status: student.status || "active",
    });
    clearSelectedStudentPhoto();
    setMode("edit");
    setMessage("");
  }

  function startMove(student: StudentRow) {
    setEditing({
      id: student.id,
      student_code: student.student_code || "",
      full_name: student.full_name || "",
      class_level: student.class_level || STUDENT_CLASS_LEVELS[0],
      class_room: student.class_room || "-",
      status: student.status || "active",
    });
    clearSelectedStudentPhoto();
    setMode("move");
    setMessage("");
  }

  function closeForm() {
    setEditing(null);
    clearSelectedStudentPhoto();
    setMode(null);
  }

  function clearSelectedStudentPhoto() {
    setStudentPhotoFile(null);
    setStudentPhotoPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    closePhotoCrop();
  }

  function closePhotoCrop() {
    setCropSourceUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
    setCropSourceName("");
    setCropSelection({ x: 10, y: 10, width: 80, height: 80 });
    setCropDragStart(null);
  }

  function beginStudentPhotoCrop(file: File | null | undefined) {
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setMessage("รองรับเฉพาะรูป JPG, PNG และ WEBP");
      return;
    }

    setCropSourceUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    setCropSourceName(file.name);
    setCropSelection({ x: 10, y: 10, width: 80, height: 80 });
    setCropDragStart(null);
  }

  function getCropPoint(event: PointerEvent<HTMLDivElement>): CropPoint | null {
    const rect = cropAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  }

  function selectionFromDrag(start: CropPoint, end: CropPoint): CropSelection {
    const rect = cropAreaRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return cropSelection;

    const startX = (start.x / 100) * rect.width;
    const startY = (start.y / 100) * rect.height;
    const endX = (end.x / 100) * rect.width;
    const endY = (end.y / 100) * rect.height;
    const side = Math.max(24, Math.max(Math.abs(endX - startX), Math.abs(endY - startY)));
    const left = clamp(endX >= startX ? startX : startX - side, 0, Math.max(0, rect.width - side));
    const top = clamp(endY >= startY ? startY : startY - side, 0, Math.max(0, rect.height - side));
    const limitedSide = Math.min(side, rect.width - left, rect.height - top);

    return {
      x: (left / rect.width) * 100,
      y: (top / rect.height) * 100,
      width: (limitedSide / rect.width) * 100,
      height: (limitedSide / rect.height) * 100,
    };
  }

  function handleCropPointerDown(event: PointerEvent<HTMLDivElement>) {
    const point = getCropPoint(event);
    if (!point) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    setCropDragStart(point);
  }

  function handleCropPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!cropDragStart) return;

    const point = getCropPoint(event);
    if (!point) return;

    event.preventDefault();
    setCropSelection(selectionFromDrag(cropDragStart, point));
  }

  function handleCropPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setCropDragStart(null);
  }

  async function confirmStudentPhotoCrop() {
    if (!cropSourceUrl) return;

    try {
      const croppedFile = await createCroppedPhotoFile(cropSourceUrl, cropSourceName, cropSelection);

      setStudentPhotoPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(croppedFile);
      });
      setStudentPhotoFile(croppedFile);
      closePhotoCrop();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ครอบรูปไม่สำเร็จ");
    }
  }

  async function createCroppedPhotoFile(
    sourceUrl: string,
    sourceName: string,
    crop: CropSelection,
  ) {
    const image = await loadImage(sourceUrl);
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("เบราว์เซอร์ไม่รองรับการครอบรูป");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size, size);

    const cropX = Math.round((crop.x / 100) * image.naturalWidth);
    const cropY = Math.round((crop.y / 100) * image.naturalHeight);
    const cropWidth = Math.max(1, Math.round((crop.width / 100) * image.naturalWidth));
    const cropHeight = Math.max(1, Math.round((crop.height / 100) * image.naturalHeight));

    context.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, size, size);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.82);
    });

    if (!blob) throw new Error("ลดขนาดรูปไม่สำเร็จ");

    const cleanName = sourceName.replace(/\.[^.]+$/, "") || "student-photo";
    return new File([blob], `${cleanName}-crop.jpg`, { type: "image/jpeg" });
  }

  function loadImage(sourceUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
      image.src = sourceUrl;
    });
  }

  function updateEditing(key: keyof EditingStudent, value: string) {
    setEditing((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveStudent() {
    if (!editing) return;

    setSaving(true);
    setMessage("");

    const payload = {
      student_code: editing.student_code.trim(),
      full_name: editing.full_name.trim(),
      class_level: editing.class_level,
      class_room: editing.class_room || "-",
      status: editing.status || "active",
    };

    try {
      const url = mode === "add" ? "/api/students" : `/api/students/${editing.id}`;
      const method = mode === "add" ? "POST" : "PUT";
      const data = await fetchJson<StudentsResponse>(url, { method, body: JSON.stringify(payload) });
      const savedStudentId = data.student?.id || editing.id;
      if (studentPhotoFile && savedStudentId) {
        await uploadStudentPhoto(savedStudentId, studentPhotoFile);
      }
      setMessage(data.message || "บันทึกข้อมูลแล้ว");
      closeForm();
      await loadStudents();
      window.setTimeout(() => setMessage(""), 2200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "บันทึกข้อมูลไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function deleteStudent(studentId: string) {
    if (!confirm("ลบนักเรียนคนนี้หรือไม่")) return;

    setSaving(true);
    setMessage("");

    try {
      const data = await fetchJson<StudentsResponse>(`/api/students/${studentId}`, { method: "DELETE" });
      setMessage(data.message || "ลบนักเรียนแล้ว");
      await loadStudents();
      window.setTimeout(() => setMessage(""), 2200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ลบนักเรียนไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function uploadStudentPhoto(studentId: string, file: File) {
    const formData = new FormData();
    formData.set("studentId", studentId);
    formData.set("file", file);

    await fetchJson("/api/students/photo", {
      method: "POST",
      body: formData,
    });
  }

  async function previewImport() {
    if (!importFile) {
      setMessage("กรุณาเลือกไฟล์รายชื่อนักเรียนก่อน");
      return;
    }

    setImporting(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("defaultClassLevel", defaultAddClassLevel(activeClassLevel));

      const data = await fetchJson<StudentImportResponse>("/api/students/import", {
        method: "POST",
        body: formData,
      });

      setImportRows(data.rows ?? []);
      setMessage(`ตรวจพบรายชื่อ ${data.count ?? data.rows?.length ?? 0} คน`);
    } catch (error) {
      setImportRows([]);
      setMessage(error instanceof Error ? error.message : "อ่านไฟล์นำเข้าไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  }

  async function saveImportRows() {
    if (importRows.length === 0) {
      setMessage("ยังไม่มีรายการพรีวิวสำหรับนำเข้า");
      return;
    }

    setImporting(true);
    setMessage("");

    try {
      const data = await fetchJson<StudentImportResponse>("/api/students/import?commit=1", {
        method: "POST",
        body: JSON.stringify({ rows: importRows }),
      });

      setMessage(data.message || `นำเข้ารายชื่อนักเรียนแล้ว ${data.count ?? importRows.length} คน`);
      setImportRows([]);
      setImportFile(null);
      await loadStudents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "นำเข้ารายชื่อนักเรียนไม่สำเร็จ");
    } finally {
      setImporting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#fbf7ef] px-2 py-2 sm:px-4 sm:py-4 lg:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-none flex-col gap-2 xl:max-w-7xl">
        <header className="rounded-[24px] border border-orange-100 bg-white/85 px-3 py-3 shadow-sm">
          <div className="flex flex-col gap-2">
            <h1 className="text-[19px] font-semibold leading-tight text-orange-800">ข้อมูลนักเรียน</h1>
            <div className="flex w-full items-center gap-1">
              <label className="grid h-7 w-[64px] cursor-pointer place-items-center rounded-md border border-emerald-100 bg-white px-1 text-[11px] font-medium text-slate-900">
                เลือกไฟล์
                <input
                  type="file"
                  accept=".docx,.txt,.csv"
                  onChange={(event) => {
                    setImportFile(event.target.files?.[0] ?? null);
                    setImportRows([]);
                  }}
                  className="sr-only"
                  title="นำเข้าไฟล์"
                />
              </label>
              <button type="button" onClick={() => void previewImport()} disabled={importing || !importFile} className="h-7 rounded-md bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700 disabled:opacity-50 sm:px-2">
                ตรวจ
              </button>
              <button type="button" onClick={() => void saveImportRows()} disabled={importing || importRows.length === 0} className="ml-auto h-7 rounded-md bg-emerald-600 px-1.5 text-[11px] font-medium text-white disabled:opacity-50 sm:px-2">
                นำเข้า
              </button>
              <button type="button" onClick={startAdd} className="h-7 rounded-md bg-orange-500 px-2 text-[11px] font-medium text-white sm:h-8 sm:px-2.5 sm:text-[12px]">
                + เพิ่ม
              </button>
            </div>
          </div>
        </header>

        {message ? (
          <div className="rounded-2xl bg-blue-50 px-3 py-2 text-[12px] font-medium text-blue-700 ring-1 ring-blue-100">
            {message}
          </div>
        ) : null}

        <section className="rounded-[22px] border border-orange-100 bg-white/85 p-1.5 shadow-sm sm:p-2">
          <div className="grid grid-cols-9 gap-0.5 lg:gap-1">
            {CLASS_FILTERS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setActiveClassLevel(level)}
                className={`h-5 rounded px-0 text-[9px] font-medium leading-none transition sm:text-[10px] lg:h-8 lg:rounded-lg lg:text-[11px] ${
                  activeClassLevel === level
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-orange-50 text-orange-800 hover:bg-orange-100"
                }`}
              >
                {level === "ทั้งหมด" ? "ทั้งหมด" : shortClassLabel(level)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 grid grid-cols-[92px_58px_72px_minmax(0,1fr)] gap-0.5 sm:grid-cols-[120px_70px_88px_minmax(0,1fr)] sm:gap-1 lg:grid-cols-[1fr_96px_120px_140px]">
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-7 min-w-0 rounded-md border border-orange-100 bg-white px-1.5 text-[11px] outline-none focus:border-orange-300 lg:h-8 lg:rounded-lg lg:px-2 lg:text-[12px]" placeholder="ค้นหา" />
            <select value={roomFilter} onChange={(event) => setRoomFilter(event.target.value)} className="h-7 min-w-0 rounded-md border border-orange-100 bg-white px-0.5 text-[10px] outline-none focus:border-orange-300 lg:h-8 lg:rounded-lg lg:px-1.5 lg:text-[11px]">
              <option value="ทั้งหมด">ทุกห้อง</option>
              {CLASS_ROOMS.map((room) => <option key={room} value={room}>ห้อง {room}</option>)}
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-7 min-w-0 rounded-md border border-orange-100 bg-white px-0.5 text-[10px] outline-none focus:border-orange-300 lg:h-8 lg:rounded-lg lg:px-1.5 lg:text-[11px]">
              {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="h-7 min-w-0 rounded-md border border-orange-100 bg-white px-0.5 text-[10px] outline-none focus:border-orange-300 lg:h-8 lg:rounded-lg lg:px-1.5 lg:text-[11px]">
              {SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>เรียง: {item.label}</option>)}
            </select>
          </div>
        </section>

        <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[30px_30px_minmax(0,1fr)_42px_66px] items-center gap-1 bg-slate-50 px-1.5 py-1.5 text-[10px] font-semibold text-slate-600 lg:grid-cols-[44px_44px_1fr_76px_112px] lg:px-2 lg:text-[11px]">
            <span className="text-center">เลขที่</span>
            <span className="text-center">รูป</span>
            <span>ชื่อ-นามสกุล</span>
            <span className="text-center">ชั้น</span>
            <span className="text-right">จัดการ</span>
          </div>
          {loading ? (
            <div className="p-4 text-sm text-slate-600">กำลังโหลดข้อมูล...</div>
          ) : visibleStudents.length === 0 ? (
            <div className="p-4 text-sm text-slate-600">ยังไม่มีข้อมูลนักเรียน</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleStudents.map((student, index) => (
                <div key={student.id} className="grid grid-cols-[30px_30px_minmax(0,1fr)_42px_66px] items-center gap-1 px-1.5 py-1 lg:grid-cols-[44px_44px_1fr_76px_112px] lg:px-2">
                  <span className="text-center text-[11px] text-slate-500">{studentNo(student, index)}</span>
                  <StudentAvatar student={student} cachedUrl={student.photo_file_id ? studentPhotoUrls[student.photo_file_id] : undefined} />
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-normal leading-tight text-slate-900 lg:text-[12px]">{student.full_name}</p>
                  </div>
                  <span className="truncate rounded-full bg-blue-50 px-1 py-0.5 text-center text-[10px] text-blue-700 lg:text-[11px]">{classNameOf(student)}</span>
                  <div className="flex justify-end gap-0.5 lg:gap-1">
                    <button type="button" onClick={() => startEdit(student)} className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-[10px] text-slate-700" title="แก้ไข">✎</button>
                    <button type="button" onClick={() => startMove(student)} className="grid h-6 w-6 place-items-center rounded-md bg-amber-50 text-[10px] text-amber-700" title="ย้าย">⇄</button>
                    <button type="button" onClick={() => void deleteStudent(student.id)} className="grid h-6 w-6 place-items-center rounded-md bg-rose-50 text-[11px] text-rose-700" title="ลบ">×</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
      {editing && mode ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/35 px-3 py-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-lg rounded-[22px] border border-orange-100 bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-orange-800">
                {mode === "add" ? "เพิ่มนักเรียน" : mode === "move" ? "ย้ายนักเรียน" : "แก้ไขนักเรียน"}
              </h2>
              <button type="button" onClick={closeForm} className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs text-slate-600">×</button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <label className="col-span-2 text-[11px] text-slate-600">รูปนักเรียน
                <div className="mt-1 flex items-center gap-2">
                  <span className="grid h-10 w-10 shrink-0 overflow-hidden rounded-full bg-orange-50 text-orange-600 ring-1 ring-orange-100">
                    {studentPhotoPreviewUrl ? (
                      <img src={studentPhotoPreviewUrl} alt="รูปที่ครอบแล้ว" className="h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21a8 8 0 0 0-16 0" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </span>
                    )}
                  </span>
                  <span className="grid h-8 cursor-pointer place-items-center rounded-lg border border-slate-200 bg-white px-2 text-[12px] text-slate-700">
                    เลือกรูป
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(event) => {
                        beginStudentPhotoCrop(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                      className="sr-only"
                    />
                  </span>
                  <span className="min-w-0 truncate text-[11px] text-slate-500">
                    {studentPhotoFile ? "ครอบรูปแล้ว" : "ยังไม่เลือกรูป"}
                  </span>
                </div>
                <span className="mt-1 block text-[10px] text-slate-400">บันทึกเฉพาะรูปที่ครอบแล้ว เพื่อลดขนาดไฟล์ก่อนส่งขึ้น Drive</span>
              </label>
              <label className="text-[11px] text-slate-600">เลขประจำตัว
                <input value={editing.student_code} onChange={(event) => updateEditing("student_code", event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px]" />
              </label>
              <label className="text-[11px] text-slate-600">สถานะ
                <select value={editing.status} onChange={(event) => updateEditing("status", event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px]">
                  <option value="active">กำลังเรียน</option>
                  <option value="transferred">ย้ายออก</option>
                  <option value="inactive">พักการเรียน</option>
                  <option value="graduated">จบการศึกษา</option>
                </select>
              </label>
              <label className="col-span-2 text-[11px] text-slate-600">ชื่อ-สกุล
                <input value={editing.full_name} onChange={(event) => updateEditing("full_name", event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px]" />
              </label>
              <label className="text-[11px] text-slate-600">ชั้น
                <select value={editing.class_level} onChange={(event) => updateEditing("class_level", event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px]">
                  {STUDENT_CLASS_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
              </label>
              <label className="text-[11px] text-slate-600">ห้อง
                <select value={editing.class_room} onChange={(event) => updateEditing("class_room", event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-slate-200 px-2 text-[12px]">
                  {CLASS_ROOMS.map((room) => <option key={room} value={room}>{room}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closeForm} className="h-8 rounded-lg bg-slate-100 px-3 text-[12px] text-slate-600">
                ยกเลิก
              </button>
              <button type="button" onClick={() => void saveStudent()} disabled={saving} className="h-8 rounded-lg bg-orange-500 px-3 text-[12px] font-medium text-white disabled:opacity-50">
                บันทึก
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {cropSourceUrl ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/45 px-3 py-4">
          <section role="dialog" aria-modal="true" className="w-full max-w-sm rounded-[22px] bg-white p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-orange-800">ครอบรูปนักเรียน</h2>
              <button type="button" onClick={closePhotoCrop} className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs text-slate-600">×</button>
            </div>

            <div
              ref={cropAreaRef}
              onPointerDown={handleCropPointerDown}
              onPointerMove={handleCropPointerMove}
              onPointerUp={handleCropPointerUp}
              onPointerCancel={handleCropPointerUp}
              className="relative mx-auto max-h-[62vh] w-full touch-none select-none overflow-hidden rounded-xl bg-slate-100"
            >
              <img
                src={cropSourceUrl}
                alt="รูปสำหรับครอบ"
                draggable={false}
                className="mx-auto block max-h-[62vh] w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-0 bg-slate-950/25" />
              <div
                className="pointer-events-none absolute rounded-full border-2 border-white shadow-[0_0_0_9999px_rgba(15,23,42,0.35)] ring-2 ring-orange-400"
                style={{
                  left: `${cropSelection.x}%`,
                  top: `${cropSelection.y}%`,
                  width: `${cropSelection.width}%`,
                  height: `${cropSelection.height}%`,
                }}
              />
            </div>

            <p className="mt-2 text-center text-[11px] text-slate-500">ลากบนรูปเพื่อเลือกบริเวณที่ต้องการ</p>

            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={closePhotoCrop} className="h-8 rounded-lg bg-slate-100 px-3 text-[12px] text-slate-600">
                ยกเลิก
              </button>
              <button type="button" onClick={() => void confirmStudentPhotoCrop()} className="h-8 rounded-lg bg-orange-500 px-3 text-[12px] font-medium text-white">
                ใช้รูปนี้
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
