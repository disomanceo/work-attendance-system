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
  assignedAt: string;
};

type BookItem = {
  id: string;
  subject: string;
  urgency: string;
  receivedDate: string;
  directorNote: string;
  tasks: TaskItem[];
};

type DocumentsResponse = {
  ok: boolean;
  workspaceMode?: "manager" | "clerk" | "member";
  books?: BookItem[];
};

type SeenRecord = {
  seenAt?: string;
  dismissedAt?: string;
  dismissCount?: number;
};

const MAX_POPUP_DISMISS_COUNT = 2;

function popupKey(bookId: string) {
  return `smart-area-assignment:${bookId}`;
}

async function loadSeenRecords(token: string, keys: string[]) {
  if (keys.length === 0) return {};

  const response = await fetch("/api/notifications/seen", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "list",
      keys,
    }),
  });
  const result = await response.json();

  if (!response.ok || !result.ok) return {};

  return (result.records || {}) as Record<string, SeenRecord>;
}

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

function formatAssignmentDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function instructionSizeClass(value: string) {
  const length = value.trim().length;
  if (length > 240) return styles.instructionSmall;
  if (length > 120) return styles.instructionMedium;
  return styles.instructionLarge;
}
export default function SmartAreaAssignmentPopup() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [books, setBooks] = useState<BookItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissCounts, setDismissCounts] = useState<Record<string, number>>(
    {},
  );

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

      const seenRecords = await loadSeenRecords(
        session.access_token,
        newBooks.map((item) => popupKey(item.id)),
      );
      const nextDismissCounts = Object.fromEntries(
        newBooks.map((item) => [
          item.id,
          Number(seenRecords[popupKey(item.id)]?.dismissCount || 0),
        ]),
      );
      const firstPopupIndex = newBooks.findIndex(
        (item) =>
          (nextDismissCounts[item.id] || 0) < MAX_POPUP_DISMISS_COUNT,
      );

      setBooks(newBooks);
      setDismissCounts(nextDismissCounts);
      setCurrentIndex(firstPopupIndex >= 0 ? firstPopupIndex : 0);

      if (firstPopupIndex >= 0) {
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
  const currentDismissCount = book ? dismissCounts[book.id] || 0 : 0;

  if (!book || count === 0) return null;

  const isMostUrgent = String(book.urgency || "")
    .replace(/\s+/g, "")
    .includes("ด่วนที่สุด");

  const ownAssignment =
    book.tasks.find((task) => task.status === "assigned") ?? book.tasks[0];
  const instruction =
    book.directorNote?.trim() ||
    "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e48\u0e07\u0e01\u0e32\u0e23\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e40\u0e15\u0e34\u0e21";
  const assignmentDate = formatAssignmentDate(ownAssignment?.assignedAt || "");

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < count - 1;

  async function dismiss() {
    if (!book) {
      setVisible(false);
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.access_token) {
        const response = await fetch("/api/notifications/seen", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "dismiss",
            key: popupKey(book.id),
            kind: "smart-area-assignment",
            referenceId: book.id,
          }),
        });
        const result = await response.json().catch(() => null);
        const count = Number(result?.record?.dismissCount || 0);

        if (response.ok && result?.ok && count > 0) {
          setDismissCounts((previous) => ({
            ...previous,
            [book.id]: count,
          }));
        }
      }
    } catch {
      setDismissCounts((previous) => ({
        ...previous,
        [book.id]: (previous[book.id] || 0) + 1,
      }));
    }

    setVisible(false);
  }

  function reopen() {
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
              <div className={styles.topBarSummary}>
                <strong className={styles.position}>
                  {"\u0e07\u0e32\u0e19\u0e17\u0e35\u0e48"} {(currentIndex + 1).toLocaleString("th-TH")}/
                  {count.toLocaleString("th-TH")}
                </strong>
                <strong className={styles.assignmentTitle}>
                  {isMostUrgent
                    ? "\u0e07\u0e32\u0e19\u0e14\u0e48\u0e27\u0e19\u0e17\u0e35\u0e48\u0e2a\u0e38\u0e14"
                    : "\u0e07\u0e32\u0e19\u0e21\u0e2d\u0e1a\u0e2b\u0e21\u0e32\u0e22\u0e43\u0e2b\u0e21\u0e48"}
                </strong>
              </div>
              <button type="button" className={styles.closeButton} onClick={dismiss}
                aria-label={"\u0e1b\u0e34\u0e14\u0e01\u0e32\u0e23\u0e41\u0e08\u0e49\u0e07\u0e40\u0e15\u0e37\u0e2d\u0e19"}
                data-dismiss-count={currentDismissCount}>
                {"\u00d7"}
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

            <div className={styles.subject}>
              <small>เรื่อง</small>
              <strong title={book.subject}>{book.subject}</strong>
            </div>
            <div className={styles.instructionBox}>
              <small className={styles.instructionLabel}>
                {"\u0e02\u0e49\u0e2d\u0e04\u0e27\u0e32\u0e21\u0e2a\u0e31\u0e48\u0e07\u0e01\u0e32\u0e23"}
              </small>
              <p className={`${styles.instructionText} ${instructionSizeClass(instruction)}`}>
                {instruction}
              </p>
              {assignmentDate && <time className={styles.instructionDate}>{assignmentDate}</time>}
            </div><div className={styles.actions}>
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
