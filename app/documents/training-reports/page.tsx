"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { compactPersonDisplayName } from "@/lib/person-display";
import { createClient } from "@/lib/supabase/client";
import type {
  TrainingReport,
  TrainingReportAttachment,
  TrainingReportSourceTask,
} from "@/lib/training-reports/types";
import styles from "./training-reports.module.css";

type ReportsResponse = {
  ok: boolean;
  reports?: TrainingReport[];
  currentProfile?: {
    id: string;
    full_name: string;
    role: string;
  };
  canManageAll?: boolean;
  message?: string;
};

type SourceTasksResponse = {
  ok: boolean;
  tasks?: TrainingReportSourceTask[];
  currentProfile?: {
    id: string;
    full_name: string;
    role: string;
  };
  canManageAll?: boolean;
  message?: string;
};

type CurrentProfile = {
  id: string;
  full_name: string;
  role: string;
};

type FormState = {
  id: string;
  sourceDocumentId: string;
  sourceAssignmentId: string;
  bookNumber: string;
  documentTitle: string;
  teacherProfileId: string;
  teacherNameSnapshot: string;
  mode: "individual" | "group";
  trainingType: string;
  trainingStartDate: string;
  trainingEndDate: string;
  dueDate: string;
  hours: string;
  place: string;
  organizer: string;
  objectives: string;
  summary: string;
  benefits: string;
  application: string;
  suggestions: string;
};

type ReportRow = {
  task: TrainingReportSourceTask;
  report: TrainingReport | null;
  status: "pending" | "draft" | "submitted" | "not_attended";
};

type GroupedReportRow = {
  groupKey: string;
  rows: ReportRow[];
  subject: string;
  bookNumber: string;
  documentDate: string;
  receivedDate: string;
  assignmentNote: string;
  status: "pending" | "draft" | "partial" | "submitted" | "not_attended";
  currentUserRow: ReportRow | null;
};

const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
}).format(new Date());

const PHOTO_SLOTS = [
  { slotIndex: 1, label: "รูปการอบรม" },
  { slotIndex: 2, label: "รูปการอบรม" },
  { slotIndex: 3, label: "รูปใบประกาศ" },
  { slotIndex: 4, label: "รูปใบลงทะเบียน" },
];

const emptyPhotoFiles = () => Array<File | null>(PHOTO_SLOTS.length).fill(null);
const emptyPhotoPreviews = () => Array<string>(PHOTO_SLOTS.length).fill("");
const emptyPhotoAttachments = () =>
  Array<TrainingReportAttachment | null>(PHOTO_SLOTS.length).fill(null);
const PAGE_SIZE = 20;

const emptyForm: FormState = {
  id: "",
  sourceDocumentId: "",
  sourceAssignmentId: "",
  bookNumber: "",
  documentTitle: "",
  teacherProfileId: "",
  teacherNameSnapshot: "",
  mode: "individual",
  trainingType: "ประชุม/อบรม",
  trainingStartDate: today,
  trainingEndDate: today,
  dueDate: "",
  hours: "",
  place: "",
  organizer: "",
  objectives: "",
  summary: "",
  benefits: "",
  application: "",
  suggestions: "",
};

function formatDate(value: string) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function sourceBookNumber(task: TrainingReportSourceTask) {
  return task.documentNumber || task.registrationNumber || "-";
}

function rowDateValue(row: GroupedReportRow) {
  return row.documentDate || row.receivedDate || "";
}

function reportStatusLabel(status: GroupedReportRow["status"] | ReportRow["status"]) {
  if (status === "submitted") return "รายงานแล้ว";
  if (status === "not_attended") return "ไม่เข้าร่วม";
  if (status === "partial") return "รายงานบางส่วน";
  if (status === "draft") return "รอส่งรายงาน";
  return "รอรายงาน";
}

function reportStatusClass(status: GroupedReportRow["status"] | ReportRow["status"]) {
  if (status === "submitted") return styles.statusSubmitted;
  if (status === "not_attended") return styles.statusNotAttended;
  if (status === "partial") return styles.statusPartial;
  if (status === "draft") return styles.statusDraft;
  return styles.statusPending;
}

