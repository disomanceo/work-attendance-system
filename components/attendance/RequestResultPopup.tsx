"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./RequestResultPopup.module.css";

type ResultStatus = "approved" | "acknowledged" | "rejected" | "revision";
type ResultKind = "leave" | "official-duty" | "memo";

type ResultItem = {
  key: string;
  id: string;
  kind: ResultKind;
  status: ResultStatus;
  title: string;
  subtitle: string;
  detail: string;
  reviewNote: string;
  eventAt: string;
  href: string;
};

type LeaveRequest = {
  id: string;
  leave_type: "personal" | "sick";
  start_date: string;
  end_date: string;
  total_work_days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_note?: string | null;
  reviewed_at?: string | null;
  updated_at?: string | null;
  created_at: string;
};

type OfficialDutyRequest = {
  id: string;
  duty_date: string;
  duty_end_date: string | null;
  subject: string | null;
  location: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected" | string;
  review_note: string | null;
  reviewed_at: string | null;
  updated_at?: string | null;
  created_at: string;
};

type MemoRequest = {
  id: string;
  subject: string;
  reason: string;
  status: string;
  review_note?: string | null;
  reviewed_at?: string | null;
  updated_at?: string | null;
  created_at: string;
};

type SeenRecord = {
  seenAt?: string;
  dismissedAt?: string;
  dismissCount?: number;
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

function formatDateRange(startDate: string, endDate?: string | null) {
  if (!endDate || endDate === startDate) {
    return formatThaiDate(startDate);
  }

  return `${formatThaiDate(startDate)} ถึง ${formatThaiDate(endDate)}`;
}

function getEventAt(item: {
  reviewed_at?: string | null;
  updated_at?: string | null;
  created_at: string;
}) {
  return item.reviewed_at || item.updated_at || item.created_at;
}

function normalizeLeave(item: LeaveRequest): ResultItem | null {
  if (item.status !== "approved" && item.status !== "rejected") {
    return null;
  }

  const eventAt = getEventAt(item);
  const leaveLabel = item.leave_type === "sick" ? "ลาป่วย" : "ลากิจ";

  return {
    key: `leave:${item.id}:${item.status}:${eventAt}`,
    id: item.id,
    kind: "leave",
    status: item.status,
    title:
      item.status === "approved"
        ? "ใบลาได้รับการอนุมัติแล้ว"
        : "ใบลาไม่ได้รับการอนุมัติ",
    subtitle: `${leaveLabel} • ${formatDateRange(
      item.start_date,
      item.end_date
    )}`,
    detail: item.reason,
    reviewNote: item.review_note?.trim() || "",
    eventAt,
    href: "/leave",
  };
}

function normalizeOfficialDuty(
  item: OfficialDutyRequest
): ResultItem | null {
  if (item.status !== "approved" && item.status !== "rejected") {
    return null;
  }

  const eventAt = getEventAt(item);
  const subject = item.subject?.trim() || item.reason;

  return {
    key: `official-duty:${item.id}:${item.status}:${eventAt}`,
    id: item.id,
    kind: "official-duty",
    status: item.status,
    title:
      item.status === "approved"
        ? "คำขอไปราชการได้รับอนุญาตแล้ว"
        : "คำขอไปราชการไม่ได้รับอนุญาต",
    subtitle: `ไปราชการ • ${formatDateRange(
      item.duty_date,
      item.duty_end_date
    )}`,
    detail: subject,
    reviewNote: item.review_note?.trim() || "",
    eventAt,
    href: "/official-duty",
  };
}

function normalizeMemo(item: MemoRequest): ResultItem | null {
  if (
    item.status !== "approved" &&
    item.status !== "acknowledged" &&
    item.status !== "rejected" &&
    item.status !== "revision"
  ) {
    return null;
  }

  const eventAt = getEventAt(item);
  const subject = item.subject?.trim() || item.reason;
  const isApproved =
    item.status === "approved" || item.status === "acknowledged";

  return {
    key: `memo:${item.id}:${item.status}:${eventAt}`,
    id: item.id,
    kind: "memo",
    status: item.status as ResultStatus,
    title: isApproved
      ? "บันทึกข้อความได้รับการพิจารณาแล้ว"
      : item.status === "revision"
        ? "บันทึกข้อความถูกส่งกลับให้แก้ไข"
        : "บันทึกข้อความไม่อนุมัติ",
    subtitle: `บันทึกข้อความ • ${subject}`,
    detail: item.reason || subject,
    reviewNote: item.review_note?.trim() || "",
    eventAt,
    href: "/memo",
  };
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

export default function RequestResultPopup({ role }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<ResultItem[]>([]);
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const canReceiveResult = ["teacher", "staff", "janitor"].includes(role);

  const getSessionData = useCallback(async () => {
    const [sessionResult, userResult] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.getUser(),
    ]);

    return {
      token: sessionResult.data.session?.access_token ?? "",
      userId: userResult.data.user?.id ?? "",
    };
  }, [supabase]);

  const loadResults = useCallback(
    async (openWhenNew = true) => {
      if (!canReceiveResult) return;

      setLoading(true);
      setErrorMessage("");

      try {
        const { token, userId } = await getSessionData();

        if (!token || !userId) {
          throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
        }

        const headers = {
          Authorization: `Bearer ${token}`,
        };

        const [leaveResponse, dutyResponse, memoResponse] = await Promise.all([
          fetch("/api/leave", {
            headers,
            cache: "no-store",
          }),
          fetch("/api/official-duty", {
            headers,
            cache: "no-store",
          }),
          fetch("/api/memo", {
            headers,
            cache: "no-store",
          }),
        ]);

        const [leaveResult, dutyResult, memoResult] = await Promise.all([
          leaveResponse.json(),
          dutyResponse.json(),
          memoResponse.json(),
        ]);

        if (!leaveResponse.ok || !leaveResult.ok) {
          throw new Error(
            leaveResult.message || "โหลดผลพิจารณาใบลาไม่สำเร็จ"
          );
        }

        if (!dutyResponse.ok || !dutyResult.ok) {
          throw new Error(
            dutyResult.message || "โหลดผลพิจารณาไปราชการไม่สำเร็จ"
          );
        }

        if (!memoResponse.ok || !memoResult.ok) {
          throw new Error(
            memoResult.message || "โหลดผลพิจารณาบันทึกข้อความไม่สำเร็จ"
          );
        }

        const leaveItems = (
          Array.isArray(leaveResult.requests)
            ? (leaveResult.requests as LeaveRequest[])
            : []
        )
          .map(normalizeLeave)
          .filter((item): item is ResultItem => item !== null);

        const dutyItems = (
          Array.isArray(dutyResult.requests)
            ? (dutyResult.requests as OfficialDutyRequest[])
            : []
        )
          .map(normalizeOfficialDuty)
          .filter((item): item is ResultItem => item !== null);

        const memoItems = (
          Array.isArray(memoResult.requests)
            ? (memoResult.requests as MemoRequest[])
            : []
        )
          .map(normalizeMemo)
          .filter((item): item is ResultItem => item !== null);

        const allItems = [...leaveItems, ...dutyItems, ...memoItems]
          .sort(
            (first, second) =>
              new Date(second.eventAt).getTime() -
              new Date(first.eventAt).getTime()
          )
          .slice(0, 20);
        const seenRecords = await loadSeenRecords(
          token,
          allItems.map((item) => item.key)
        );
        const nextItems = allItems.filter(
          (item) => !seenRecords[item.key]?.seenAt
        );

        setItems(nextItems);
        setCurrentIndex((index) =>
          Math.min(index, Math.max(nextItems.length - 1, 0))
        );

        if (nextItems.length === 0) {
          setOpen(false);
          return;
        }

        if (!openWhenNew) return;

        const newest = nextItems[0];
        const storageKey = `request_result_last_seen:${userId}`;
        const lastSeenKey = window.localStorage.getItem(storageKey);

        if (newest.key !== lastSeenKey) {
          setCurrentIndex(0);
          setOpen(true);
          window.localStorage.setItem(storageKey, newest.key);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "โหลดผลพิจารณารายการไม่สำเร็จ"
        );
      } finally {
        setLoading(false);
      }
    },
    [canReceiveResult, getSessionData]
  );

  useEffect(() => {
    void loadResults(true);

    if (!canReceiveResult) return;

    const leaveChannel = supabase
      .channel("staff-leave-result-popup")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leave_requests",
        },
        () => {
          void loadResults(true);
        }
      )
      .subscribe();

    const dutyChannel = supabase
      .channel("staff-official-duty-result-popup")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "official_duty_requests",
        },
        () => {
          void loadResults(true);
        }
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadResults(true);
    }, 60000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(leaveChannel);
      void supabase.removeChannel(dutyChannel);
    };
  }, [canReceiveResult, loadResults, supabase]);

  if (!canReceiveResult) return null;

  const current = items[currentIndex] ?? null;
  const isApproved =
    current?.status === "approved" || current?.status === "acknowledged";

  async function markCurrentSeen() {
    if (!current) return;

    try {
      const { token } = await getSessionData();
      if (!token) return;

      await fetch("/api/notifications/seen", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "mark",
          key: current.key,
          kind: `request-result:${current.kind}`,
          referenceId: current.id,
          metadata: {
            status: current.status,
            eventAt: current.eventAt,
          },
        }),
      });
    } catch {
      // The local popup can still close even if the acknowledgement retry fails.
    }

    setItems((previous) => {
      const next = previous.filter((item) => item.key !== current.key);
      setCurrentIndex((index) =>
        Math.min(index, Math.max(next.length - 1, 0))
      );
      return next;
    });
  }

  async function closeCurrent() {
    setOpen(false);
    await markCurrentSeen();
  }

  function goToDetail() {
    if (!current) return;
    setOpen(false);
    void markCurrentSeen();
    router.push(current.href);
  }

  function showPrevious() {
    if (items.length <= 1) return;

    setCurrentIndex((index) =>
      index === 0 ? items.length - 1 : index - 1
    );
  }

  function showNext() {
    if (items.length <= 1) return;

    setCurrentIndex((index) =>
      index === items.length - 1 ? 0 : index + 1
    );
  }

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          style={{ bottom: "84px" }}
          className={`${styles.floatingButton} ${
            items[0]?.status === "approved" ||
            items[0]?.status === "acknowledged"
              ? styles.floatingApproved
              : styles.floatingRejected
          }`}
          onClick={() => setOpen(true)}
          aria-label={`ผลพิจารณาคำขอ ${items.length} รายการ`}
        >
          <span>
            {items[0]?.status === "approved" ||
            items[0]?.status === "acknowledged"
              ? "✅"
              : "❌"}
          </span>
          <strong>ผลพิจารณาคำขอ</strong>
          <b>{items.length}</b>
        </button>
      )}

      {open && current && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <section className={styles.modal}>
            <header
              className={`${styles.header} ${
                isApproved
                  ? styles.headerApproved
                  : styles.headerRejected
              }`}
            >
              <div>
                <small>แจ้งเตือนสำหรับครู/เจ้าหน้าที่</small>
                <h2>
                  {current.title}
                  <span>
                    {currentIndex + 1} จาก {items.length}
                  </span>
                </h2>
              </div>

              <button
                type="button"
                className={styles.closeButton}
                onClick={closeCurrent}
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
                  <div className={styles.statusRow}>
                    <strong>
                      {current.kind === "leave"
                        ? "ระบบการลา"
                        : current.kind === "official-duty"
                          ? "ระบบไปราชการ"
                          : "ระบบบันทึกข้อความ"}
                    </strong>

                    <span
                      className={
                        isApproved
                          ? styles.statusApproved
                          : styles.statusRejected
                      }
                    >
                      {isApproved ? "อนุมัติแล้ว" : "ไม่อนุมัติ"}
                    </span>
                  </div>

                  <h3>{current.subtitle}</h3>

                  <dl>
                    <div>
                      <dt>รายละเอียด</dt>
                      <dd>{current.detail}</dd>
                    </div>

                    {!isApproved && (
                      <div>
                        <dt>เหตุผล</dt>
                        <dd>
                          {current.reviewNote ||
                            "กรุณาตรวจสอบรายละเอียดในหน้ารายการ"}
                        </dd>
                      </div>
                    )}
                  </dl>
                </article>

                {items.length > 1 && (
                  <div className={styles.navigation}>
                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={showPrevious}
                    >
                      ‹ ก่อนหน้า
                    </button>

                    <button
                      type="button"
                      className={styles.secondary}
                      onClick={showNext}
                    >
                      ถัดไป ›
                    </button>
                  </div>
                )}

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={closeCurrent}
                  >
                    ปิด
                  </button>

                  <button
                    type="button"
                    className={styles.primary}
                    onClick={goToDetail}
                  >
                    ดูรายละเอียด
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
