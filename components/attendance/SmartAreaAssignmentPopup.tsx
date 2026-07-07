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

export default function SmartAreaAssignmentPopup() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [book, setBook] = useState<BookItem | null>(null);
  const [count, setCount] = useState(0);
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
      if (!response.ok || !result.ok || result.workspaceMode !== "member") {
        return;
      }

      const currentUserId = session.user.id;
      const newBooks = (result.books ?? []).filter((item) =>
        item.tasks.some(
          (task) =>
            task.assigneeId === currentUserId &&
            task.status === "assigned" &&
            !task.assignmentOpenedAt,
        ),
      );

      if (!active || newBooks.length === 0) return;

      const firstBook = newBooks[0];
      const dismissedKey = `smart-area-assignment-popup:${firstBook.id}`;

      if (sessionStorage.getItem(dismissedKey) === "dismissed") return;

      setBook(firstBook);
      setCount(newBooks.length);
      setVisible(true);
    }

    void loadAssignments();

    return () => {
      active = false;
    };
  }, [supabase]);

  if (!visible || !book) return null;

  const isMostUrgent = String(book.urgency || "")
    .replace(/\s+/g, "")
    .includes("ด่วนที่สุด");

  function dismiss() {
    if (!book) return;
    sessionStorage.setItem(
      `smart-area-assignment-popup:${book.id}`,
      "dismissed",
    );
    setVisible(false);
  }

  function openWork() {
    if (!book) return;
    sessionStorage.setItem("smart-area-open-book-id", book.id);
    router.push("/documents");
  }

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={`${styles.popup} ${
          isMostUrgent ? styles.urgentPopup : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-area-assignment-title"
      >
        <div className={styles.icon} aria-hidden="true">✉</div>

        <div className={styles.heading}>
          <span>{isMostUrgent ? "งานด่วนที่สุด" : "งานมอบหมายใหม่"}</span>
          <h2 id="smart-area-assignment-title">
            คุณมีงานใหม่ {count.toLocaleString("th-TH")} งาน
          </h2>
        </div>

        <div className={styles.subject}>
          <small>เรื่อง</small>
          <strong>{book.subject}</strong>
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
  );
}
