"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./OrderReviewPopup.module.css";

type PendingOrder = {
  id: string;
  order_number: string | null;
  subject: string;
  order_date: string;
  responsible_name_snapshot: string;
  created_at?: string;
  updated_at: string;
  docx_file_url: string | null;
  pdf_file_url: string | null;
};

type Props = {
  role: string;
};

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

export default function OrderReviewPopup({ role }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<PendingOrder[]>([]);
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canReview = role === "director" || role === "admin";

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? "";
  }, [supabase]);

  const loadPending = useCallback(
    async (openWhenNew = true) => {
      if (!canReview) return;

      setLoading(true);
      setErrorMessage("");

      try {
        const token = await getToken();
        if (!token) throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");

        const params = new URLSearchParams({
          status: "PENDING",
          sort: "number_desc",
        });

        const response = await fetch(`/api/orders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(result.message || "โหลดคำสั่งรอพิจารณาไม่สำเร็จ");
        }

        const pending = Array.isArray(result.orders) ? result.orders : [];
        setItems(pending);
        setCurrentIndex((index) =>
          Math.min(index, Math.max(pending.length - 1, 0))
        );

        if (pending.length === 0) {
          setOpen(false);
          return;
        }

        if (!openWhenNew) return;

        const newestId = String(pending[0]?.id || "");
        const lastSeenId = window.localStorage.getItem(
          "director_last_seen_pending_order_id"
        );

        if (newestId && newestId !== lastSeenId) {
          setCurrentIndex(0);
          setOpen(true);
          window.localStorage.setItem(
            "director_last_seen_pending_order_id",
            newestId
          );
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "โหลดคำสั่งรอพิจารณาไม่สำเร็จ"
        );
      } finally {
        setLoading(false);
      }
    },
    [canReview, getToken]
  );

  useEffect(() => {
    void loadPending(true);

    if (!canReview) return;

    const channel = supabase
      .channel("director-order-review-popup")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "order_documents",
        },
        () => {
          void loadPending(true);
        }
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadPending(true);
    }, 60000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [canReview, loadPending, supabase]);

  if (!canReview) return null;

  const current = items[currentIndex] ?? null;

  function goToOrders() {
    setOpen(false);
    router.push("/orders");
  }

  function showNext() {
    if (items.length <= 1) return;
    setCurrentIndex((index) => (index + 1) % items.length);
  }

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          className={styles.floatingButton}
          onClick={() => setOpen(true)}
          aria-label={`คำสั่งรอพิจารณา ${items.length} รายการ`}
        >
          <span>🔔</span>
          <strong>คำสั่งรอพิจารณา</strong>
          <b>{items.length}</b>
        </button>
      )}

      {open && current && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <section className={styles.modal}>
            <header className={styles.header}>
              <div>
                <small>แจ้งเตือนสำหรับผู้บริหาร</small>
                <h2>
                  มีคำสั่งใหม่รอพิจารณา
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
              <div className={styles.loading}>กำลังโหลดข้อมูล...</div>
            ) : (
              <>
                <article className={styles.card}>
                  <div className={styles.numberRow}>
                    <strong>{current.order_number || "รอออกเลข"}</strong>
                    <span>รออนุมัติ</span>
                  </div>

                  <h3>{current.subject}</h3>

                  <dl>
                    <div>
                      <dt>วันที่คำสั่ง</dt>
                      <dd>{formatThaiDate(current.order_date)}</dd>
                    </div>
                    <div>
                      <dt>ผู้รับผิดชอบ</dt>
                      <dd>{current.responsible_name_snapshot}</dd>
                    </div>
                    <div>
                      <dt>ไฟล์แนบ</dt>
                      <dd>
                        {current.docx_file_url || current.pdf_file_url
                          ? [
                              current.docx_file_url ? "DOCX" : "",
                              current.pdf_file_url ? "PDF" : "",
                            ]
                              .filter(Boolean)
                              .join(" / ")
                          : "ยังไม่แนบไฟล์"}
                      </dd>
                    </div>
                  </dl>
                </article>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setOpen(false)}
                  >
                    ไว้ภายหลัง
                  </button>

                  {items.length > 1 && (
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={showNext}
                    >
                      รายการถัดไป
                    </button>
                  )}

                  <button
                    type="button"
                    className={styles.primary}
                    onClick={goToOrders}
                  >
                    ไปพิจารณาคำสั่ง
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
