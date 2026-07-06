"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCachedProfileImageUrl } from "@/lib/profile-image-cache";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

type TaskItem = {
  id: string;
  assigneeId: string | null;
  assigneeName: string;
  status: string;
};

type AttachmentItem = {
  id: string;
  fileName: string;
  mimeType: string;
  attachmentType: "original" | "signed";
  openUrl: string;
  hasDriveFile: boolean;
};

type BookItem = {
  id: string;
  legacySmartAreaId: string;
  registrationNumber: string;
  receivedDate: string;
  sourceAgency: string;
  subject: string;
  documentNumber: string;
  documentDate: string;
  documentType: string;
  urgency: string;
  status: string;
  note: string;
  directorNote: string;
  smartAreaPage: number;
  smartAreaOrder: number;
  sourceUrl: string;
  updatedAt: string;
  tasks: TaskItem[];
  attachments: AttachmentItem[];
};

type Capabilities = {
  canSubmit: boolean;
  canAssign: boolean;
  canClose: boolean;
};

type Assignee = {
  id: string;
  fullName: string;
  position: string;
  role: string;
};

type DocumentsResponse = {
  ok: boolean;
  books?: BookItem[];
  accessMode?: "all" | "assigned";
  canManageAll?: boolean;
  capabilities?: Capabilities;
  message?: string;
};

type AssigneesResponse = {
  ok: boolean;
  assignees?: Assignee[];
  message?: string;
};

type ProfileSummary = {
  fullName: string;
  position: string;
  profileImageFileId: string;
};

type SortMode = "newest" | "oldest" | "registration";
type ViewMode = "current" | "archive";

const statusLabels: Record<string, string> = {
  clerk_review: "รอธุรการตรวจ",
  director_review: "รอ ผอ. พิจารณา",
  assigned: "มอบหมายแล้ว",
  in_progress: "กำลังดำเนินการ",
  done: "เสร็จแล้ว",
};

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getStatusLabel(status: string) {
  return statusLabels[status] || status || "-";
}

function registrationValue(value: string) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

function shortThaiName(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "-";

  const withoutTitle = trimmed.replace(
    /^(นาย|นางสาว|นาง|น\.ส\.|ดร\.|ผอ\.|รองผอ\.|ว่าที่ร้อยตรี|ว่าที่ ร\.ต\.)\s*/,
    "",
  );
  return withoutTitle.split(/\s+/)[0] || trimmed;
}

function displayAttachmentName(fileName: string, index: number) {
  const trimmed = String(fileName || "").trim();

  if (!trimmed || trimmed.length > 42) {
    return `ไฟล์แนบ ${index + 1}`;
  }

  return trimmed;
}

