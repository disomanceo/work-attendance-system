"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./LeaveReviewPopup.module.css";

type PendingLeave = {
  id: string;
  leave_type: "personal" | "sick";
  start_date: string;
  end_date: string;
  total_work_days: number;
  reason: string;
  attachment_path: string | null;
  evidence_file_id?: string | null;
  profiles: {
    full_name: string;
    position: string | null;
    role: string;
  } | null;
};

type Props = {
  role: string;
};

function getLeaveLabel(type: PendingLeave["leave_type"]) {
  return type === "sick" ? "ลาป่วย" : "ลากิจ";
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export default function LeaveReviewPopup({ role }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<PendingLeave[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  const canReview = role === "director" || role === "admin";

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? "";
  }, [supabase]);

  const loadPending = useCallback(async () => {
    if (!canReview) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const token = await getToken();
      if (!token) throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");

      const response = await fetch("/api/admin/leave?status=pending", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดใบลารอพิจารณาไม่สำเร็จ");
      }

      const pending = Array.isArray(result.requests) ? result.requests : [];
      setItems(pending);
      setCurrentIndex(0);

      if (pending.length === 0) {
        setOpen(false);
        return;
      }

      const newestId = String(pending[0]?.id || "");
      const lastSeenId = window.localStorage.getItem(
        "director_last_seen_pending_leave_id"
      );

      if (newestId && newestId !== lastSeenId) {
        setOpen(true);
        window.localStorage.setItem(
          "director_last_seen_pending_leave_id",
          newestId
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดใบลารอพิจารณาไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }, [canReview, getToken]);

  useEffect(() => {
    void loadPending();

    if (!canReview) return;

    const timer = window.setInterval(() => {
      void loadPending();
    }, 60000);

    return () => window.clearInterval(timer);
  }, [canReview, loadPending]);

  async function review(item: PendingLeave, action: "approve" | "reject") {
    const note =
      action === "reject"
        ? window.prompt("ระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 5 ตัวอักษร")?.trim() ??
          ""
        : "";

    if (action === "reject" && note.length < 5) {
      setErrorMessage("กรุณาระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 5 ตัวอักษร");
      return;
    }

    setProcessingId(item.id);
    setErrorMessage("");

    try {
      const token = await getToken();
      const response = await fetch("/api/admin/leave", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: item.id,
          action,
          note,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกผลไม่สำเร็จ");
      }

      setItems((current) => {
        const next = current.filter((entry) => entry.id !== item.id);

        setCurrentIndex((index) =>
          Math.min(index, Math.max(next.length - 1, 0))
        );

        if (next.length === 0) {
          setOpen(false);
        }

        return next;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "บันทึกผลไม่สำเร็จ"
      );
    } finally {
      setProcessingId("");
    }
  }

  async function openAttachment(item: PendingLeave) {
    const token = await getToken();
    const response = await fetch(
      `/api/leave/attachment?requestId=${encodeURIComponent(item.id)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      setErrorMessage("เปิดหลักฐานไม่สำเร็จ");
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!canReview) return null;

  const current = items[currentIndex] ?? null;

  function showNext() {
    if (items.length <= 1) return;
    setCurrentIndex((index) => (index + 1) % items.length);
  }

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          className={`${styles.floatingButton} ${styles.floatingButtonAlert}`}
          onClick={() => setOpen(true)}
          aria-label={`ใบลารอพิจารณา ${items.length} รายการ`}
        >
          <span className={styles.bell}>🔔</span>
          <strong>ใบลารอพิจารณา</strong>
          <b>{items.length}</b>
        </button>
      )}

      {open && current && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <section className={styles.modal}>
            <header className={styles.modalHeader}>
              <div>
                <small>สำหรับผู้บริหาร</small>
                <h2>
                  ใบลารอพิจารณา
                  <span>
                    {currentIndex + 1} จาก {items.length}
                  </span>
                </h2>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={() => setOpen(false)}
                aria-label="ปิด"
              >
                ×
              </button>
            </header>

            {errorMessage && (
              <div className={styles.errorMessage}>{errorMessage}</div>
            )}

            {loading ? (
              <div className={styles.loadingBox}>กำลังโหลดข้อมูล...</div>
            ) : (
              <>
                <article className={styles.leaveCard}>
                  <div className={styles.personRow}>
                    <div className={styles.avatar}>
                      {current.profiles?.full_name?.trim().charAt(0) || "U"}
                    </div>

                    <div className={styles.personInfo}>
                      <strong>
                        {current.profiles?.full_name || "ไม่พบชื่อสมาชิก"}
                      </strong>
                      <small>
                        {current.profiles?.position ||
                          current.profiles?.role ||
                          "-"}
                      </small>
                    </div>

                    <span
                      className={styles.leaveType}
                      data-type={current.leave_type}
                    >
                      {getLeaveLabel(current.leave_type)}
                    </span>
                  </div>

                  <div className={styles.detailList}>
                    <div>
                      <span>📅</span>
                      <p>
                        {formatThaiDate(current.start_date)}
                        {current.start_date !== current.end_date &&
                          ` ถึง ${formatThaiDate(current.end_date)}`}
                        <small>({current.total_work_days} วันทำการ)</small>
                      </p>
                    </div>

                    <div>
                      <span>📝</span>
                      <p>
                        เหตุผล: <strong>{current.reason}</strong>
                      </p>
                    </div>
                  </div>

                  {current.attachment_path && (
                    <button
                      type="button"
                      className={styles.attachmentButton}
                      onClick={() => void openAttachment(current)}
                    >
                      ดูหลักฐานแนบ
                    </button>
                  )}
                </article>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.rejectButton}
                    disabled={processingId === current.id}
                    onClick={() => void review(current, "reject")}
                  >
                    ✕ ไม่อนุมัติ
                  </button>

                  <button
                    type="button"
                    className={styles.approveButton}
                    disabled={processingId === current.id}
                    onClick={() => void review(current, "approve")}
                  >
                    {processingId === current.id
                      ? "กำลังบันทึก..."
                      : "✓ อนุมัติ"}
                  </button>

                  {items.length > 1 && (
                    <button
                      type="button"
                      className={styles.nextButton}
                      onClick={showNext}
                    >
                      ถัดไป ›
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
