"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./AnnouncementReviewPopup.module.css";

type AnnouncementItem = {
  id: string;
  announcement_number: string | null;
  subject: string;
  announcement_date: string;
  responsible_user_id: string;
  responsible_name_snapshot: string;
  status: "PENDING" | "REVISION" | "APPROVED";
  latest_revision_note: string | null;
  updated_at: string;
  docx_file_url: string | null;
  pdf_file_url: string | null;
};

type Props = {
  role: string;
};

type SeenRecord = {
  seenAt?: string;
  dismissedAt?: string;
  dismissCount?: number;
};

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function getNotificationKey(announcement: AnnouncementItem) {
  return `${announcement.id}:${announcement.status}:${announcement.updated_at}`;
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

export default function AnnouncementReviewPopup({ role }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [open, setOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const isManager = role === "director" || role === "admin";
  const isStaffUser = role === "teacher" || role === "staff";

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

  const loadNotifications = useCallback(
    async (openWhenNew = true) => {
      if (!isManager && !isStaffUser) return;

      setLoading(true);
      setErrorMessage("");

      try {
        const { token, userId } = await getSessionData();

        if (!token || !userId) {
          throw new Error("ไม่พบ Session กรุณาเข้าสู่ระบบใหม่");
        }

        const params = new URLSearchParams({
          status: "all",
          sort: isManager ? "number_desc" : "updated_desc",
        });

        if (isStaffUser) {
          params.set("responsibleId", userId);
        }

        const response = await fetch(`/api/announcements?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.ok) {
          throw new Error(
            result.message || "โหลดข้อมูลแจ้งเตือนประกาศไม่สำเร็จ"
          );
        }

        const allAnnouncements = Array.isArray(result.announcements)
          ? (result.announcements as AnnouncementItem[])
          : [];

        let notificationItems = allAnnouncements
          .filter((announcement) => {
            if (isManager) return announcement.status === "PENDING";

            if (isStaffUser) {
              return (
                announcement.status === "REVISION" ||
                announcement.status === "APPROVED"
              );
            }

            return false;
          })
          .slice(0, 10);

        if (isStaffUser) {
          const seenRecords = await loadSeenRecords(
            token,
            notificationItems.map(getNotificationKey)
          );
          notificationItems = notificationItems.filter(
            (announcement) => !seenRecords[getNotificationKey(announcement)]?.seenAt
          );
        }

        setItems(notificationItems);
        setCurrentIndex((index) =>
          Math.min(index, Math.max(notificationItems.length - 1, 0))
        );

        if (notificationItems.length === 0) {
          setOpen(false);
          return;
        }

        if (!openWhenNew) return;

        const newest = notificationItems[0];
        const notificationKey = getNotificationKey(newest);

        const storageKey = isManager
          ? "director_last_seen_pending_announcement"
          : `staff_last_seen_announcement_result:${userId}`;

        const lastSeenKey = window.localStorage.getItem(storageKey);

        if (notificationKey !== lastSeenKey) {
          setCurrentIndex(0);
          setOpen(true);
          window.localStorage.setItem(storageKey, notificationKey);
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "โหลดข้อมูลแจ้งเตือนประกาศไม่สำเร็จ"
        );
      } finally {
        setLoading(false);
      }
    },
    [getSessionData, isManager, isStaffUser]
  );

  useEffect(() => {
    void loadNotifications(true);

    if (!isManager && !isStaffUser) return;

    const channel = supabase
      .channel(
        isManager
          ? "director-announcement-review-popup"
          : "staff-announcement-result-popup"
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "announcement_documents",
        },
        () => {
          void loadNotifications(true);
        }
      )
      .subscribe();

    const timer = window.setInterval(() => {
      void loadNotifications(true);
    }, 60000);

    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [isManager, isStaffUser, loadNotifications, supabase]);

  if (!isManager && !isStaffUser) return null;

  const current = items[currentIndex] ?? null;

  const isPending = current?.status === "PENDING";
  const isRevision = current?.status === "REVISION";
  const isApproved = current?.status === "APPROVED";

  async function markCurrentSeen() {
    if (!current || !isStaffUser) return;

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
          key: getNotificationKey(current),
          kind: "announcement-result",
          referenceId: current.id,
          metadata: {
            status: current.status,
            updatedAt: current.updated_at,
          },
        }),
      });
    } catch {
      // Closing the popup should not be blocked by a temporary network issue.
    }

    setItems((previous) => {
      const next = previous.filter((item) => item.id !== current.id);
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

  function goToAnnouncements() {
    setOpen(false);
    void markCurrentSeen();
    router.push("/announcements");
  }

  function showNext() {
    if (items.length <= 1) return;
    setCurrentIndex((index) => (index + 1) % items.length);
  }

  function getFloatingIcon() {
    if (items[0]?.status === "REVISION") return "✏️";
    if (items[0]?.status === "APPROVED") return "✅";
    return "🔔";
  }

  function getFloatingLabel() {
    return isManager ? "ประกาศรอพิจารณา" : "ผลพิจารณาประกาศ";
  }

  function getHeaderTitle() {
    if (isPending) return "มีประกาศใหม่รอพิจารณา";
    if (isRevision) return "ประกาศถูกส่งกลับให้แก้ไข";
    if (isApproved) return "ประกาศได้รับการอนุมัติแล้ว";
    return "แจ้งเตือนประกาศ";
  }

  function getStatusLabel() {
    if (isPending) return "รออนุมัติ";
    if (isRevision) return "ให้แก้ไข";
    if (isApproved) return "อนุมัติแล้ว";
    return "";
  }

  function getPrimaryButtonLabel() {
    if (isPending) return "ไปพิจารณาประกาศ";
    if (isRevision) return "ไปแก้ไขประกาศ";
    return "ดูรายละเอียดประกาศ";
  }

  return (
    <>
      {items.length > 0 && (
        <button
          type="button"
          style={{ bottom: "204px" }}
          className={`${styles.floatingButton} ${
            items[0]?.status === "REVISION"
              ? styles.floatingRevision
              : items[0]?.status === "APPROVED"
                ? styles.floatingApproved
                : styles.floatingPending
          }`}
          onClick={() => setOpen(true)}
          aria-label={`${getFloatingLabel()} ${items.length} รายการ`}
        >
          <span>{getFloatingIcon()}</span>
          <strong>{getFloatingLabel()}</strong>
          <b>{items.length}</b>
        </button>
      )}

      {open && current && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <section className={styles.modal}>
            <header
              className={`${styles.header} ${
                isRevision
                  ? styles.headerRevision
                  : isApproved
                    ? styles.headerApproved
                    : styles.headerPending
              }`}
            >
              <div>
                <small>
                  {isManager
                    ? "แจ้งเตือนสำหรับผู้บริหาร"
                    : "แจ้งเตือนสำหรับครู/เจ้าหน้าที่"}
                </small>

                <h2>
                  {getHeaderTitle()}
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
                  <div className={styles.numberRow}>
                    <strong>{current.announcement_number || "รอลำดับ"}</strong>

                    <span
                      className={
                        isRevision
                          ? styles.statusRevision
                          : isApproved
                            ? styles.statusApproved
                            : styles.statusPending
                      }
                    >
                      {getStatusLabel()}
                    </span>
                  </div>

                  <h3>{current.subject}</h3>

                  <dl>
                    <div>
                      <dt>วันที่ประกาศ</dt>
                      <dd>{formatThaiDate(current.announcement_date)}</dd>
                    </div>

                    <div>
                      <dt>ผู้รับผิดชอบ</dt>
                      <dd>{current.responsible_name_snapshot}</dd>
                    </div>

                    {isRevision && (
                      <div>
                        <dt>รายละเอียดแก้ไข</dt>
                        <dd>
                          {current.latest_revision_note?.trim() ||
                            "กรุณาตรวจสอบรายละเอียดในหน้าประกาศ"}
                        </dd>
                      </div>
                    )}

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
                    onClick={closeCurrent}
                  >
                    {isPending ? "ไว้ภายหลัง" : "ปิด"}
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
                    onClick={goToAnnouncements}
                  >
                    {getPrimaryButtonLabel()}
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
