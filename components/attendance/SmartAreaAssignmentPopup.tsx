"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./SmartAreaAssignmentPopup.module.css";

type TaskItem = {
  id: string;
  assigneeId: string | null;
  status: string;
  assignmentOpenedAt: string;
};

type BookItem = {
  id: string;
  subject: string;
  urgency: string;
  receivedDate: string;
  tasks: TaskItem[];
};

type DocumentsResponse = {
  ok: boolean;
  workspaceMode?: "manager" | "clerk" | "member";
  books?: BookItem[];
};

const POPUP_DISMISSED_KEY = "smart-area-assignment-popup:dismissed";

function getUrgencyRank(value: string) {
  const normalized = String(value || "").replace(/\s+/g, "");

  if (normalized.includes("ด่วนที่สุด")) return 0;
  if (normalized.includes("ด่วนมาก")) return 1;
  if (normalized.includes("ด่วน")) return 2;
  return 3;
}

function compareBooks(left: BookItem, right: BookItem) {
  const urgencyDifference =
    getUrgencyRank(left.urgency) - getUrgencyRank(right.urgency);

  if (urgencyDifference !== 0) {
    return urgencyDifference;
  }

  const rightDate = Date.parse(right.receivedDate || "") || 0;
  const leftDate = Date.parse(left.receivedDate || "") || 0;
  return rightDate - leftDate;
}

export default function SmartAreaAssignmentPopup() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadAssignments() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || !active) return;

      const response = await fetch("/api/documents", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as DocumentsResponse;
      const canReceiveAssignments =
        result.workspaceMode === "member" || result.workspaceMode === "clerk";

      if (!response.ok || !result.ok || !canReceiveAssignments) {
        return;
      }

      const currentUserId = session.user.id;
      const newBooks = (result.books ?? [])
        .filter((item) =>
          item.tasks.some(
            (task) =>
              task.assigneeId === currentUserId &&
              task.status === "assigned" &&
              !task.assignmentOpenedAt,
          ),
        )
        .sort(compareBooks);

      if (!active || newBooks.length === 0) return;

      setBooks(newBooks);
      setCurrentIndex(0);

      if (sessionStorage.getItem(POPUP_DISMISSED_KEY) !== "dismissed") {
        setVisible(true);
      }
    }

    void loadAssignments();

    return () => {
      active = false;
    };
  }, [supabase]);

  const book = books[currentIndex] ?? null;
  const count = books.length;

  if (!book || count === 0) return null;

  const isMostUrgent = String(book.urgency || "")
    .replace(/\s+/g, "")
    .includes("ด่วนที่สุด");

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < count - 1;

  function dismiss() {
    sessionStorage.setItem(POPUP_DISMISSED_KEY, "dismissed");
    setVisible(false);
  }

  function reopen() {
    sessionStorage.removeItem(POPUP_DISMISSED_KEY);
    setVisible(true);
  }

  function showPrevious() {
    if (!hasPrevious) return;
    setCurrentIndex((index) => index - 1);
  }

  function showNext() {
    if (!hasNext) return;
    setCurrentIndex((index) => index + 1);
  }

  function openWork() {
    sessionStorage.setItem("smart-area-open-book-id", book.id);
    setVisible(false);
    router.push(`/documents?book=${encodeURIComponent(book.id)}`);
  }

  return (
    <>
      <button
        type="button"
        className={styles.notificationButton}
        style={{ bottom: "24px" }}
        onClick={reopen}
        aria-label={`งาน Smart Area ใหม่ ${count} งาน`}
      >
        <span aria-hidden="true">✉</span>
        <strong>งานใหม่</strong>
        <b>{count}</b>
      </button>

      {visible && (
        <div className={styles.backdrop} role="presentation">
          <section
            className={`${styles.popup} ${
              isMostUrgent ? styles.urgentPopup : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="smart-area-assignment-title"
          >
            <div className={styles.topBar}>
              <strong className={styles.position}>
                งานที่ {(currentIndex + 1).toLocaleString("th-TH")}/
                {count.toLocaleString("th-TH")}
              </strong>

              <button
                type="button"
                className={styles.closeButton}
                onClick={dismiss}
                aria-label="ปิดการแจ้งเตือน"
              >
                ×
              </button>
            </div>

            <div className={styles.navigation}>
              <button
                type="button"
                className={styles.arrowButton}
                onClick={showPrevious}
                disabled={!hasPrevious}
                aria-label="งานก่อนหน้า"
              >
                &lt;
              </button>

              <button
                type="button"
                className={styles.arrowButton}
                onClick={showNext}
                disabled={!hasNext}
                aria-label="งานถัดไป"
              >
                &gt;
              </button>
            </div>

            <div className={styles.iconRow}>
              <div className={styles.icon} aria-hidden="true">✉</div>
              <div className={styles.heading}>
                <span>{isMostUrgent ? "งานด่วนที่สุด" : "งานมอบหมายใหม่"}</span>
                <h2 id="smart-area-assignment-title">
                  คุณมีงานใหม่ {count.toLocaleString("th-TH")} งาน
                </h2>
              </div>
            </div>

            <div className={styles.subject}>
              <small>เรื่อง</small>
              <strong title={book.subject}>{book.subject}</strong>
            </div>

            <p>
              กรุณาเปิดดูรายละเอียดและรับทราบงานที่ได้รับมอบหมาย
            </p>

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={dismiss}>
                ไว้ภายหลัง
              </button>
              <button type="button" className={styles.primary} onClick={openWork}>
                เปิดดูงาน
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
