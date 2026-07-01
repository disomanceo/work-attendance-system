"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RequestProfileAvatar from "@/components/profile/RequestProfileAvatar";
import FeedbackToast from "@/components/ui/FeedbackToast";
import styles from "./official-duty-admin.module.css";

type OfficialDutyRequest = {
  id: string;
  full_name: string;
  position: string | null;
  duty_date: string;
  duty_end_date: string | null;
  total_days: number | null;
  subject: string | null;
  location: string | null;
  evidence_description: string | null;
  reason: string;
  note: string | null;
  attachment_file_url: string | null;
  attachment_file_name: string | null;
  official_duty_number: string | null;
  working_document_url: string | null;
  pdf_file_url: string | null;
  pdf_file_name: string | null;
  status: "pending" | "approved" | "rejected" | string;
  reviewer_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    position: string | null;
    role: string;
    profile_image_file_id: string | null;
  } | null;
};

type ListResponse = {
  ok: boolean;
  message?: string;
  requests?: OfficialDutyRequest[];
  pendingCount?: number;
};

type ReviewResponse = {
  ok: boolean;
  message?: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "รอพิจารณา",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatThaiDateRange(startDate: string, endDate?: string | null) {
  if (!endDate || endDate === startDate) return formatThaiDate(startDate);
  return `${formatThaiDate(startDate)} - ${formatThaiDate(endDate)}`;
}

export default function OfficialDutyAdminPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<OfficialDutyRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

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
      const response = await fetch("/api/admin/official-duty", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as ListResponse;

      if (!response.ok || !result.ok) {
        if (response.status === 403) {
          router.replace("/attendance");
          return;
        }

        throw new Error(
          result.message || "โหลดคำขอไปราชการไม่สำเร็จ"
        );
      }

      setRequests(result.requests ?? []);
      setPendingCount(result.pendingCount ?? 0);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
      );
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  async function reviewRequest(
    requestId: string,
    action: "approve" | "reject"
  ) {
    const confirmMessage =
      action === "approve"
        ? "ยืนยันอนุญาตให้ไปราชการ รายการนี้จะถูกบันทึกในระบบลงเวลา"
        : "ยืนยันไม่อนุญาตคำขอไปราชการรายการนี้";

    if (!window.confirm(confirmMessage)) return;

    setProcessingId(requestId);
    setMessage("");

    try {
      const token = await getAccessToken();
      const response = await fetch(
        `/api/admin/official-duty/${requestId}/review`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            reviewNote: reviewNotes[requestId]?.trim() || "",
          }),
        }
      );
      const result = (await response.json()) as ReviewResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "บันทึกผลการพิจารณาไม่สำเร็จ"
        );
      }

      setMessageType("success");
      setMessage(result.message || "บันทึกผลการพิจารณาแล้ว");
      await loadRequests();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
      );
    } finally {
      setProcessingId("");
    }
  }

  const visibleRequests =
    filter === "all"
      ? requests
      : requests.filter((request) => request.status === filter);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => router.push("/attendance")}
        >
          ← กลับหน้าหลัก
        </button>

        <div>
          <span>OFFICIAL DUTY REVIEW</span>
          <h1>พิจารณาไปราชการ</h1>
          <p>ตรวจสอบเอกสารและบันทึกผลการพิจารณา</p>
        </div>

        <div className={styles.pendingBox}>
          <strong>{pendingCount}</strong>
          <small>รายการรอพิจารณา</small>
        </div>
      </header>

      <FeedbackToast message={message} type={messageType} />

      {message && (
        <div
          role="alert"
          className={
            messageType === "success"
              ? styles.successMessage
              : styles.errorMessage
          }
        >
          {message}
        </div>
      )}

      <section className={styles.toolbar}>
        {(["pending", "all", "approved", "rejected"] as const).map(
          (item) => (
            <button
              type="button"
              key={item}
              className={filter === item ? styles.filterActive : ""}
              onClick={() => setFilter(item)}
            >
              {item === "all" ? "ทั้งหมด" : STATUS_LABELS[item]}
            </button>
          )
        )}
      </section>

      <section className={styles.list}>
        {loading ? (
          <div className={styles.empty}>กำลังโหลดข้อมูล...</div>
        ) : visibleRequests.length === 0 ? (
          <div className={styles.empty}>ไม่พบรายการในสถานะนี้</div>
        ) : (
          visibleRequests.map((request) => (
            <article className={styles.card} key={request.id}>
              <div className={styles.cardTop}>
                <div className={styles.requester}>
                  <RequestProfileAvatar
                    className={styles.requesterAvatar}
                    fileId={request.profiles?.profile_image_file_id}
                    name={request.full_name}
                  />

                  <div>
                    <h2>{request.full_name}</h2>
                    <p>{request.position || "ไม่ระบุตำแหน่ง"}</p>
                  </div>
                </div>

                <span
                  className={`${styles.status} ${
                    styles[`status_${request.status}`] ?? ""
                  }`}
                >
                  {STATUS_LABELS[request.status] ?? request.status}
                </span>
              </div>

              <dl className={styles.details}>
                <div>
                  <dt>เลขที่เอกสาร</dt>
                  <dd>{request.official_duty_number || "-"}</dd>
                </div>
                <div>
                  <dt>วันที่ไป-กลับ</dt>
                  <dd>
                    {formatThaiDateRange(
                      request.duty_date,
                      request.duty_end_date
                    )}
                  </dd>
                </div>
                <div>
                  <dt>จำนวนวัน</dt>
                  <dd>{request.total_days || 1} วัน</dd>
                </div>
                <div>
                  <dt>เรื่องไปราชการ</dt>
                  <dd>{request.subject || request.reason}</dd>
                </div>
                <div>
                  <dt>สถานที่</dt>
                  <dd>{request.location || "-"}</dd>
                </div>
                <div>
                  <dt>หลักฐาน</dt>
                  <dd>{request.evidence_description || "-"}</dd>
                </div>
                {request.note && (
                  <div>
                    <dt>หมายเหตุ</dt>
                    <dd>{request.note}</dd>
                  </div>
                )}
              </dl>

              <div className={styles.documentLinks}>
                {request.working_document_url && (
                  <a
                    className={styles.attachment}
                    href={request.working_document_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    เปิดเอกสารรอพิจารณา
                  </a>
                )}

                {request.pdf_file_url && (
                  <a
                    className={styles.attachment}
                    href={request.pdf_file_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {request.pdf_file_name || "เปิด PDF"}
                  </a>
                )}

                {request.attachment_file_url && (
                  <a
                    className={styles.attachment}
                    href={request.attachment_file_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    เปิดไฟล์แนบ
                    {request.attachment_file_name
                      ? ` (${request.attachment_file_name})`
                      : ""}
                  </a>
                )}
              </div>

              {request.status === "pending" ? (
                <div className={styles.reviewPanel}>
                  <label>
                    ความเห็นของผู้พิจารณา
                    <textarea
                      rows={3}
                      value={reviewNotes[request.id] ?? ""}
                      onChange={(event) =>
                        setReviewNotes((current) => ({
                          ...current,
                          [request.id]: event.target.value,
                        }))
                      }
                      placeholder="ระบุความเห็นเพิ่มเติม (ถ้ามี)"
                    />
                  </label>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.rejectButton}
                      disabled={processingId === request.id}
                      onClick={() =>
                        void reviewRequest(request.id, "reject")
                      }
                    >
                      ไม่อนุญาต
                    </button>
                    <button
                      type="button"
                      className={styles.approveButton}
                      disabled={processingId === request.id}
                      onClick={() =>
                        void reviewRequest(request.id, "approve")
                      }
                    >
                      {processingId === request.id
                        ? "กำลังบันทึก..."
                        : "อนุญาต"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.reviewResult}>
                  <strong>
                    ผู้พิจารณา: {request.reviewer_name || "-"}
                  </strong>
                  {request.review_note && (
                    <p>ความเห็น: {request.review_note}</p>
                  )}
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}