function reportPdf(report: TrainingReport | null) {
  return report?.attachments?.find(
    (attachment) =>
      attachment.attachmentKind === "pdf" ||
      attachment.mimeType === "application/pdf" ||
      attachment.fileName.toLowerCase().endsWith(".pdf"),
  );
}

function reportPhotos(report: TrainingReport | null) {
  const photos = emptyPhotoAttachments();
  if (!report) return photos;

  for (const attachment of report.attachments) {
    if (attachment.attachmentKind !== "photo") continue;
    const index = (attachment.slotIndex || 0) - 1;
    if (index < 0 || index >= photos.length) continue;
    photos[index] = attachment;
  }

  return photos;
}

function isObjectPreview(url: string) {
  return url.startsWith("blob:");
}

function photoPreviewUrl(photo: TrainingReportAttachment | null) {
  if (!photo) return "";
  if (photo.fileId) {
    return `/api/training-reports/files/${encodeURIComponent(
      photo.fileId,
    )}/preview`;
  }

  return photo.fileUrl || "";
}

function canSubmitOwnReport(row: GroupedReportRow) {
  return Boolean(
    row.currentUserRow &&
      row.currentUserRow.status !== "submitted" &&
      row.currentUserRow.status !== "not_attended",
  );
}

function createFormFromTask(
  task: TrainingReportSourceTask,
  report?: TrainingReport | null,
): FormState {
  if (report) {
    return {
      id: report.id,
      sourceDocumentId: report.sourceDocumentId || task.bookId,
      sourceAssignmentId: report.sourceAssignmentId || task.taskId,
      bookNumber: report.bookNumber || sourceBookNumber(task),
      documentTitle: report.documentTitle || task.subject,
      teacherProfileId: report.teacherProfileId || task.assigneeId,
      teacherNameSnapshot: report.teacherNameSnapshot || task.assigneeName,
      mode: report.mode,
      trainingType: report.trainingType,
      trainingStartDate: report.trainingStartDate || today,
      trainingEndDate: report.trainingEndDate || report.trainingStartDate || today,
      dueDate: report.dueDate,
      hours: String(report.hours || ""),
      place: report.place,
      organizer: report.organizer,
      objectives: report.objectives,
      summary: report.summary,
      benefits: report.benefits,
      application: report.application,
      suggestions: report.suggestions,
    };
  }

  return {
    ...emptyForm,
    sourceDocumentId: task.bookId,
    sourceAssignmentId: task.taskId,
    bookNumber: sourceBookNumber(task),
    documentTitle: task.subject,
    teacherProfileId: task.assigneeId,
    teacherNameSnapshot: task.assigneeName,
    dueDate: "",
  };
}