export default function DocumentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [profileSummary, setProfileSummary] = useState<ProfileSummary>({
    fullName: "",
    position: "",
    profileImageFileId: "",
  });
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [viewMode, setViewMode] = useState<ViewMode>("current");
  const [accessMode, setAccessMode] = useState<"all" | "assigned">("assigned");
  const [canManageAll, setCanManageAll] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    canSubmit: false,
    canAssign: false,
    canClose: false,
  });
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [editingBook, setEditingBook] = useState<BookItem | null>(null);
  const [selectedBook, setSelectedBook] = useState<BookItem | null>(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [workloadCollapsed, setWorkloadCollapsed] = useState(false);
  const [selectedSmartAreaPage, setSelectedSmartAreaPage] = useState<number | null>(null);

  const sessionToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return "";
    }

    setCurrentUserId(session.user.id);
    return session.access_token;
  }, [router, supabase]);

  const loadProfileSummary = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("full_name, position, profile_image_file_id")
      .eq("id", user.id)
      .single();

    if (!data) return;

    const nextProfile = {
      fullName: String(data.full_name || ""),
      position: String(data.position || ""),
      profileImageFileId: String(data.profile_image_file_id || ""),
    };

    setProfileSummary(nextProfile);

    if (!nextProfile.profileImageFileId) {
      setProfileImageUrl("");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    try {
      const imageUrl = await getCachedProfileImageUrl(
        nextProfile.profileImageFileId,
        session?.access_token,
      );
      setProfileImageUrl(imageUrl);
    } catch {
      setProfileImageUrl("");
    }
  }, [supabase]);

  const loadBooks = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const token = await sessionToken();
      if (!token) return;

      const response = await fetch("/api/documents", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as DocumentsResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถโหลดรายการหนังสือราชการได้");
      }

      const loadedBooks = result.books ?? [];
      setBooks(loadedBooks);

      const sourcePages = loadedBooks
        .map((book) => Number(book.smartAreaPage || 0))
        .filter((value) => value > 0);

      if (sourcePages.length > 0) {
        setSelectedSmartAreaPage((current) =>
          current && sourcePages.includes(current)
            ? current
            : Math.max(...sourcePages),
        );
      }

      setAccessMode(result.accessMode ?? "assigned");
      setCanManageAll(result.canManageAll === true);
      setCapabilities(
        result.capabilities ?? {
          canSubmit: false,
          canAssign: false,
          canClose: false,
        },
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  const loadAssignees = useCallback(async () => {
    if (!capabilities.canAssign) return;

    const token = await sessionToken();
    if (!token) return;

    const response = await fetch("/api/documents/assignees", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as AssigneesResponse;

    if (response.ok && result.ok) {
      setAssignees(result.assignees ?? []);
    }
  }, [capabilities.canAssign, sessionToken]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  useEffect(() => {
    void loadProfileSummary();
  }, [loadProfileSummary]);

  useEffect(() => {
    void loadAssignees();
  }, [loadAssignees]);

  async function postAction(payload: Record<string, unknown>, key: string) {
    setSavingKey(key);
    setMessage("");
    setSuccessMessage("");

    try {
      const token = await sessionToken();
      if (!token) return false;

      const response = await fetch("/api/documents/actions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถดำเนินการได้");
      }

      setSuccessMessage("บันทึกการดำเนินการเรียบร้อยแล้ว");
      await loadBooks();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
      return false;
    } finally {
      setSavingKey("");
    }
  }

  async function updateTaskStatus(taskId: string, status: string) {
    setSavingKey(taskId);
    setMessage("");
    setSuccessMessage("");

    try {
      const token = await sessionToken();
      if (!token) return;

      const response = await fetch("/api/documents/tasks", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, status }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ไม่สามารถเปลี่ยนสถานะงานได้");
      }

      setSuccessMessage("อัปเดตสถานะงานเรียบร้อยแล้ว");
      await loadBooks();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "เกิดข้อผิดพลาด");
    } finally {
      setSavingKey("");
    }
  }

  function openAssignment(book: BookItem) {
    setEditingBook(book);
    setSelectedAssigneeIds(
      book.tasks.map((task) => task.assigneeId).filter(Boolean) as string[],
    );
    setActionNote(book.directorNote || "");
  }

  async function saveAssignment() {
    if (!editingBook) return;

    const ok = await postAction(
      {
        action: "assign",
        bookId: editingBook.id,
        assigneeIds: selectedAssigneeIds,
        note: actionNote,
      },
      `assign:${editingBook.id}`,
    );

    if (ok) setEditingBook(null);
  }

  const summary = useMemo(() => {
    const pendingReview = books.filter(
      (book) =>
        book.status === "clerk_review" || book.status === "director_review",
    ).length;
    const activeWork = books.filter(
      (book) => book.status === "assigned" || book.status === "in_progress",
    ).length;
    const done = books.filter((book) => book.status === "done").length;

    return {
      all: books.length,
      pendingReview,
      activeWork,
      done,
    };
  }, [books]);

  const workload = useMemo(
    () =>
      Object.entries(statusLabels).map(([status, label]) => ({
        status,
        label,
        count: books.filter((book) => book.status === status).length,
      })),
    [books],
  );

  const availableSmartAreaPages = useMemo(
    () =>
      Array.from(
        new Set(
          books
            .map((book) => Number(book.smartAreaPage || 0))
            .filter((value) => value > 0),
        ),
      ).sort((left, right) => left - right),
    [books],
  );

  const latestSmartAreaPage =
    availableSmartAreaPages[availableSmartAreaPages.length - 1] ?? null;

  const selectedPageIndex =
    selectedSmartAreaPage === null
      ? -1
      : availableSmartAreaPages.indexOf(selectedSmartAreaPage);

  const visibleSmartAreaPages = useMemo(() => {
    if (availableSmartAreaPages.length <= 5) return availableSmartAreaPages;

    const activeIndex =
      selectedPageIndex >= 0
        ? selectedPageIndex
        : availableSmartAreaPages.length - 1;
    const start = Math.min(
      Math.max(activeIndex - 2, 0),
      availableSmartAreaPages.length - 5,
    );

    return availableSmartAreaPages.slice(start, start + 5);
  }, [availableSmartAreaPages, selectedPageIndex]);

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th");

    const result = books.filter((book) => {
      const inSelectedView =
        viewMode === "archive" ? book.status === "done" : book.status !== "done";

      if (!inSelectedView) return false;
      if (
        selectedSmartAreaPage !== null &&
        Number(book.smartAreaPage || 0) !== selectedSmartAreaPage
      ) {
        return false;
      }
      if (statusFilter !== "all" && book.status !== statusFilter) return false;

      if (!normalized) return true;

      return [
        book.subject,
        book.sourceAgency,
        book.registrationNumber,
        book.documentNumber,
        book.documentType,
        book.smartAreaPage ? `หน้า ${book.smartAreaPage}` : "",
        book.tasks.map((task) => task.assigneeName).join(" "),
      ].some((value) => value.toLocaleLowerCase("th").includes(normalized));
    });

    return [...result].sort((left, right) => {
      const pageDifference =
        Number(left.smartAreaPage || 0) - Number(right.smartAreaPage || 0);

      if (pageDifference !== 0) return pageDifference;

      const orderDifference =
        Number(left.smartAreaOrder || 0) - Number(right.smartAreaOrder || 0);

      if (orderDifference !== 0) return orderDifference;

      return (
        registrationValue(left.registrationNumber) -
        registrationValue(right.registrationNumber)
      );
    });
  }, [
    books,
    query,
    selectedSmartAreaPage,
    statusFilter,
    viewMode,
  ]);

  useEffect(() => {
    setSelectedBook(null);
  }, [query, selectedSmartAreaPage, statusFilter, viewMode]);

  useEffect(() => {
    if (
      availableSmartAreaPages.length > 0 &&
      (selectedSmartAreaPage === null ||
        !availableSmartAreaPages.includes(selectedSmartAreaPage))
    ) {
      setSelectedSmartAreaPage(
        availableSmartAreaPages[availableSmartAreaPages.length - 1],
      );
    }
  }, [availableSmartAreaPages, selectedSmartAreaPage]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroBrand}>
          <div className={styles.heroProfile}>
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={profileSummary.fullName || "รูปโปรไฟล์"}
              />
            ) : (
              <span>
                {(profileSummary.fullName || "ผู้").trim().charAt(0)}
              </span>
            )}
          </div>
          <div>
            <p className={styles.heroEyebrow}>SMART AREA</p>
            <h1>หนังสือราชการ</h1>
            <p className={styles.heroUserName}>
              {profileSummary.fullName || "กำลังโหลดข้อมูลผู้ใช้"}
            </p>
            <p className={styles.heroPosition}>
              {profileSummary.position || "ไม่ระบุตำแหน่ง"}
            </p>
          </div>
        </div>

        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => void loadBooks()}
          disabled={loading}
        >
          <span aria-hidden="true">↻</span>
          {loading ? "กำลังโหลด..." : "โหลดข้อมูลใหม่"}
        </button>
      </section>

      <section className={styles.summaryGrid}>
        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryAll}`}
          onClick={() => {
            setViewMode("current");
            setStatusFilter("all");
          }}
        >
          <span className={styles.summaryIcon}>▤</span>
          <span>
            <small>หนังสือทั้งหมด</small>
            <strong>{summary.all}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryPending}`}
          onClick={() => {
            setViewMode("current");
            setStatusFilter("director_review");
          }}
        >
          <span className={styles.summaryIcon}>◉</span>
          <span>
            <small>รอพิจารณา</small>
            <strong>{summary.pendingReview}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryProgress}`}
          onClick={() => {
            setViewMode("current");
            setStatusFilter("in_progress");
          }}
        >
          <span className={styles.summaryIcon}>◷</span>
          <span>
            <small>กำลังดำเนินการ</small>
            <strong>{summary.activeWork}</strong>
          </span>
        </button>

        <button
          type="button"
          className={`${styles.summaryCard} ${styles.summaryDone}`}
          onClick={() => {
            setViewMode("archive");
            setStatusFilter("all");
          }}
        >
          <span className={styles.summaryIcon}>✓</span>
          <span>
            <small>เสร็จแล้ว</small>
            <strong>{summary.done}</strong>
          </span>
        </button>
      </section>

      <section
        className={`${styles.workspace} ${
          workloadCollapsed ? styles.workspaceCollapsed : ""
        }`}
      >
        <div className={styles.mainPanel}>
          <div className={styles.viewTabs}>
            <button
              type="button"
              className={viewMode === "current" ? styles.activeTab : ""}
              onClick={() => {
                setViewMode("current");
                if (statusFilter === "done") setStatusFilter("all");
              }}
            >
              งานปัจจุบัน
              <span>{books.filter((book) => book.status !== "done").length}</span>
            </button>
            <button
              type="button"
              className={viewMode === "archive" ? styles.activeTab : ""}
              onClick={() => {
                setViewMode("archive");
                setStatusFilter("all");
              }}
            >
              คลังเสร็จแล้ว
              <span>{summary.done}</span>
            </button>
          </div>

          <div className={styles.toolbar}>
            <label className={styles.searchField}>
              <span className={styles.visuallyHidden}>ค้นหา</span>
              <span className={styles.searchIcon} aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ค้นหาเรื่อง เลขรับ หน่วยงาน ผู้รับผิดชอบ..."
              />
            </label>

            <div className={styles.sourcePageSummary}>
            <span>หน้าต้นทาง</span>
            <strong>
              {selectedSmartAreaPage
                ? `Smart Area หน้า ${selectedSmartAreaPage}`
                : "ยังไม่พบเลขหน้า"}
            </strong>
          </div>

            <label className={styles.selectField}>
              <span>สถานะ</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">ทั้งหมด</option>
                {Object.entries(statusLabels)
                  .filter(([value]) =>
                    viewMode === "archive" ? value === "done" : value !== "done",
                  )
                  .map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          {message && <div className={styles.errorBox}>{message}</div>}
          {successMessage && (
            <div className={styles.successBox}>{successMessage}</div>
          )}

          <div className={styles.resultBar}>
            <div>
              <strong>
                {viewMode === "archive" ? "รายการที่เสร็จแล้ว" : "งานปัจจุบัน"}
              </strong>
              <span>
                {selectedSmartAreaPage
                  ? `หน้า ${selectedSmartAreaPage} · ${filteredBooks.length} รายการ`
                  : `พบ ${filteredBooks.length} รายการ`}
              </span>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                onClick={() => {
                  if (selectedPageIndex > 0) {
                    setSelectedSmartAreaPage(
                      availableSmartAreaPages[selectedPageIndex - 1],
                    );
                  }
                }}
                disabled={selectedPageIndex <= 0}
                aria-label="หน้าก่อนหน้า"
              >
                ‹
              </button>

              {visibleSmartAreaPages.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={
                    pageNumber === selectedSmartAreaPage
                      ? styles.activeSourcePage
                      : ""
                  }
                  onClick={() => setSelectedSmartAreaPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  if (
                    selectedPageIndex >= 0 &&
                    selectedPageIndex < availableSmartAreaPages.length - 1
                  ) {
                    setSelectedSmartAreaPage(
                      availableSmartAreaPages[selectedPageIndex + 1],
                    );
                  }
                }}
                disabled={
                  selectedPageIndex < 0 ||
                  selectedPageIndex >= availableSmartAreaPages.length - 1
                }
                aria-label="หน้าถัดไป"
              >
                ›
              </button>

              <button
                type="button"
                className={styles.latestSourcePage}
                onClick={() => setSelectedSmartAreaPage(latestSmartAreaPage)}
                disabled={latestSmartAreaPage === null}
              >
                ล่าสุด
              </button>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.bookTable}>
              <thead>
                <tr>
                  <th>ที่</th>
                  <th>เรื่อง / ไฟล์แนบ</th>
                  <th>จาก</th>
                  <th>สถานะ</th>
                  <th>ผู้รับผิดชอบ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filteredBooks.map((book) => (
                  <Fragment key={book.id}>
                  <tr
                    className={
                      selectedBook?.id === book.id ? styles.selectedRow : ""
                    }
                  >
                    <td data-label="ลำดับ">
                      <div className={styles.registrationCell}>
                        <strong>{book.registrationNumber || "-"}</strong>
                        <small className={styles.sourcePageLabel}>
                          หน้า Smart Area: {book.smartAreaPage || "-"}
                        </small>
                        <small>
                          Smart Area ID: {book.legacySmartAreaId || "-"}
                        </small>
                        <small>รับ {formatDate(book.receivedDate)}</small>
                        <small>
                          อัปเดต{" "}
                          {book.updatedAt
                            ? new Intl.DateTimeFormat("th-TH", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(book.updatedAt))
                            : "-"}
                        </small>
                      </div>
                    </td>

                    <td data-label="เรื่อง / ไฟล์แนบ">
                      <div className={styles.subjectCell}>
                        <div className={styles.subjectTopline}>
                          {["clerk_review", "director_review"].includes(
                            book.status,
                          ) && (
                            <span
                              className={styles.newMailBadge}
                              title="หนังสือใหม่"
                              aria-label="หนังสือใหม่"
                            >
                              ✉
                            </span>
                          )}
                          {book.urgency && (
                            <span className={styles.urgencyBadge}>
                              {book.urgency}
                            </span>
                          )}
                          {book.documentType && (
                            <span className={styles.typeBadge}>
                              {book.documentType}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          className={styles.subjectButton}
                          onClick={() =>
                            setSelectedBook((current) =>
                              current?.id === book.id ? null : book,
                            )
                          }
                        >
                          {book.subject}
                        </button>
                        <small>
                          {book.documentNumber
                            ? `เลขที่ ${book.documentNumber}`
                            : "ไม่ระบุเลขที่หนังสือ"}
                          {book.documentDate
                            ? ` · ${formatDate(book.documentDate)}`
                            : ""}
                        </small>

                        <div className={styles.fileLinks}>
                          {book.attachments.length === 0 && (
                            <span className={styles.noFile}>ไม่มีไฟล์แนบ</span>
                          )}
                          {book.attachments.map((attachment, index) =>
                            attachment.openUrl ? (
                              <a
                                key={attachment.id}
                                className={styles.fileNameLink}
                                href={attachment.openUrl}
                                target="_blank"
                                rel="noreferrer"
                                title={attachment.fileName}
                              >
                                <span>{index + 1}.</span>
                                <span>
                                  {displayAttachmentName(
                                    attachment.fileName,
                                    index,
                                  )}
                                </span>
                              </a>
                            ) : (
                              <span
                                key={attachment.id}
                                className={styles.missingFile}
                              >
                                {index + 1}. ไม่พบไฟล์
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    </td>

                    <td data-label="จาก">
                      <div className={styles.sourceCell}>
                        <strong>{book.sourceAgency || "-"}</strong>
                        <small>{book.note || "ไม่มีหมายเหตุ"}</small>
                      </div>
                    </td>

                    <td data-label="สถานะ">
                      <span
                        className={`${styles.statusBadge} ${
                          styles[`status_${book.status}`] || ""
                        }`}
                      >
                        {getStatusLabel(book.status)}
                      </span>
                    </td>

                    <td data-label="ผู้รับผิดชอบ">
                      <div className={styles.assigneeCell}>
                        {book.tasks.length === 0 ? (
                          <span>-</span>
                        ) : (
                          <div className={styles.assigneeNames}>
                            {book.tasks.map((task) => (
                              <span key={task.id}>
                                {shortThaiName(task.assigneeName)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>

                    <td data-label="จัดการ">
                      <div className={styles.actionCell}>
                        {capabilities.canSubmit &&
                          book.status === "clerk_review" && (
                            <button
                              type="button"
                              className={styles.primaryAction}
                              onClick={() =>
                                void postAction(
                                  { action: "submit", bookId: book.id },
                                  `submit:${book.id}`,
                                )
                              }
                              disabled={savingKey === `submit:${book.id}`}
                            >
                              เสนอ ผอ.
                            </button>
                          )}

                        {book.tasks.some(
                          (task) =>
                            task.assigneeId === currentUserId &&
                            task.status === "assigned",
                        ) && (
                          <button
                            type="button"
                            className={styles.primaryAction}
                            onClick={() => {
                              const task = book.tasks.find(
                                (item) =>
                                  item.assigneeId === currentUserId &&
                                  item.status === "assigned",
                              );
                              if (task) {
                                void updateTaskStatus(task.id, "in_progress");
                              }
                            }}
                            disabled={book.tasks.some(
                              (task) =>
                                task.assigneeId === currentUserId &&
                                savingKey === task.id,
                            )}
                          >
                            เริ่ม
                          </button>
                        )}

                        {book.tasks.some(
                          (task) =>
                            task.assigneeId === currentUserId &&
                            task.status === "in_progress",
                        ) && (
                          <button
                            type="button"
                            className={styles.doneAction}
                            onClick={() => {
                              const task = book.tasks.find(
                                (item) =>
                                  item.assigneeId === currentUserId &&
                                  item.status === "in_progress",
                              );
                              if (task) {
                                void updateTaskStatus(task.id, "done");
                              }
                            }}
                            disabled={book.tasks.some(
                              (task) =>
                                task.assigneeId === currentUserId &&
                                savingKey === task.id,
                            )}
                          >
                            เสร็จสิ้น
                          </button>
                        )}

                        {capabilities.canClose &&
                          book.status === "director_review" && (
                            <button
                              type="button"
                              className={styles.secondaryAction}
                              onClick={() =>
                                void postAction(
                                  {
                                    action: "close",
                                    bookId: book.id,
                                    note: "รับทราบและปิดเรื่อง",
                                  },
                                  `close:${book.id}`,
                                )
                              }
                              disabled={savingKey === `close:${book.id}`}
                            >
                              รับทราบ/จบ
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>

                  {selectedBook?.id === book.id && (
                    <tr className={styles.detailRow}>
                      <td colSpan={6}>
                        <div className={styles.inlineDetail}>
                          <div className={styles.inlineDetailHeader}>
                            <div>
                              <span>รายละเอียดหนังสือ</span>
                              <strong>{book.subject}</strong>
                            </div>
                            <div className={styles.inlineDetailActions}>
                              {capabilities.canAssign &&
                                book.status !== "done" && (
                                  <button
                                    type="button"
                                    className={styles.signAssignButton}
                                    onClick={() =>
                                      router.push(`/documents/sign/${book.id}`)
                                    }
                                  >
                                    ลงนาม/มอบหมาย
                                  </button>
                                )}
                              {capabilities.canAssign &&
                                book.status !== "done" && (
                                  <button
                                    type="button"
                                    className={styles.assignDetailButton}
                                    onClick={() => openAssignment(book)}
                                  >
                                    {book.tasks.length > 0
                                      ? "แก้ไขผู้รับมอบหมาย"
                                      : "มอบหมายงาน"}
                                  </button>
                                )}
                              <button
                                type="button"
                                className={styles.closeDetailButton}
                                onClick={() => setSelectedBook(null)}
                              >
                                ปิด
                              </button>
                            </div>
                          </div>

                          <div className={styles.inlineDetailGrid}>
                            <div>
                              <span>เลขทะเบียนรับ</span>
                              <strong>{book.registrationNumber || "-"}</strong>
                            </div>
                            <div>
                              <span>วันที่รับ</span>
                              <strong>{formatDate(book.receivedDate)}</strong>
                            </div>
                            <div>
                              <span>เลขที่หนังสือ</span>
                              <strong>{book.documentNumber || "-"}</strong>
                            </div>
                            <div>
                              <span>วันที่หนังสือ</span>
                              <strong>{formatDate(book.documentDate)}</strong>
                            </div>
                            <div>
                              <span>จากหน่วยงาน</span>
                              <strong>{book.sourceAgency || "-"}</strong>
                            </div>
                            <div>
                              <span>ประเภท / ชั้นความเร็ว</span>
                              <strong>
                                {[book.documentType, book.urgency]
                                  .filter(Boolean)
                                  .join(" · ") || "-"}
                              </strong>
                            </div>
                          </div>

                          <div className={styles.inlineDetailSections}>
                            <div>
                              <span>หมายเหตุ</span>
                              <p>{book.note || "-"}</p>
                            </div>
                            <div>
                              <span>ข้อความสั่งการ</span>
                              <p>{book.directorNote || "-"}</p>
                            </div>
                            <div>
                              <span>ผู้รับผิดชอบ</span>
                              <p>
                                {book.tasks.length > 0
                                  ? book.tasks
                                      .map(
                                        (task) =>
                                          `${task.assigneeName || "ไม่ระบุชื่อ"} (${getStatusLabel(task.status)})`,
                                      )
                                      .join(", ")
                                  : "-"}
                              </p>
                            </div>
                            <div>
                              <span>ไฟล์แนบ</span>
                              <div className={styles.detailFiles}>
                                {book.attachments.length === 0 && <span>-</span>}
                                {book.attachments.map((attachment, index) =>
                                  attachment.openUrl ? (
                                    <a
                                      key={attachment.id}
                                      href={attachment.openUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={attachment.fileName}
                                    >
                                      <span>{index + 1}.</span>
                                      <span>
                                        {displayAttachmentName(
                                          attachment.fileName,
                                          index,
                                        )}
                                      </span>
                                    </a>
                                  ) : (
                                    <span key={attachment.id}>
                                      {index + 1}. ไม่พบไฟล์
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}

                {!loading && filteredBooks.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <strong>ไม่พบรายการหนังสือ</strong>
                        <span>ลองเปลี่ยนคำค้นหา ตัวกรอง หรือแท็บรายการ</span>
                      </div>
                    </td>
                  </tr>
                )}

                {loading && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <strong>กำลังโหลดข้อมูล</strong>
                        <span>โปรดรอสักครู่</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside
          className={`${styles.workloadPanel} ${
            workloadCollapsed ? styles.workloadPanelCollapsed : ""
          }`}
        >
          <button
            type="button"
            className={styles.workloadToggle}
            onClick={() => setWorkloadCollapsed((current) => !current)}
            aria-label={workloadCollapsed ? "ขยายสรุปภาระงาน" : "ยุบสรุปภาระงาน"}
            title={workloadCollapsed ? "ขยายสรุปภาระงาน" : "ยุบสรุปภาระงาน"}
          >
            {workloadCollapsed ? "<<" : ">>"}
          </button>
          <div className={styles.workloadContent}>
          <div className={styles.workloadHeader}>
            <div>
              <p>ภาพรวมงาน</p>
              <h2>สรุปภาระงาน</h2>
            </div>
            <span>{books.length}</span>
          </div>

          <div className={styles.workloadList}>
            {workload.map((item) => (
              <button
                type="button"
                key={item.status}
                onClick={() => {
                  setViewMode(item.status === "done" ? "archive" : "current");
                  setStatusFilter(item.status === "done" ? "all" : item.status);
                }}
              >
                <span
                  className={`${styles.workloadDot} ${
                    styles[`dot_${item.status}`] || ""
                  }`}
                />
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            ))}
          </div>

          <div className={styles.workloadFooter}>
            <strong>
              {accessMode === "all" ? "สิทธิ์ดูทั้งหมด" : "งานที่ได้รับมอบหมาย"}
            </strong>
            <span>
              ข้อมูลอัปเดตจากฐานข้อมูล Supabase และระบบสิทธิ์ส่วนกลาง
            </span>
          </div>
          </div>
        </aside>
      </section>

      {editingBook && (
        <div className={styles.modalBackdrop}>
          <section className={styles.assignmentModal}>
            <div className={styles.modalHeader}>
              <div>
                <p>มอบหมายงาน</p>
                <h2>{editingBook.subject}</h2>
              </div>
              <button type="button" onClick={() => setEditingBook(null)}>
                ปิด
              </button>
            </div>

            <div className={styles.assigneeGrid}>
              {assignees.map((person) => {
                const checked = selectedAssigneeIds.includes(person.id);

                return (
                  <label key={person.id} className={styles.assigneeOption}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedAssigneeIds((current) =>
                          checked
                            ? current.filter((id) => id !== person.id)
                            : [...current, person.id],
                        )
                      }
                    />
                    <span>
                      <strong>{person.fullName}</strong>
                      <small>{person.position || "ไม่ระบุตำแหน่ง"}</small>
                    </span>
                  </label>
                );
              })}
            </div>

            <label className={styles.noteField}>
              <span>ข้อความสั่งการ</span>
              <textarea
                value={actionNote}
                onChange={(event) => setActionNote(event.target.value)}
                placeholder="เช่น มอบหมายให้ดำเนินการและรายงานผล"
              />
            </label>

            <div className={styles.modalActions}>
              <button type="button" onClick={() => setEditingBook(null)}>
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => void saveAssignment()}
                disabled={
                  selectedAssigneeIds.length === 0 ||
                  savingKey.startsWith("assign:")
                }
              >
                บันทึกการมอบหมาย
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
