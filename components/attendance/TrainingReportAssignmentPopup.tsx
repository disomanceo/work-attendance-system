"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TrainingReportSourceTask } from "@/lib/training-reports/types";
import styles from "./TrainingReportAssignmentPopup.module.css";

type SourceTasksResponse = {
  ok: boolean;
  tasks?: TrainingReportSourceTask[];
};

type SeenRecord = {
  seenAt?: string;
  dismissedAt?: string;
  dismissCount?: number;
};

const MAX_DISMISS_COUNT = 2;

function popupKey(taskId: string) {
  return `training-report-assignment:${taskId}`;
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
  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.ok) return {};

  return (result.records || {}) as Record<string, SeenRecord>;
}

function formatDate(value: string) {
  if (!value) return "";

  const parsed = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return "";

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function sourceBookNumber(task: TrainingReportSourceTask) {
  return task.documentNumber || task.registrationNumber || "-";
}

export default function TrainingReportAssignmentPopup() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [tasks, setTasks] = useState<TrainingReportSourceTask[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dismissCounts, setDismissCounts] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    let active = true;

    async function loadTasks() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token || !active) return;

      const response = await fetch("/api/training-reports/source-tasks?scope=mine", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });
      const result = (await response.json().catch(() => null)) as
        | SourceTasksResponse
        | null;

      if (!active || !response.ok || !result?.ok) return;

      const pendingTasks = (result.tasks ?? [])
        .filter((task) => task.status !== "done")
        .slice(0, 10);

      if (pendingTasks.length === 0) return;

      const seenRecords = await loadSeenRecords(
        session.access_token,
        pendingTasks.map((task) => popupKey(task.taskId)),
      );
      const nextDismissCounts = Object.fromEntries(
        pendingTasks.map((task) => [
          task.taskId,
          Number(seenRecords[popupKey(task.taskId)]?.dismissCount || 0),
        ]),
      );
      const firstPopupIndex = pendingTasks.findIndex(
        (task) => (nextDismissCounts[task.taskId] || 0) < MAX_DISMISS_COUNT,
      );

      setTasks(pendingTasks);
      setDismissCounts(nextDismissCounts);
      setCurrentIndex(firstPopupIndex >= 0 ? firstPopupIndex : 0);
      setVisible(firstPopupIndex >= 0);
    }

    void loadTasks();

    return () => {
      active = false;
    };
  }, [supabase]);

  const task = tasks[currentIndex] ?? null;
  const count = tasks.length;

  if (!task || count === 0) return null;

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < count - 1;

  async function dismiss() {
    if (!task) {
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
            key: popupKey(task.taskId),
            kind: "training-report-assignment",
            referenceId: task.taskId,
          }),
        });
        const result = await response.json().catch(() => null);
        const count = Number(result?.record?.dismissCount || 0);

        if (response.ok && result?.ok && count > 0) {
          setDismissCounts((previous) => ({
            ...previous,
            [task.taskId]: count,
          }));
        }
      }
    } catch {
      setDismissCounts((previous) => ({
        ...previous,
        [task.taskId]: (previous[task.taskId] || 0) + 1,
      }));
    }

    setVisible(false);
  }

  function openReportPage() {
    setVisible(false);
    router.push("/documents/training-reports");
  }

  return (
    <>
      <button
        type="button"
        className={styles.notificationButton}
        onClick={() => setVisible(true)}
        aria-label={`งานรายงานผลที่ต้องส่ง ${count} รายการ`}
      >
        <span aria-hidden="true">!</span>
        <strong>รายงานผล</strong>
        <b>{count > 99 ? "99+" : count}</b>
      </button>

      {visible && (
        <div className={styles.backdrop} role="presentation">
          <section
            className={styles.popup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="training-report-popup-title"
          >
            <div className={styles.topBar}>
              <div>
                <small>
                  งานที่ {(currentIndex + 1).toLocaleString("th-TH")} /{" "}
                  {count.toLocaleString("th-TH")}
                </small>
                <h2 id="training-report-popup-title">ต้องส่งรายงานผล</h2>
              </div>
              <button type="button" onClick={dismiss} aria-label="ปิด">
                ×
              </button>
            </div>

            <div className={styles.subjectBox}>
              <small>เรื่อง</small>
              <strong>{task.subject || "ไม่ระบุเรื่อง"}</strong>
            </div>

            <dl className={styles.metaGrid}>
              <div>
                <dt>เลขหนังสือ</dt>
                <dd>{sourceBookNumber(task)}</dd>
              </div>
              <div>
                <dt>ผู้รับมอบหมาย</dt>
                <dd>{task.assigneeName || "-"}</dd>
              </div>
              <div>
                <dt>วันที่หนังสือ</dt>
                <dd>{formatDate(task.documentDate || task.receivedDate) || "-"}</dd>
              </div>
            </dl>

            {task.assignmentNote && (
              <p className={styles.note}>{task.assignmentNote}</p>
            )}

            <div className={styles.navigation}>
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => index - 1)}
                disabled={!hasPrevious}
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() => setCurrentIndex((index) => index + 1)}
                disabled={!hasNext}
              >
                ถัดไป
              </button>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={dismiss}>
                ไว้ภายหลัง
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={openReportPage}
              >
                ไปส่งรายงาน
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
