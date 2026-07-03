"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FeedbackToast from "@/components/ui/FeedbackToast";
import styles from "./memo.module.css";

type MemoRequest = {
  id: string;
  full_name?: string;
  position?: string | null;
  subject: string;
  reason: string;
  body: string;
  attachment_description: string | null;
  status: string;
  memo_number: string | null;
  review_note: string | null;
  created_at: string;
  submitted_at: string | null;
  reviewed_at?: string | null;
  attachment_bucket?: string | null;
  attachment_path?: string | null;
  attachment_file_name?: string | null;
  attachment_mime_type?: string | null;
  attachment_size_bytes?: number | null;
  working_document_url?: string | null;
  pdf_file_url?: string | null;
  pdf_file_name?: string | null;
  logs?: MemoLog[];
};

type MemoLog = {
  id: string;
  actor_name: string | null;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
};

type DocumentRegistryItem = {
  id: string;
  referenceId: string;
  documentType: string;
  typeLabel: string;
  formattedNumber: string;
  runningNumber: number;
  buddhistYear: number;
  issuedAt: string | null;
  completedAt: string | null;
  status: string;
  applicantName: string;
  subject: string;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  requests?: MemoRequest[];
  request?: MemoRequest;
  documents?: DocumentRegistryItem[];
};

type MemoFormProps = {
  editingId: string;
  submittedDate: string;
  subject: string;
  reason: string;
  memoText: string;
  attachmentDescription: string;
  attachment: File | null;
  attachmentInputRef: React.RefObject<HTMLInputElement | null>;
  saving: boolean;
  onSubmittedDateChange: (value: string) => void;
  onSubjectChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onMemoTextChange: (value: string) => void;
  onAttachmentDescriptionChange: (value: string) => void;
  onAttachmentChange: (file: File | null) => void;
  onCancelEdit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "ฉบับร่าง",
  pending: "รอ ผอ. พิจารณา",
  revision: "ส่งกลับแก้ไข",
  approved: "อนุมัติแล้ว",
  acknowledged: "รับทราบแล้ว",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

const DOCUMENT_TYPE_OPTIONS = [
  { value: "all", label: "ทุกประเภท" },
  { value: "leave", label: "ใบลา" },
  { value: "official_duty", label: "ไปราชการ" },
  { value: "memo", label: "บันทึกข้อความ" },
];

const TIMELINE_LABELS: Record<string, string> = {
  draft: "บันทึกฉบับร่าง",
  pending: "ส่งให้ผู้บริหารพิจารณา",
  revision: "ส่งกลับแก้ไข",
  approved: "อนุมัติ",
  acknowledged: "รับทราบ",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

const PAGE_SIZE = 10;

function formatThaiDate(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function getTodayInputDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatThaiDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function getThaiYear(value: string | null) {
  if (!value) return "";
  return String(new Date(value).getFullYear() + 543);
}

function compactText(value: string, length = 28) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function MemoForm({
  editingId,
  submittedDate,
  subject,
  reason,
  memoText,
  attachmentDescription,
  attachment,
  attachmentInputRef,
  saving,
  onSubmittedDateChange,
  onSubjectChange,
  onReasonChange,
  onMemoTextChange,
  onAttachmentDescriptionChange,
  onAttachmentChange,
  onCancelEdit,
  onSubmit,
}: MemoFormProps) {
  return (
    <form className={styles.panel} onSubmit={onSubmit}>
      <div className={styles.panelHeader}>
        <h2>{editingId ? "แก้ไขบันทึกข้อความ" : "สร้างบันทึกข้อความ"}</h2>
      </div>

      <label className={styles.field}>
        วันที่ยื่น <span>*</span>
        <input
          type="date"
          value={submittedDate}
          onChange={(event) => onSubmittedDateChange(event.target.value)}
          required
        />
      </label>

      <label className={styles.field}>
        เรื่อง <span>*</span>
        <input
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="ขอชี้แจงในการไม่มาปฏิบัติงาน"
        />
      </label>

      <label className={styles.field}>
        เหตุผล <span>*</span>
        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="เนื่องจากมีอาการเวียนหัวกระทันหัน ต้องไปพบแพทย์ด่วน"
        />
      </label>

      <label className={styles.field}>
        ด้วยเหตุนี้ <span>*</span>
        <div className={styles.reasonRow}>
          <span className={styles.reasonPrefix}>ด้วยเหตุนี้</span>
          <textarea
            value={memoText}
            onChange={(event) => onMemoTextChange(event.target.value)}
            placeholder="จึงไม่สามารถมาปฏิบัติงานได้"
          />
        </div>
      </label>

      <label className={styles.field}>
        สิ่งที่แนบมาด้วย
        <input
          value={attachmentDescription}
          onChange={(event) =>
            onAttachmentDescriptionChange(event.target.value)
          }
          placeholder="ใบรับรองแพทย์ หรือ รูปถ่าย"
        />
      </label>

      <div className={styles.uploadBox}>
        <input
          ref={attachmentInputRef}
          id="memo-attachment"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(event) =>
            onAttachmentChange(event.target.files?.[0] ?? null)
          }
        />
        <label htmlFor="memo-attachment">
          <strong>{attachment ? attachment.name : "ไฟล์แนบ"}</strong>
          <p>
            {attachment
              ? `${(attachment.size / 1024 / 1024).toFixed(2)} MB`
              : "รองรับ PDF, JPG, PNG ขนาดไม่เกิน 10 MB"}
          </p>
        </label>
      </div>

      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={saving}
        >
          ส่งให้ ผอ. พิจารณา
        </button>
        {editingId && (
          <button
            type="button"
            className={styles.textButton}
            disabled={saving}
            onClick={onCancelEdit}
          >
            ยกเลิกแก้ไข
          </button>
        )}
      </div>
    </form>
  );
}

export default function MemoPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<MemoRequest[]>([]);
  const [documents, setDocuments] = useState<DocumentRegistryItem[]>([]);
  const [editingId, setEditingId] = useState("");
  const [submittedDate, setSubmittedDate] = useState(getTodayInputDate());
  const [subject, setSubject] = useState("");
  const [reason, setReason] = useState("");
  const [memoText, setMemoText] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [search, setSearch] = useState("");
  const [documentTypeFilter, setDocumentTypeFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  const getAccessToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      router.replace("/login");
      throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }

    return session.access_token;
  }, [router, supabase]);

  const loadRequests = useCallback(async () => {
    setLoading(true);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/memo", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดบันทึกข้อความไม่สำเร็จ");
      }

      setRequests(result.requests ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "โหลดบันทึกข้อความไม่สำเร็จ"
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken]);

  const loadDocumentRegistry = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        type: documentTypeFilter,
        limit: "300",
      });
      const response = await fetch(`/api/document-registry?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดทะเบียนเลขเอกสารไม่สำเร็จ");
      }

      setDocuments(
        (result.documents ?? []).filter(
          (item) => String(item.documentType).toUpperCase() !== "ORDER"
        )
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "โหลดทะเบียนเลขเอกสารไม่สำเร็จ"
      );
      setMessageType("error");
    }
  }, [documentTypeFilter, getAccessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDocumentRegistry();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDocumentRegistry]);

  const yearOptions = useMemo(() => {
    const years = new Set(
      documents
        .map((item) => getThaiYear(item.issuedAt ?? item.completedAt))
        .filter(Boolean)
    );

    return ["all", ...Array.from(years).sort((a, b) => Number(b) - Number(a))];
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return documents.filter((item) => {
      if (String(item.documentType).toUpperCase() === "ORDER") {
        return false;
      }

      const dateValue = item.issuedAt ?? item.completedAt;
      const yearMatched =
        yearFilter === "all" || getThaiYear(dateValue) === yearFilter;
      const textMatched =
        !normalizedSearch ||
        [
          item.formattedNumber,
          item.typeLabel,
          item.subject,
          item.applicantName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return yearMatched && textMatched;
    });
  }, [documents, search, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredDocuments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedDocuments = filteredDocuments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const selectedRequest = requests.find((item) => item.id === selectedId);
  const myRequests = requests.slice(0, 5);

  function openMemoDetail(requestId: string) {
    setSelectedId(requestId);
    setDetailOpen(true);
  }

  function resetForm() {
    setEditingId("");
    setSubmittedDate(getTodayInputDate());
    setSubject("");
    setReason("");
    setMemoText("");
    setAttachmentDescription("");
    setAttachment(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  function editDraft(item: MemoRequest) {
    if (!["draft", "revision"].includes(item.status)) {
      return;
    }

    setEditingId(item.id);
    setSubmittedDate(
      item.submitted_at ? item.submitted_at.slice(0, 10) : getTodayInputDate()
    );
    setSubject(item.subject);
    setReason(item.reason);
    setMemoText(item.body);
    setAttachmentDescription(item.attachment_description ?? "");
    setAttachment(null);
    if (attachmentInputRef.current) {
      attachmentInputRef.current.value = "";
    }
  }

  async function saveMemo(action: "draft" | "submit") {
    setSaving(true);
    setMessage("");

    try {
      const token = await getAccessToken();
      const formData = new FormData();
      if (editingId) formData.set("id", editingId);
      formData.set("action", action);
      formData.set("submittedDate", submittedDate);
      formData.set("subject", subject);
      formData.set("reason", reason);
      formData.set("memoText", memoText);
      formData.set("attachmentDescription", attachmentDescription);
      if (attachment) formData.set("attachment", attachment);

      const response = await fetch("/api/memo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกข้อความไม่สำเร็จ");
      }

      setMessage(result.message || "บันทึกข้อความสำเร็จ");
      setMessageType("success");
      resetForm();
      await loadRequests();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "บันทึกข้อความไม่สำเร็จ"
      );
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveMemo("submit");
  }

  async function openAttachment(requestId: string) {
    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/memo/attachment?requestId=${encodeURIComponent(requestId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(result?.message || "เปิดไฟล์แนบไม่สำเร็จ");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "เปิดไฟล์แนบไม่สำเร็จ"
      );
      setMessageType("error");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>บันทึกข้อความ</h1>
        </div>
      </header>

      <div className={styles.mobileTabs}>
        <input
          id="memoFormTab"
          className={`${styles.mobileTabInput} ${styles.formTabInput}`}
          type="radio"
          name="memoMobileTab"
          defaultChecked
        />
        <label className={styles.tabLabel} htmlFor="memoFormTab">
          สร้างบันทึก
        </label>
        <input
          id="memoRegistryTab"
          className={`${styles.mobileTabInput} ${styles.registryTabInput}`}
          type="radio"
          name="memoMobileTab"
        />
        <label className={styles.tabLabel} htmlFor="memoRegistryTab">
          ทะเบียนเอกสาร
        </label>
      </div>

      <FeedbackToast message={message} type={messageType} />

      {message && (
        <div
          className={`${styles.message} ${
            messageType === "success" ? styles.success : styles.error
          }`}
        >
          {message}
        </div>
      )}

      <div className={styles.workspace}>
        <aside className={styles.leftColumn}>
          <MemoForm
            editingId={editingId}
            submittedDate={submittedDate}
            subject={subject}
            reason={reason}
            memoText={memoText}
            attachmentDescription={attachmentDescription}
            attachment={attachment}
            attachmentInputRef={attachmentInputRef}
            saving={saving}
            onSubmittedDateChange={setSubmittedDate}
            onSubjectChange={setSubject}
            onReasonChange={setReason}
            onMemoTextChange={setMemoText}
            onAttachmentDescriptionChange={setAttachmentDescription}
            onAttachmentChange={setAttachment}
            onCancelEdit={resetForm}
            onSubmit={handleSubmit}
          />

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>บันทึกข้อความของฉัน</h2>
              <button type="button" className={styles.linkButton}>
                ดูทั้งหมด
              </button>
            </div>

            {loading ? (
              <p className={styles.empty}>กำลังโหลดข้อมูล...</p>
            ) : myRequests.length === 0 ? (
              <p className={styles.empty}>ยังไม่มีบันทึกข้อความ</p>
            ) : (
              <div className={styles.compactTableWrap}>
                <table className={styles.compactTable}>
                  <thead>
                    <tr>
                      <th>เลขที่เอกสาร</th>
                      <th>เรื่อง</th>
                      <th>วันที่ยื่น</th>
                      <th>สถานะ</th>
                      <th>ดู</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRequests.map((item) => (
                      <tr key={item.id}>
                        <td>{item.memo_number || "-"}</td>
                        <td>{compactText(item.subject, 20)}</td>
                        <td>{formatThaiDate(item.submitted_at)}</td>
                        <td>
                          <span className={`${styles.status} ${styles[item.status]}`}>
                            {STATUS_LABELS[item.status] ?? item.status}
                          </span>
                        </td>
                        <td>
                          {["draft", "revision"].includes(item.status) ? (
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => editDraft(item)}
                              aria-label="แก้ไขบันทึกข้อความ"
                            >
                              แก้ไข
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => {
                                if (item.pdf_file_url) {
                                  window.open(item.pdf_file_url, "_blank", "noopener,noreferrer");
                                  return;
                                }

                                openMemoDetail(item.id);
                              }}
                              aria-label={item.pdf_file_url ? "เปิดไฟล์ PDF" : "ดูรายละเอียด"}
                            >
                              {item.pdf_file_url ? "PDF" : "ดู"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </aside>

        <section className={styles.registryColumn}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div>
                <h2>ทะเบียนเอกสารที่เกี่ยวข้อง</h2>
                <p>รวมใบลา ไปราชการ และบันทึกข้อความจากเลขกลาง</p>
              </div>
            </div>

            <div className={styles.filters}>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="ค้นหาเลขที่หรือเรื่อง..."
              />
              <select
                value={documentTypeFilter}
                onChange={(event) => {
                  setDocumentTypeFilter(event.target.value);
                  setPage(1);
                }}
              >
                {DOCUMENT_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={yearFilter}
                onChange={(event) => {
                  setYearFilter(event.target.value);
                  setPage(1);
                }}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year === "all" ? "ทุกปี พ.ศ." : year}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.registryTable}>
                <thead>
                  <tr>
                    <th>เลขที่เอกสาร</th>
                    <th>ประเภทเอกสาร</th>
                    <th>วันที่</th>
                    <th>ผู้ยื่น</th>
                    <th>เรื่อง</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6}>กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : pagedDocuments.length === 0 ? (
                    <tr>
                      <td colSpan={6}>ไม่พบรายการตามเงื่อนไข</td>
                    </tr>
                  ) : (
                    pagedDocuments.map((item) => (
                      <tr
                        key={item.id}
                        className={
                          selectedRequest?.id === item.referenceId
                            ? styles.selectedRow
                            : ""
                        }
                        onClick={() => {
                          if (item.documentType === "MEMO") {
                            openMemoDetail(item.referenceId);
                          }
                        }}
                      >
                        <td>{item.formattedNumber || "-"}</td>
                        <td>{item.typeLabel}</td>
                        <td>{formatThaiDate(item.issuedAt ?? item.completedAt)}</td>
                        <td>{item.applicantName || "-"}</td>
                        <td>{compactText(item.subject, 34)}</td>
                        <td>
                          <span className={styles.status}>
                            {item.status === "COMPLETED"
                              ? "ออกเลขแล้ว"
                              : item.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.pagination}>
              <span>
                แสดงรายการ{" "}
                {filteredDocuments.length === 0
                  ? "0"
                  : `${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(
                      currentPage * PAGE_SIZE,
                      filteredDocuments.length
                    )}`}{" "}
                จากทั้งหมด {filteredDocuments.length} รายการ
              </span>
              <div>
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  ก่อนหน้า
                </button>
                {Array.from({ length: Math.min(totalPages, 4) }, (_, index) => (
                  <button
                    key={index + 1}
                    type="button"
                    className={
                      currentPage === index + 1 ? styles.activePage : undefined
                    }
                    onClick={() => setPage(index + 1)}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                >
                  ถัดไป
                </button>
              </div>
            </div>

            <div className={styles.notice}>
              หมายเหตุ: รายการในทะเบียนใช้สำหรับตรวจสอบเลขที่เอกสารเท่านั้น
            </div>
          </section>

          <section className={styles.detailPanel}>
            <div className={styles.detailInfo}>
              <h3>รายละเอียด</h3>
              <dl>
                <div>
                  <dt>เลขที่เอกสาร</dt>
                  <dd>{selectedRequest?.memo_number || "-"}</dd>
                </div>
                <div>
                  <dt>ประเภทเอกสาร</dt>
                  <dd>บันทึกข้อความ</dd>
                </div>
                <div>
                  <dt>ผู้ยื่น</dt>
                  <dd>{selectedRequest?.full_name || "ฉัน"}</dd>
                </div>
                <div>
                  <dt>วันที่ยื่น</dt>
                  <dd>{formatThaiDateTime(selectedRequest?.submitted_at ?? null)}</dd>
                </div>
                <div>
                  <dt>สถานะ</dt>
                  <dd>
                    {selectedRequest ? (
                      <span
                        className={`${styles.status} ${
                          styles[selectedRequest.status]
                        }`}
                      >
                        {STATUS_LABELS[selectedRequest.status] ??
                          selectedRequest.status}
                      </span>
                    ) : (
                      "-"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>ไฟล์แนบ</dt>
                  <dd>
                    {selectedRequest?.attachment_path ? (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => void openAttachment(selectedRequest.id)}
                      >
                        {selectedRequest.attachment_file_name || "เปิดไฟล์แนบ"}
                      </button>
                    ) : (
                      "-"
                    )}
                  </dd>
                </div>
                {selectedRequest?.pdf_file_url && (
                  <div>
                    <dt>PDF</dt>
                    <dd>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() =>
                          window.open(selectedRequest.pdf_file_url || "", "_blank")
                        }
                      >
                        {selectedRequest.pdf_file_name || "เปิด PDF"}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className={styles.timeline}>
              <h3>ประวัติการพิจารณา</h3>
              {selectedRequest?.logs?.length ? (
                <ol>
                  {selectedRequest.logs.map((log) => (
                    <li key={log.id}>
                      <span />
                      <p>
                        <strong>
                          {formatThaiDateTime(log.created_at)}{" "}
                          {TIMELINE_LABELS[log.to_status] ?? log.to_status}
                        </strong>
                        <small>
                          {log.actor_name ? `โดย ${log.actor_name}` : ""}
                          {log.note ? ` · ${log.note}` : ""}
                        </small>
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.empty}>ยังไม่มีประวัติการดำเนินการ</p>
              )}
            </div>
          </section>
        </section>
      </div>

      {detailOpen && selectedRequest && (
        <div
          className={styles.detailOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setDetailOpen(false)}
        >
          <section
            className={styles.detailModal}
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.detailModalHeader}>
              <div>
                <span>{selectedRequest.memo_number || "-"}</span>
                <h2>{selectedRequest.subject}</h2>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)}>
                ปิด
              </button>
            </header>

            <div className={styles.detailInfo}>
              <h3>รายละเอียด</h3>
              <dl>
                <div>
                  <dt>เลขที่เอกสาร</dt>
                  <dd>{selectedRequest.memo_number || "-"}</dd>
                </div>
                <div>
                  <dt>ประเภทเอกสาร</dt>
                  <dd>บันทึกข้อความ</dd>
                </div>
                <div>
                  <dt>ผู้ยื่น</dt>
                  <dd>{selectedRequest.full_name || "ฉัน"}</dd>
                </div>
                <div>
                  <dt>วันที่ยื่น</dt>
                  <dd>{formatThaiDateTime(selectedRequest.submitted_at)}</dd>
                </div>
                <div>
                  <dt>สถานะ</dt>
                  <dd>
                    <span
                      className={`${styles.status} ${
                        styles[selectedRequest.status]
                      }`}
                    >
                      {STATUS_LABELS[selectedRequest.status] ??
                        selectedRequest.status}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>ไฟล์แนบ</dt>
                  <dd>
                    {selectedRequest.attachment_path ? (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => void openAttachment(selectedRequest.id)}
                      >
                        {selectedRequest.attachment_file_name || "เปิดไฟล์แนบ"}
                      </button>
                    ) : (
                      "-"
                    )}
                  </dd>
                </div>
                {selectedRequest.pdf_file_url && (
                  <div>
                    <dt>PDF</dt>
                    <dd>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() =>
                          window.open(
                            selectedRequest.pdf_file_url || "",
                            "_blank"
                          )
                        }
                      >
                        {selectedRequest.pdf_file_name || "เปิด PDF"}
                      </button>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className={styles.timeline}>
              <h3>ประวัติการพิจารณา</h3>
              {selectedRequest.logs?.length ? (
                <ol>
                  {selectedRequest.logs.map((log) => (
                    <li key={log.id}>
                      <span />
                      <p>
                        <strong>
                          {formatThaiDateTime(log.created_at)}{" "}
                          {TIMELINE_LABELS[log.to_status] ?? log.to_status}
                        </strong>
                        <small>
                          {log.actor_name ? `โดย ${log.actor_name}` : ""}
                          {log.note ? ` · ${log.note}` : ""}
                        </small>
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.empty}>ยังไม่มีประวัติการดำเนินการ</p>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
