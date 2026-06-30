"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>พิจารณาบันทึกข้อความ</h1>
        </div>
      </header>

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
                  <dd>{selectedRequest.attachment_description || "-"}</dd>
                </div>
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
