"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FeedbackToast from "@/components/ui/FeedbackToast";
import styles from "../../memo/memo.module.css";

type MemoRequest = {
  id: string;
  full_name: string;
  position: string | null;
  subject: string;
  reason: string;
  body: string;
  attachment_description: string | null;
  status: string;
  memo_number: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
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

type ReviewAction = "approve" | "acknowledge" | "reject" | "send_back";

type ApiResponse = {
  ok: boolean;
  message?: string;
  requests?: MemoRequest[];
};

const STATUS_LABELS: Record<string, string> = {
  pending: "รอพิจารณา",
  revision: "ส่งกลับแก้ไข",
  approved: "อนุมัติ",
  acknowledged: "รับทราบ",
  rejected: "ไม่อนุมัติ",
  cancelled: "ยกเลิก",
};

const FILTERS = [
  { value: "pending", label: "รอพิจารณา" },
  { value: "all", label: "ทั้งหมด" },
  { value: "approved", label: "อนุมัติ" },
  { value: "acknowledged", label: "รับทราบ" },
  { value: "revision", label: "ส่งกลับแก้ไข" },
  { value: "rejected", label: "ไม่อนุมัติ" },
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

function formatThaiDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function compactText(value: string, length = 34) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

export default function AdminMemoPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<MemoRequest[]>([]);
  const [filter, setFilter] = useState("pending");
  const [selectedId, setSelectedId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  const selectedRequest =
    requests.find((item) => item.id === selectedId) ?? requests[0] ?? null;

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
      const response = await fetch(`/api/admin/memo?status=${filter}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดรายการบันทึกข้อความไม่สำเร็จ");
      }

      const nextRequests = result.requests ?? [];
      setRequests(nextRequests);
      setSelectedId((current) => {
        if (nextRequests.some((item) => item.id === current)) return current;
        return nextRequests[0]?.id ?? "";
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "โหลดรายการบันทึกข้อความไม่สำเร็จ"
      );
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }, [filter, getAccessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  async function reviewMemo(action: ReviewAction) {
    if (!selectedRequest) return;

    const confirmMessage =
      action === "approve"
        ? "ยืนยันอนุมัติบันทึกข้อความรายการนี้"
        : action === "acknowledge"
          ? "ยืนยันรับทราบบันทึกข้อความรายการนี้"
          : action === "send_back"
            ? "ยืนยันส่งกลับให้แก้ไขบันทึกข้อความรายการนี้"
            : "ยืนยันไม่อนุมัติบันทึกข้อความรายการนี้";

    if (!window.confirm(confirmMessage)) return;

    setSavingId(selectedRequest.id);
    setMessage("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/memo", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action,
          note: reviewNote,
        }),
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกผลการพิจารณาไม่สำเร็จ");
      }

      setMessage(result.message || "บันทึกผลการพิจารณาแล้ว");
      setMessageType("success");
      setReviewNote("");
      await loadRequests();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "บันทึกผลการพิจารณาไม่สำเร็จ"
      );
      setMessageType("error");
    } finally {
      setSavingId("");
    }
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
          <h1>พิจารณาบันทึกข้อความ</h1>
        </div>
      </header>

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

      <div className={styles.adminMemoGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>รายการบันทึกข้อความ</h2>
              <p>เลือกรายการเพื่อดูรายละเอียดและบันทึกผลการพิจารณา</p>
            </div>
          </div>

          <div className={styles.filterBar}>
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  filter === item.value
                    ? styles.activeFilterButton
                    : styles.filterButton
                }
                onClick={() => {
                  setFilter(item.value);
                  setReviewNote("");
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.registryTable}>
              <thead>
                <tr>
                  <th>เลขที่</th>
                  <th>ผู้ยื่น</th>
                  <th>เรื่อง</th>
                  <th>วันที่ส่ง</th>
                  <th>สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : requests.length === 0 ? (
                  <tr>
                    <td colSpan={5}>ไม่มีรายการบันทึกข้อความในหมวดนี้</td>
                  </tr>
                ) : (
                  requests.map((item) => (
                    <tr
                      key={item.id}
                      className={
                        selectedRequest?.id === item.id ? styles.selectedRow : ""
                      }
                      onClick={() => {
                        setSelectedId(item.id);
                        setReviewNote("");
                      }}
                    >
                      <td>{item.memo_number || "-"}</td>
                      <td>{item.full_name}</td>
                      <td>{compactText(item.subject)}</td>
                      <td>{formatThaiDateTime(item.submitted_at)}</td>
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
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelHeader}>
            <div>
              <h2>รายละเอียดการพิจารณา</h2>
              <p>{selectedRequest?.memo_number || "ยังไม่ได้เลือกรายการ"}</p>
            </div>
          </div>

          {selectedRequest ? (
            <div className={styles.reviewDetail}>
              <div className={styles.reviewSummary}>
                <span className={`${styles.status} ${styles[selectedRequest.status]}`}>
                  {STATUS_LABELS[selectedRequest.status] ??
                    selectedRequest.status}
                </span>
                <h3>{selectedRequest.subject}</h3>
                <p>{selectedRequest.full_name}</p>
                <small>{selectedRequest.position || "ไม่ระบุตำแหน่ง"}</small>
              </div>

              <dl className={styles.reviewMeta}>
                <div>
                  <dt>วันที่ส่ง</dt>
                  <dd>{formatThaiDateTime(selectedRequest.submitted_at)}</dd>
                </div>
                <div>
                  <dt>เหตุผล</dt>
                  <dd>{selectedRequest.reason}</dd>
                </div>
                <div>
                  <dt>ข้อความ</dt>
                  <dd>{selectedRequest.body}</dd>
                </div>
                <div>
                  <dt>สิ่งที่แนบมาด้วย</dt>
                  <dd>
                    {selectedRequest.attachment_description || "-"}
                    {selectedRequest.attachment_path && (
                      <>
                        <br />
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => void openAttachment(selectedRequest.id)}
                        >
                          {selectedRequest.attachment_file_name ||
                            "เปิดไฟล์แนบ"}
                        </button>
                      </>
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
                          window.open(selectedRequest.pdf_file_url || "", "_blank")
                        }
                      >
                        {selectedRequest.pdf_file_name || "เปิด PDF"}
                      </button>
                    </dd>
                  </div>
                )}
                {selectedRequest.review_note && (
                  <div>
                    <dt>ความเห็นเดิม</dt>
                    <dd>{selectedRequest.review_note}</dd>
                  </div>
                )}
                {selectedRequest.reviewed_at && (
                  <div>
                    <dt>พิจารณาเมื่อ</dt>
                    <dd>{formatThaiDateTime(selectedRequest.reviewed_at)}</dd>
                  </div>
                )}
              </dl>

              <div className={styles.timeline}>
                <h3>ประวัติการดำเนินการ</h3>
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

              {selectedRequest.status === "pending" ? (
                <div className={styles.reviewBox}>
                  <label className={styles.field}>
                    ความเห็นผู้พิจารณา
                    <textarea
                      value={reviewNote}
                      onChange={(event) => setReviewNote(event.target.value)}
                      placeholder="จำเป็นเมื่อส่งกลับแก้ไข หรือไม่อนุมัติ"
                    />
                  </label>

                  <div className={styles.reviewActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={savingId === selectedRequest.id}
                      onClick={() => void reviewMemo("approve")}
                    >
                      อนุมัติ
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={savingId === selectedRequest.id}
                      onClick={() => void reviewMemo("acknowledge")}
                    >
                      รับทราบ
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={savingId === selectedRequest.id}
                      onClick={() => void reviewMemo("send_back")}
                    >
                      ส่งกลับแก้ไข
                    </button>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      disabled={savingId === selectedRequest.id}
                      onClick={() => void reviewMemo("reject")}
                    >
                      ไม่อนุมัติ
                    </button>
                  </div>
                </div>
              ) : (
                <p className={styles.notice}>รายการนี้บันทึกผลการพิจารณาแล้ว</p>
              )}
            </div>
          ) : (
            <p className={styles.empty}>ยังไม่มีรายการให้พิจารณา</p>
          )}
        </aside>
      </div>
    </main>
  );
}
