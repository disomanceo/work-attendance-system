"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./LeaveReviewPopup.module.css";

type PendingOfficialDuty = {
  id: string;
  full_name: string;
  position: string | null;
  duty_date: string;
  reason: string;
  note: string | null;
  attachment_file_url: string | null;
  attachment_file_name: string | null;
  status: "pending";
};

type Props = {
  role: string;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  requests?: PendingOfficialDuty[];
};

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export default function OfficialDutyReviewPopup({ role }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<PendingOfficialDuty[]>([]);
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

      if (!token) {
        throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch("/api/admin/official-duty", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "โหลดคำขอไปราชการรอพิจารณาไม่สำเร็จ"
        );
      }

      const pending = Array.isArray(result.requests)
        ? result.requests.filter((item) => item.status === "pending")
        : [];

      setItems(pending);
      setCurrentIndex(0);

      if (pending.length === 0) {
        setOpen(false);
        return;
      }

      const newestId = String(pending[0]?.id || "");
      const lastSeenId = window.localStorage.getItem(
        "director_last_seen_pending_official_duty_id"
      );

      if (newestId && newestId !== lastSeenId) {
        setOpen(true);
        window.localStorage.setItem(
          "director_last_seen_pending_official_duty_id",
          newestId
        );
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "โหลดคำขอไปราชการรอพิจารณาไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }, [canReview, getToken]);

  useEffect(() => {
    if (!canReview) return;

    const firstLoadTimer = window.setTimeout(() => {
      void loadPending();
    }, 0);

    const refreshTimer = window.setInterval(() => {
      void loadPending();
    }, 60000);

    return () => {
      window.clearTimeout(firstLoadTimer);
      window.clearInterval(refreshTimer);
    };
  }, [canReview, loadPending]);

  async function review(
    item: PendingOfficialDuty,
    action: "approve" | "reject"
  ) {
    const reviewNote =
      action === "reject"
        ? window
            .prompt("ระบุเหตุผลที่ไม่อนุญาตอย่างน้อย 5 ตัวอักษร")
            ?.trim() ?? ""
        : "";

    if (action === "reject" && reviewNote.length < 5) {
      setErrorMessage(
        "กรุณาระบุเหตุผลที่ไม่อนุญาตอย่างน้อย 5 ตัวอักษร"
      );
      return;
    }

    setProcessingId(item.id);
    setErrorMessage("");

    try {
      const token = await getToken();

      if (!token) {
        throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch(
        `/api/admin/official-duty/${item.id}/review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            reviewNote,
          }),
        }
      );

      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "บันทึกผลการพิจารณาไม่สำเร็จ"
        );
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
        error instanceof Error
          ? error.message
          : "บันทึกผลการพิจารณาไม่สำเร็จ"
      );
    } finally {
      setProcessingId("");
    }
  }

  if (!canReview) return null;

  const current = items[currentIndex] ?? null;
  const hasMultipleItems = items.length > 1;

  function showPrevious() {
    if (!hasMultipleItems) return;

    setCurrentIndex((index) =>
      index === 0 ? items.length - 1 : index - 1
    );
  }

  function showNext() {
    if (!hasMultipleItems) return;

    setCurrentIndex((index) =>
      index === items.length - 1 ? 0 : index + 1
    );
  }

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          className={`${styles.floatingButton} ${styles.floatingButtonAlert}`}
          onClick={() => setOpen(true)}
          aria-label={`คำขอไปราชการรอพิจารณา ${items.length} รายการ`}
        >
          <span className={styles.bell}>🔔</span>
          <strong>ไปราชการรอพิจารณา</strong>
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
                  คำขอไปราชการ
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
                {hasMultipleItems && (
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.nextButton}
                      onClick={showPrevious}
                      aria-label="รายการก่อนหน้า"
                    >
                      ‹ ก่อนหน้า
                    </button>

                    <button
                      type="button"
                      className={styles.nextButton}
                      onClick={showNext}
                      aria-label="รายการถัดไป"
                    >
                      ถัดไป ›
                    </button>
                  </div>
                )}

                <article className={styles.leaveCard}>
                  <div className={styles.personRow}>
                    <div className={styles.avatar}>
                      {current.full_name?.trim().charAt(0) || "U"}
                    </div>

                    <div className={styles.personInfo}>
                      <strong>
                        {current.full_name || "ไม่พบชื่อสมาชิก"}
                      </strong>
                      <small>{current.position || "-"}</small>
                    </div>

                    <span className={styles.leaveType}>
                      ไปราชการ
                    </span>
                  </div>

                  <div className={styles.detailList}>
                    <div>
                      <span>📅</span>
                      <p>{formatThaiDate(current.duty_date)}</p>
                    </div>

                    <div>
                      <span>📝</span>
                      <p>
                        ภารกิจ: <strong>{current.reason}</strong>
                      </p>
                    </div>

                    {current.note && (
                      <div>
                        <span>💬</span>
                        <p>หมายเหตุ: {current.note}</p>
                      </div>
                    )}
                  </div>

                  {current.attachment_file_url && (
                    <button
                      type="button"
                      className={styles.attachmentButton}
                      onClick={() =>
                        window.open(
                          current.attachment_file_url ?? "",
                          "_blank",
                          "noopener,noreferrer"
                        )
                      }
                    >
                      ดูไฟล์แนบ
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
                    ✕ ไม่อนุญาต
                  </button>

                  <button
                    type="button"
                    className={styles.approveButton}
                    disabled={processingId === current.id}
                    onClick={() => void review(current, "approve")}
                  >
                    {processingId === current.id
                      ? "กำลังบันทึก..."
                      : "✓ อนุญาต"}
                  </button>

                  <button
                    type="button"
                    className={styles.nextButton}
                    onClick={() =>
                      router.push("/official-duty?tab=review")
                    }
                  >
                    เปิดหน้าพิจารณา
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
