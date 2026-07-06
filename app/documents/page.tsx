"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function DocumentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [actionNote, setActionNote] = useState("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const sessionToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/login");
      return "";
    }
    return session.access_token;
  }, [router, supabase]);

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
      setBooks(result.books ?? []);
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
    if (response.ok && result.ok) setAssignees(result.assignees ?? []);
  }, [capabilities.canAssign, sessionToken]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

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

  const filteredBooks = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("th");
    return books.filter((book) => {
      if (statusFilter !== "all" && book.status !== statusFilter) return false;
      if (!normalized) return true;
      return [
        book.subject,
        book.sourceAgency,
        book.registrationNumber,
        book.documentNumber,
      ].some((value) => value.toLocaleLowerCase("th").includes(normalized));
    });
  }, [books, query, statusFilter]);

  return (
    <main className={styles.page}>
      <section className={styles.headerCard}>
        <div>
          <p className={styles.eyebrow}>งานหนังสือราชการ</p>
          <h1>รายการหนังสือราชการ</h1>
          <p className={styles.description}>
            {accessMode === "all"
              ? "แสดงหนังสือราชการทั้งหมดตามสิทธิ์"
              : "แสดงเฉพาะหนังสือที่มอบหมายถึงคุณ"}
          </p>
        </div>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={() => void loadBooks()}
          disabled={loading}
        >
          {loading ? "กำลังโหลด..." : "โหลดใหม่"}
        </button>
      </section>

      <section className={styles.toolbar}>
        <label className={styles.searchField}>
          <span>ค้นหา</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="เรื่อง หน่วยงาน เลขรับ หรือเลขหนังสือ"
          />
        </label>
        <label className={styles.filterField}>
          <span>สถานะ</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="all">ทั้งหมด</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </section>

      {message && <div className={styles.errorBox}>{message}</div>}
      {successMessage && <div className={styles.successBox}>{successMessage}</div>}

      <section className={styles.list}>
        {filteredBooks.map((book) => (
          <article key={book.id} className={styles.bookCard}>
            <div className={styles.cardTop}>
              <div className={styles.cardTitleArea}>
                <div className={styles.badges}>
                  <span className={`${styles.statusBadge} ${styles[`status_${book.status}`] || ""}`}>
                    {getStatusLabel(book.status)}
                  </span>
                  {book.urgency && <span className={styles.urgencyBadge}>{book.urgency}</span>}
                </div>
                <h2>{book.subject}</h2>
                <p>{book.sourceAgency || "ไม่ระบุหน่วยงานต้นทาง"}</p>
              </div>
              <div className={styles.registrationBox}>
                <span>เลขรับ</span>
                <strong>{book.registrationNumber || "-"}</strong>
              </div>
            </div>

            <dl className={styles.details}>
              <div><dt>วันที่รับ</dt><dd>{formatDate(book.receivedDate)}</dd></div>
              <div><dt>เลขที่หนังสือ</dt><dd>{book.documentNumber || "-"}</dd></div>
              <div><dt>วันที่หนังสือ</dt><dd>{formatDate(book.documentDate)}</dd></div>
              <div><dt>ประเภท</dt><dd>{book.documentType || "-"}</dd></div>
            </dl>

            <div className={styles.managementActions}>
              {capabilities.canSubmit && book.status === "clerk_review" && (
                <button
                  type="button"
                  onClick={() => void postAction(
                    { action: "submit", bookId: book.id },
                    `submit:${book.id}`,
                  )}
                  disabled={savingKey === `submit:${book.id}`}
                >
                  เสนอ ผอ.
                </button>
              )}
              {capabilities.canAssign && (
                <button type="button" onClick={() => openAssignment(book)}>
                  {book.tasks.length > 0 ? "แก้ไขผู้รับมอบหมาย" : "มอบหมายงาน"}
                </button>
              )}
              {capabilities.canClose && book.status !== "done" && (
                <button
                  type="button"
                  className={styles.secondaryManagementButton}
                  onClick={() => void postAction(
                    { action: "close", bookId: book.id, note: "รับทราบและปิดเรื่อง" },
                    `close:${book.id}`,
                  )}
                  disabled={savingKey === `close:${book.id}`}
                >
                  รับทราบ/จบ
                </button>
              )}
            </div>

            {book.tasks.length > 0 && (
              <div className={styles.taskArea}>
                <span>งานมอบหมาย</span>
                <div className={styles.taskRows}>
                  {book.tasks.map((task) => (
                    <div key={task.id} className={styles.taskRow}>
                      <div>
                        <strong>{task.assigneeName || "ไม่ระบุชื่อ"}</strong>
                        <small>{getStatusLabel(task.status)}</small>
                      </div>
                      <div className={styles.taskActions}>
                        {task.status === "assigned" && (
                          <button
                            type="button"
                            onClick={() => void updateTaskStatus(task.id, "in_progress")}
                            disabled={savingKey === task.id}
                          >
                            เริ่มดำเนินการ
                          </button>
                        )}
                        {task.status === "in_progress" && (
                          <button
                            type="button"
                            onClick={() => void updateTaskStatus(task.id, "done")}
                            disabled={savingKey === task.id}
                          >
                            เสร็จแล้ว
                          </button>
                        )}
                        {canManageAll && task.status === "done" && (
                          <button
                            type="button"
                            className={styles.secondaryTaskButton}
                            onClick={() => void updateTaskStatus(task.id, "in_progress")}
                            disabled={savingKey === task.id}
                          >
                            เปิดงานอีกครั้ง
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.attachmentArea}>
              <span>ไฟล์แนบ</span>
              <div className={styles.attachmentList}>
                {book.attachments.length === 0 && <p className={styles.noAttachment}>ไม่พบไฟล์</p>}
                {book.attachments.map((attachment, index) =>
                  attachment.openUrl ? (
                    <a
                      key={attachment.id}
                      className={`${styles.fileButton} ${
                        attachment.attachmentType === "signed" ? styles.signedFile : ""
                      }`}
                      href={attachment.openUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {attachment.attachmentType === "signed" ? "ฉบับลงนาม" : `ไฟล์ ${index + 1}`}
                      <small>{attachment.hasDriveFile ? "Google Drive" : "Smart Area เดิม"}</small>
                    </a>
                  ) : (
                    <span key={attachment.id} className={styles.missingFileButton}>ไม่พบไฟล์</span>
                  ),
                )}
              </div>
            </div>
          </article>
        ))}
      </section>

      {editingBook && (
        <div className={styles.modalBackdrop}>
          <section className={styles.assignmentModal}>
            <div className={styles.modalHeader}>
              <div>
                <p>มอบหมายงาน</p>
                <h2>{editingBook.subject}</h2>
              </div>
              <button type="button" onClick={() => setEditingBook(null)}>ปิด</button>
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
              <button type="button" onClick={() => setEditingBook(null)}>ยกเลิก</button>
              <button
                type="button"
                onClick={() => void saveAssignment()}
                disabled={selectedAssigneeIds.length === 0 || savingKey.startsWith("assign:")}
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