export default function TrainingReportsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [reports, setReports] = useState<TrainingReport[]>([]);
  const [sourceTasks, setSourceTasks] = useState<TrainingReportSourceTask[]>([]);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [photoFiles, setPhotoFiles] = useState<Array<File | null>>(
    emptyPhotoFiles,
  );
  const [photoPreviews, setPhotoPreviews] = useState<string[]>(
    emptyPhotoPreviews,
  );
  const [photoAttachments, setPhotoAttachments] =
    useState<Array<TrainingReportAttachment | null>>(emptyPhotoAttachments);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | GroupedReportRow["status"]
  >("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [dateSort, setDateSort] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  const loadToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? "";
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const token = await loadToken();
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      const [reportsResponse, tasksResponse] = await Promise.all([
        fetch("/api/training-reports", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch("/api/training-reports/source-tasks", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      const reportsResult = (await reportsResponse.json()) as ReportsResponse;
      const tasksResult = (await tasksResponse.json()) as SourceTasksResponse;

      if (!reportsResponse.ok || !reportsResult.ok) {
        throw new Error(reportsResult.message || "โหลดรายงานไม่สำเร็จ");
      }

      if (!tasksResponse.ok || !tasksResult.ok) {
        throw new Error(tasksResult.message || "โหลดงานอ้างอิงไม่สำเร็จ");
      }

      setReports(reportsResult.reports ?? []);
      setSourceTasks(tasksResult.tasks ?? []);
      setCurrentProfile(reportsResult.currentProfile ?? tasksResult.currentProfile ?? null);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "ไม่สามารถโหลดข้อมูลรายงานได้",
      );
    } finally {
      setLoading(false);
    }
  }, [loadToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return () => {
      photoPreviews.forEach((url) => {
        if (isObjectPreview(url)) URL.revokeObjectURL(url);
      });
    };
  }, [photoPreviews]);

  const reportByTaskId = useMemo(() => {
    const map = new Map<string, TrainingReport>();
    for (const report of reports) {
      if (!report.sourceAssignmentId) continue;
      const current = map.get(report.sourceAssignmentId);
      if (!current || report.updatedAt.localeCompare(current.updatedAt) > 0) {
        map.set(report.sourceAssignmentId, report);
      }
    }
    return map;
  }, [reports]);

  const rows = useMemo<ReportRow[]>(() => {
    return sourceTasks.map((task) => {
      const report = reportByTaskId.get(task.taskId) ?? null;
      const status: ReportRow["status"] =
        report?.status === "submitted" || report?.status === "not_attended"
          ? report.status
          : report
            ? "draft"
            : "pending";

      return { task, report, status };
    });
  }, [reportByTaskId, sourceTasks]);

  const groupedRows = useMemo<GroupedReportRow[]>(() => {
    const map = new Map<string, ReportRow[]>();

    for (const row of rows) {
      const key =
        row.task.bookId ||
        `${sourceBookNumber(row.task)}:${row.task.subject}`.toLowerCase();
      map.set(key, [...(map.get(key) ?? []), row]);
    }

    return Array.from(map, ([groupKey, groupRows]) => {
      const first = groupRows[0];
      const currentUserRow =
        groupRows.find((row) => row.task.assigneeId === currentProfile?.id) ??
        null;
      const closedRows = groupRows.filter(
        (row) => row.status === "submitted" || row.status === "not_attended",
      );
      const hasDraft = groupRows.some((row) => row.status === "draft");
      const hasSubmitted = groupRows.some((row) => row.status === "submitted");
      const hasNotAttended = groupRows.some(
        (row) => row.status === "not_attended",
      );
      const status: GroupedReportRow["status"] =
        closedRows.length === groupRows.length && hasSubmitted && !hasNotAttended
          ? "submitted"
          : closedRows.length === groupRows.length && hasNotAttended && !hasSubmitted
            ? "not_attended"
            : closedRows.length > 0
              ? "partial"
              : hasDraft
                ? "draft"
                : "pending";

      return {
        groupKey,
        rows: groupRows,
        subject: first?.task.subject ?? "",
        bookNumber: first ? sourceBookNumber(first.task) : "-",
        documentDate: first?.task.documentDate ?? "",
        receivedDate: first?.task.receivedDate ?? "",
        assignmentNote: groupRows
          .map((row) => row.task.assignmentNote)
          .find(Boolean) ?? "",
        status,
        currentUserRow,
      };
    }).sort((left, right) =>
      rowDateValue(right).localeCompare(rowDateValue(left)),
    );
  }, [currentProfile?.id, rows]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((row) => {
      if (row.task.assigneeId) map.set(row.task.assigneeId, row.task.assigneeName);
    });
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    const nextRows = groupedRows.filter((row) => {
      const haystack = [
        row.subject,
        row.bookNumber,
        row.rows.map((item) => item.task.assigneeName).join(" "),
      ]
        .join(" ")
        .toLowerCase();

      if (queryText && !haystack.includes(queryText)) return false;
      if (
        statusFilter !== "all" &&
        row.status !== statusFilter &&
        !row.rows.some((item) => item.status === statusFilter)
      ) {
        return false;
      }
      if (
        assigneeFilter !== "all" &&
        !row.rows.some((item) => item.task.assigneeId === assigneeFilter)
      ) {
        return false;
      }
      return true;
    });
    return nextRows.sort((left, right) => {
      const result = rowDateValue(right).localeCompare(rowDateValue(left));
      return dateSort === "newest" ? result : -result;
    });
  }, [assigneeFilter, dateSort, groupedRows, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pendingCount = groupedRows.filter(
    (row) => row.status !== "submitted" && row.status !== "not_attended",
  ).length;
  const submittedCount = groupedRows.filter((row) => row.status === "submitted").length;
  const draftCount = groupedRows.filter((row) => row.status === "draft").length;

  useEffect(() => {
    setPage(1);
  }, [assigneeFilter, dateSort, search, statusFilter]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  function applyStatusFilter(nextStatus: "all" | GroupedReportRow["status"]) {
    setStatusFilter(nextStatus);
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("all");
    setAssigneeFilter("all");
    setDateSort("newest");
    setPage(1);
    void loadData();
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetPhotoSlots() {
    setPhotoPreviews((current) => {
      current.forEach((url) => {
        if (isObjectPreview(url)) URL.revokeObjectURL(url);
      });
      return emptyPhotoPreviews();
    });
    setPhotoFiles(emptyPhotoFiles());
    setPhotoAttachments(emptyPhotoAttachments());
  }

  function updatePhotoSlot(index: number, file: File | null) {
    setPhotoFiles((current) => {
      const next = [...current];
      next[index] = file;
      return next;
    });
    setPhotoPreviews((current) => {
      const next = [...current];
      if (isObjectPreview(next[index])) URL.revokeObjectURL(next[index]);
      next[index] = file ? URL.createObjectURL(file) : "";
      return next;
    });
    setPhotoAttachments((current) => {
      const next = [...current];
      next[index] = null;
      return next;
    });
  }

  function loadExistingPhotos(report: TrainingReport | null) {
    const photos = reportPhotos(report);
    setPhotoAttachments(photos);
    setPhotoFiles(emptyPhotoFiles());
    setPhotoPreviews((current) => {
      current.forEach((url) => {
        if (isObjectPreview(url)) URL.revokeObjectURL(url);
      });
      return photos.map(photoPreviewUrl);
    });
  }

  function removePhotoSlot(index: number) {
    updatePhotoSlot(index, null);
  }

  function openReportForm(row?: ReportRow) {
    setNotice("");
    setError("");
    resetPhotoSlots();
    setForm(row ? createFormFromTask(row.task, row.report) : emptyForm);
    if (row) loadExistingPhotos(row.report);
    setFormOpen(true);
  }

  function closeReportForm() {
    setFormOpen(false);
    resetPhotoSlots();
    setForm(emptyForm);
  }

  async function persistReport(nextStatus: "draft" | "submitted" | "not_attended") {
    setSaving(true);
    setNotice("");
    setError("");

    try {
      const token = await loadToken();
      if (!token) throw new Error("กรุณาเข้าสู่ระบบใหม่");

      const payload = new FormData();
      Object.entries(form).forEach(([key, value]) => payload.append(key, value));
      payload.set("status", nextStatus);
      payload.set(
        "existingPhotoAttachments",
        JSON.stringify(photoAttachments.filter(Boolean)),
      );
      photoFiles.forEach((file, index) => {
        if (file) payload.append(`photoSlot${index + 1}`, file);
      });

      const response = await fetch("/api/training-reports", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: payload,
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        warning?: string | null;
      };

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกรายงานไม่สำเร็จ");
      }

      setNotice(
        result.warning
          ? `${result.message || "บันทึกแล้ว"} แต่ยังปิดงานหนังสือราชการไม่สำเร็จ`
          : result.message || "บันทึกรายงานแล้ว",
      );
      closeReportForm();
      await loadData();
      window.dispatchEvent(new Event("training-reports-updated"));
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "ไม่สามารถบันทึกรายงานได้",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>▣</span>
          <div>
            <strong>รายงานผลการประชุม/อบรม</strong>
            <small>Training Reports</small>
          </div>
        </div>

        <nav className={styles.sideNav} aria-label="เมนูรายงานประชุมอบรม">
          <span>แดชบอร์ด</span>
          <span>หนังสือราชการ</span>
          <span>งานที่ได้รับมอบหมาย</span>
          <span className={styles.sideNavActive}>รายงานผลการประชุม/อบรม</span>
          <span>สถิติและรายงาน</span>
        </nav>
      </aside>

      <section className={styles.content}>
        <header className={styles.header}>
          <div>
            <h1>รายงานผลการประชุม/อบรม</h1>
            <p>ติดตามและจัดทำรายงานผลการประชุม/อบรมที่ได้รับมอบหมาย</p>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => openReportForm()}
            >
              + เพิ่มรายงาน
            </button>
          </div>
        </header>

        {(notice || error) && (
          <div className={`${styles.notice} ${error ? styles.noticeError : ""}`}>
            {error || notice}
          </div>
        )}

        <section className={styles.summaryGrid}>
          <button
            type="button"
            className={`${styles.summaryCard} ${
              statusFilter === "all" ? styles.summaryCardActive : ""
            }`}
            onClick={() => applyStatusFilter("all")}
          >
            <span className={styles.summaryGreen}>▣</span>
            <div>
              <small>ทั้งหมด</small>
              <strong>{groupedRows.length}</strong>
              <p>รายการ</p>
            </div>
          </button>
          <button
            type="button"
            className={`${styles.summaryCard} ${
              statusFilter === "pending" ? styles.summaryCardActive : ""
            }`}
            onClick={() => applyStatusFilter("pending")}
          >
            <span className={styles.summaryOrange}>⌛</span>
            <div>
              <small>รอรายงาน</small>
              <strong>{Math.max(0, pendingCount - draftCount)}</strong>
              <p>รายการ</p>
            </div>
          </button>
          <button
            type="button"
            className={`${styles.summaryCard} ${
              statusFilter === "draft" ? styles.summaryCardActive : ""
            }`}
            onClick={() => applyStatusFilter("draft")}
          >
            <span className={styles.summaryBlue}>◇</span>
            <div>
              <small>ร่างรายงาน</small>
              <strong>{draftCount}</strong>
              <p>รายการ</p>
            </div>
          </button>
          <button
            type="button"
            className={`${styles.summaryCard} ${
              statusFilter === "submitted" ? styles.summaryCardActive : ""
            }`}
            onClick={() => applyStatusFilter("submitted")}
          >
            <span className={styles.summarySuccess}>✓</span>
            <div>
              <small>รายงานแล้ว</small>
              <strong>{submittedCount}</strong>
              <p>รายการ</p>
            </div>
          </button>
        </section>

        <section className={styles.toolbar}>
          <label className={styles.searchField}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาเรื่อง หรือ เลขที่หนังสือ..."
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as typeof statusFilter)
            }
          >
            <option value="all">ทุกสถานะ</option>
            <option value="pending">รอรายงาน</option>
            <option value="draft">ร่างรายงาน</option>
            <option value="submitted">รายงานแล้ว</option>
            <option value="partial">รายงานบางส่วน</option>
            <option value="not_attended">ไม่เข้าร่วม</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
          >
            <option value="all">ผู้อบรมทั้งหมด</option>
            {assigneeOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {compactPersonDisplayName({ name: person.name })}
              </option>
            ))}
          </select>
          <select
            value={dateSort}
            onChange={(event) => setDateSort(event.target.value as typeof dateSort)}
            aria-label="เรียงตามวันที่"
          >
            <option value="newest">วันที่ล่าสุด → เก่าสุด</option>
            <option value="oldest">วันที่เก่าสุด → ล่าสุด</option>
          </select>
          <button type="button" onClick={resetFilters}>
            รีเซ็ต
          </button>
        </section>

        <section className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>ลำดับ</th>
                <th>เรื่อง</th>
                <th>เลขที่หนังสือ</th>
                <th>ผู้ประชุม/อบรม</th>
                <th>วันที่หนังสือ</th>
                <th>สถานะ</th>
                <th>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row, index) => (
                <tr key={row.groupKey}>
                  <td data-label="ลำดับ">{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td data-label="เรื่อง">
                    <a
                      className={styles.subjectLink}
                      href={`/documents?book=${encodeURIComponent(
                        row.rows[0]?.task.bookId || "",
                      )}`}
                    >
                      {row.subject}
                    </a>
                    {row.assignmentNote && <small>{row.assignmentNote}</small>}
                  </td>
                  <td data-label="เลขที่หนังสือ">{row.bookNumber}</td>
                  <td data-label="ผู้ประชุม/อบรม">
                    <div className={styles.assigneeList}>
                      {row.rows.map((item) => (
                        <span
                          key={item.task.taskId}
                          className={`${styles.assigneeChip} ${
                            item.status === "submitted"
                              ? styles.assigneeSubmitted
                              : item.status === "draft"
                                ? styles.assigneeDraft
                              : item.status === "not_attended"
                                ? styles.assigneeNotAttended
                                : styles.assigneePending
                          }`}
                        >
                          <b aria-hidden="true">
                            {item.status === "submitted"
                              ? "✓"
                              : item.status === "draft"
                                ? "◇"
                              : item.status === "not_attended"
                                ? "-"
                                : "!"}
                          </b>
                          {compactPersonDisplayName({
                            name: item.task.assigneeName || "-",
                          })}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td data-label="วันที่หนังสือ">
                    {formatDate(row.documentDate || row.receivedDate)}
                  </td>
                  <td data-label="สถานะ">
                    <span className={reportStatusClass(row.status)}>
                      {reportStatusLabel(row.status)}
                    </span>
                  </td>
                  <td data-label="จัดการ">
                    <div className={styles.actionStack}>
                      {row.rows
                        .map((item) => ({ item, pdf: reportPdf(item.report) }))
                        .filter(({ pdf }) => Boolean(pdf?.fileUrl))
                        .map(({ item, pdf }) => (
                          <a
                            key={pdf?.fileId || item.task.taskId}
                            className={styles.pdfButton}
                            href={pdf?.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            PDF{" "}
                            {compactPersonDisplayName({
                              name: item.task.assigneeName || "",
                            })}
                          </a>
                        ))}
                      {canSubmitOwnReport(row) && row.currentUserRow && (
                      <button
                        type="button"
                        className={styles.sendButton}
                        onClick={() => openReportForm(row.currentUserRow ?? undefined)}
                      >
                        ส่งรายงาน
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.empty}>
                      ยังไม่มีงานที่ถูกกำหนดให้ส่งรายงานผลการประชุม/อบรม
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredRows.length > PAGE_SIZE && (
            <div className={styles.pagination}>
              <span>
                แสดง {(page - 1) * PAGE_SIZE + 1}-
                {Math.min(page * PAGE_SIZE, filteredRows.length)} จาก{" "}
                {filteredRows.length} รายการ
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                  aria-label="หน้าก่อนหน้า"
                >
                  &lt;
                </button>
                <strong>
                  {page} / {totalPages}
                </strong>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                  disabled={page >= totalPages}
                  aria-label="หน้าถัดไป"
                >
                  &gt;
                </button>
              </div>
            </div>
          )}
        </section>
      </section>

      {formOpen && (
        <div className={styles.modalBackdrop}>
          <form
            className={styles.reportModal}
            onSubmit={(event) => {
              event.preventDefault();
              void persistReport("submitted");
            }}
          >
            <div className={styles.modalHeader}>
              <div>
                <p>แบบรายงานผลการประชุม/อบรม</p>
                <h2>{form.documentTitle || "เพิ่มรายงาน"}</h2>
              </div>
              <button type="button" onClick={closeReportForm} aria-label="ปิด">
                ×
              </button>
            </div>

            <div className={styles.formGrid}>
              <label>
                <span>เลขที่หนังสือ</span>
                <input
                  value={form.bookNumber}
                  onChange={(event) => updateField("bookNumber", event.target.value)}
                />
              </label>
              <label>
                <span>ผู้รับมอบหมาย</span>
                <input
                  value={form.teacherNameSnapshot}
                  onChange={(event) =>
                    updateField("teacherNameSnapshot", event.target.value)
                  }
                />
              </label>
              <label className={styles.full}>
                <span>เรื่อง</span>
                <input
                  value={form.documentTitle}
                  onChange={(event) =>
                    updateField("documentTitle", event.target.value)
                  }
                />
              </label>
              <label>
                <span>รูปแบบ</span>
                <select
                  value={form.mode}
                  onChange={(event) =>
                    updateField("mode", event.target.value as FormState["mode"])
                  }
                >
                  <option value="individual">รายบุคคล</option>
                  <option value="group">รายกลุ่ม</option>
                </select>
              </label>
              <label>
                <span>ประเภท</span>
                <input
                  value={form.trainingType}
                  onChange={(event) =>
                    updateField("trainingType", event.target.value)
                  }
                />
              </label>
              <label>
                <span>วันที่เริ่ม</span>
                <input
                  type="date"
                  value={form.trainingStartDate}
                  onChange={(event) =>
                    updateField("trainingStartDate", event.target.value)
                  }
                />
              </label>
              <label>
                <span>วันที่สิ้นสุด</span>
                <input
                  type="date"
                  value={form.trainingEndDate}
                  onChange={(event) =>
                    updateField("trainingEndDate", event.target.value)
                  }
                />
              </label>
              <label>
                <span>จำนวนชั่วโมง</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.hours}
                  onChange={(event) => updateField("hours", event.target.value)}
                />
              </label>
              <label>
                <span>สถานที่</span>
                <input
                  value={form.place}
                  onChange={(event) => updateField("place", event.target.value)}
                />
              </label>
              <label>
                <span>ผู้จัด</span>
                <input
                  value={form.organizer}
                  onChange={(event) => updateField("organizer", event.target.value)}
                />
              </label>
              <label className={styles.full}>
                <span>สรุปสาระสำคัญ</span>
                <textarea
                  value={form.summary}
                  onChange={(event) => updateField("summary", event.target.value)}
                />
              </label>
              <label className={styles.full}>
                <span>ประโยชน์ที่ได้รับ</span>
                <textarea
                  value={form.benefits}
                  onChange={(event) => updateField("benefits", event.target.value)}
                />
              </label>
              <label className={styles.full}>
                <span>ข้อเสนอแนะ</span>
                <textarea
                  value={form.suggestions}
                  onChange={(event) =>
                    updateField("suggestions", event.target.value)
                  }
                />
              </label>
              <fieldset className={`${styles.full} ${styles.photoFieldset}`}>
                <legend>ไฟล์แนบรูปภาพ</legend>
                <div className={styles.photoSlots}>
                  {PHOTO_SLOTS.map((slot, index) => (
                    <label key={slot.slotIndex} className={styles.photoSlot}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                          updatePhotoSlot(index, event.target.files?.[0] ?? null)
                        }
                      />
                      <span className={styles.photoBox}>
                        {photoPreviews[index] ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoPreviews[index]} alt={slot.label} />
                            <button
                              type="button"
                              className={styles.photoRemoveButton}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                removePhotoSlot(index);
                              }}
                              aria-label={`ลบ${slot.label} ${slot.slotIndex}`}
                              title="ลบรูป"
                            >
                              ×
                            </button>
                          </>
                        ) : (
                          <b>{slot.label}</b>
                        )}
                      </span>
                      <small>{slot.slotIndex}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className={styles.modalActions}>
              <button type="button" onClick={closeReportForm}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void persistReport("not_attended")}
                disabled={saving}
              >
                ไม่เข้าประชุม-อบรม
              </button>
              <button
                type="button"
                onClick={() => void persistReport("draft")}
                disabled={saving}
              >
                บันทึกร่าง
              </button>
              <button type="submit" disabled={saving}>
                {saving ? "กำลังส่ง..." : "ส่งรายงาน"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
