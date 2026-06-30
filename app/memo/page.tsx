"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  requests?: MemoRequest[];
  request?: MemoRequest;
};

type MemoFormProps = {
  editingId: string;
  subject: string;
  reason: string;
  memoText: string;
  attachmentDescription: string;
  saving: boolean;
  onSubjectChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onMemoTextChange: (value: string) => void;
  onAttachmentDescriptionChange: (value: string) => void;
  onSaveDraft: () => void;
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

const STATUS_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "pending", label: "รอ ผอ. พิจารณา" },
  { value: "approved", label: "อนุมัติแล้ว" },
  { value: "acknowledged", label: "รับทราบแล้ว" },
  { value: "revision", label: "ส่งกลับแก้ไข" },
  { value: "rejected", label: "ไม่อนุมัติ" },
  { value: "draft", label: "ฉบับร่าง" },
];

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
  subject,
  reason,
  memoText,
  attachmentDescription,
  saving,
  onSubjectChange,
  onReasonChange,
  onMemoTextChange,
  onAttachmentDescriptionChange,
  onSaveDraft,
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
        <input value={formatThaiDate(new Date().toISOString())} readOnly />
      </label>

      <label className={styles.field}>
        เรื่อง <span>*</span>
        <input
          value={subject}
          onChange={(event) => onSubjectChange(event.target.value)}
          placeholder="เช่น ชี้แจงการไม่มาปฏิบัติงาน"
        />
      </label>

      <label className={styles.field}>
        เหตุผล <span>*</span>
        <textarea
          value={reason}
          onChange={(event) => onReasonChange(event.target.value)}
          placeholder="เช่น เนื่องจากมีอาการป่วย มีไข้ และแพทย์ให้พักรักษาตัว"
        />
      </label>

      <label className={styles.field}>
        ด้วยเหตุนี้ <span>*</span>
        <div className={styles.reasonRow}>
          <span className={styles.reasonPrefix}>ด้วยเหตุนี้</span>
          <textarea
            value={memoText}
            onChange={(event) => onMemoTextChange(event.target.value)}
            placeholder="จึงไม่สามารถมาปฏิบัติงานในวันที่ 1 มิถุนายน 2568 ได้"
          />
        </div>
        <small>ตัวอย่าง: จึงไม่สามารถมาปฏิบัติงานในวันที่ 1 ก.ค. 2569 ได้</small>
      </label>

      <label className={styles.field}>
        สิ่งที่แนบมาด้วย
        <input
          value={attachmentDescription}
          onChange={(event) =>
            onAttachmentDescriptionChange(event.target.value)
          }
          placeholder="เช่น ใบรับรองแพทย์ จำนวน 1 ฉบับ"
        />
      </label>

      <div className={styles.uploadBox}>
        <strong>ไฟล์แนบ</strong>
        <p>ระบบแนบไฟล์จริงจะต่อในเฟสเอกสาร/PDF ถัดไป</p>
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={saving}
          onClick={onSaveDraft}
        >
          บันทึกฉบับร่าง
        </button>
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
  const [editingId, setEditingId] = useState("");
  const [subject, setSubject] = useState("");
  const [reason, setReason] = useState("");
  const [memoText, setMemoText] = useState("");
  const [attachmentDescription, setAttachmentDescription] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  const yearOptions = useMemo(() => {
    const years = new Set(
      requests
        .map((item) => getThaiYear(item.submitted_at ?? item.created_at))
        .filter(Boolean)
    );

    return ["all", ...Array.from(years).sort((a, b) => Number(b) - Number(a))];
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return requests.filter((item) => {
      const dateValue = item.submitted_at ?? item.created_at;
      const yearMatched =
        yearFilter === "all" || getThaiYear(dateValue) === yearFilter;
      const statusMatched =
        statusFilter === "all" || item.status === statusFilter;
      const textMatched =
        !normalizedSearch ||
        [
          item.memo_number,
          item.subject,
          item.reason,
          item.full_name,
          item.position,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return yearMatched && statusMatched && textMatched;
    });
  }, [requests, search, statusFilter, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedRequests = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const selectedRequest =
    requests.find((item) => item.id === selectedId) ?? filteredRequests[0];
  const myRequests = requests.slice(0, 5);

  function resetForm() {
    setEditingId("");
    setSubject("");
    setReason("");
    setMemoText("");
    setAttachmentDescription("");
  }

  function editDraft(item: MemoRequest) {
    if (!["draft", "revision"].includes(item.status)) {
      return;
    }

    setEditingId(item.id);
    setSubject(item.subject);
    setReason(item.reason);
    setMemoText(item.body);
    setAttachmentDescription(item.attachment_description ?? "");
  }

  async function saveMemo(action: "draft" | "submit") {
    setSaving(true);
    setMessage("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/memo", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: editingId || undefined,
          action,
          subject,
          reason,
          memoText,
          attachmentDescription,
        }),
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
            subject={subject}
            reason={reason}
            memoText={memoText}
            attachmentDescription={attachmentDescription}
            saving={saving}
            onSubjectChange={setSubject}
            onReasonChange={setReason}
            onMemoTextChange={setMemoText}
            onAttachmentDescriptionChange={setAttachmentDescription}
            onSaveDraft={() => void saveMemo("draft")}
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
                      <th>จัดการ</th>
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
                              onClick={() => setSelectedId(item.id)}
                              aria-label="ดูรายละเอียด"
                            >
                              ดู
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
                <h2>ทะเบียนเลขเอกสารทั้งหมด</h2>
                <p>แสดงเลขที่เอกสารต่อเนื่องของบันทึกข้อความ</p>
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
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                {STATUS_OPTIONS.map((item) => (
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
                  ) : pagedRequests.length === 0 ? (
                    <tr>
                      <td colSpan={6}>ไม่พบรายการตามเงื่อนไข</td>
                    </tr>
                  ) : (
                    pagedRequests.map((item) => (
                      <tr
                        key={item.id}
                        className={
                          selectedRequest?.id === item.id ? styles.selectedRow : ""
                        }
                        onClick={() => setSelectedId(item.id)}
                      >
                        <td>{item.memo_number || "-"}</td>
                        <td>บันทึกข้อความ</td>
                        <td>{formatThaiDate(item.submitted_at ?? item.created_at)}</td>
                        <td>{item.full_name || "ฉัน"}</td>
                        <td>{compactText(item.subject, 34)}</td>
                        <td>
                          <span className={`${styles.status} ${styles[item.status]}`}>
                            {STATUS_LABELS[item.status] ?? item.status}
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
                {filteredRequests.length === 0
                  ? "0"
                  : `${(currentPage - 1) * PAGE_SIZE + 1} - ${Math.min(
                      currentPage * PAGE_SIZE,
                      filteredRequests.length
                    )}`}{" "}
                จากทั้งหมด {filteredRequests.length} รายการ
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
            <div className={styles.pdfPreview}>
              <h3>ตัวอย่างเอกสาร PDF (บันทึกข้อความ)</h3>
              <div className={styles.documentMock}>
                <span>ตราครุฑ</span>
                <strong>บันทึกข้อความ</strong>
                <p>{selectedRequest?.subject || "เลือกบันทึกข้อความเพื่อดูตัวอย่าง"}</p>
                <small>
                  เลขที่ {selectedRequest?.memo_number || "-"} ·{" "}
                  {formatThaiDate(selectedRequest?.submitted_at ?? null)}
                </small>
              </div>
            </div>

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
              </dl>
            </div>

            <div className={styles.timeline}>
              <h3>ประวัติการพิจารณา</h3>
              <ol>
                <li>
                  <span />
                  <p>
                    {selectedRequest
                      ? `${formatThaiDateTime(
                          selectedRequest.submitted_at
                        )} ส่งเรื่องให้ผู้บริหาร`
                      : "ยังไม่มีรายการ"}
                  </p>
                </li>
                {selectedRequest?.review_note && (
                  <li>
                    <span />
                    <p>{selectedRequest.review_note}</p>
                  </li>
                )}
              </ol>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
