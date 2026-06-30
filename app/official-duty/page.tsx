"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RequestProfileAvatar from "@/components/profile/RequestProfileAvatar";
import styles from "./official-duty.module.css";

type Profile = {
  full_name: string;
  position: string | null;
  role: string;
};

type OfficialDutyRequest = {
  id: string;
  full_name?: string;
  position?: string | null;
  duty_date: string;
  reason: string;
  note: string | null;
  attachment_file_url: string | null;
  attachment_file_name: string | null;
  status: "pending" | "approved" | "rejected" | string;
  review_note: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: {
    full_name: string;
    position: string | null;
    role: string;
    profile_image_file_id: string | null;
  } | null;
};

type ApiResponse = {
  ok: boolean;
  message?: string;
  requests?: OfficialDutyRequest[];
  pendingCount?: number;
};

type ViewMode = "request" | "review";
type ReviewFilter = "pending" | "all" | "approved" | "rejected";

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

export default function OfficialDutyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("request");
  const [reviewFilter, setReviewFilter] =
    useState<ReviewFilter>("pending");

  const [dutyDate, setDutyDate] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const [myRequests, setMyRequests] = useState<OfficialDutyRequest[]>([]);
  const [reviewRequests, setReviewRequests] =
    useState<OfficialDutyRequest[]>([]);
  const [reviewNotes, setReviewNotes] =
    useState<Record<string, string>>({});
  const [pendingCount, setPendingCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<"success" | "error">("success");

  const canReview = Boolean(
    profile && ["director", "admin"].includes(profile.role)
  );

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

  const loadProfile = useCallback(async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      throw new Error("ไม่พบข้อมูลผู้ใช้งาน");
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("full_name,position,role")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      throw new Error("โหลดข้อมูลผู้ใช้งานไม่สำเร็จ");
    }

    setProfile(data as Profile);
    return data as Profile;
  }, [router, supabase]);

  const loadMyRequests = useCallback(async () => {
    const token = await getAccessToken();
    const response = await fetch("/api/official-duty", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const result = (await response.json()) as ApiResponse;

    if (!response.ok || !result.ok) {
      throw new Error(
        result.message || "โหลดประวัติการไปราชการไม่สำเร็จ"
      );
    }

    setMyRequests(result.requests ?? []);
  }, [getAccessToken]);

  const loadReviewRequests = useCallback(async () => {
    setReviewLoading(true);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/official-duty", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "โหลดคำขอไปราชการไม่สำเร็จ"
        );
      }

      setReviewRequests(result.requests ?? []);
      setPendingCount(result.pendingCount ?? 0);
    } finally {
      setReviewLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setMessage("");

        try {
          const currentProfile = await loadProfile();
          await loadMyRequests();

          if (["director", "admin"].includes(currentProfile.role)) {
            await loadReviewRequests();
          }
        } catch (error) {
          setMessageType("error");
          setMessage(
            error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
          );
        } finally {
          setLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadMyRequests, loadProfile, loadReviewRequests, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!dutyDate) {
      setMessageType("error");
      setMessage("กรุณาเลือกวันที่ไปราชการ");
      return;
    }

    if (reason.trim().length < 3) {
      setMessageType("error");
      setMessage("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }

    if (attachment && attachment.size > 5 * 1024 * 1024) {
      setMessageType("error");
      setMessage("ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB");
      return;
    }

    setSaving(true);

    try {
      const token = await getAccessToken();
      const formData = new FormData();

      formData.set("dutyDate", dutyDate);
      formData.set("reason", reason.trim());
      formData.set("note", note.trim());

      if (attachment) {
        formData.set("attachment", attachment);
      }

      const response = await fetch("/api/official-duty", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ส่งคำขอไปราชการไม่สำเร็จ"
        );
      }

      setDutyDate("");
      setReason("");
      setNote("");
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setMessageType("success");
      setMessage(
        result.message || "ส่งคำขอไปราชการเรียบร้อยแล้ว"
      );

      await loadMyRequests();
      if (canReview) await loadReviewRequests();
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
      );
    } finally {
      setSaving(false);
    }
  }

  async function reviewRequest(
    requestId: string,
    action: "approve" | "reject"
  ) {
    const confirmed = window.confirm(
      action === "approve"
        ? "ยืนยันอนุญาตให้ไปราชการ รายการนี้จะถูกบันทึกในระบบลงเวลา"
        : "ยืนยันไม่อนุญาตคำขอไปราชการรายการนี้"
    );

    if (!confirmed) return;

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
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "บันทึกผลการพิจารณาไม่สำเร็จ"
        );
      }

      setMessageType("success");
      setMessage(result.message || "บันทึกผลการพิจารณาแล้ว");

      await Promise.all([loadMyRequests(), loadReviewRequests()]);
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
      );
    } finally {
      setProcessingId("");
    }
  }

  const visibleReviewRequests =
    reviewFilter === "all"
      ? reviewRequests
      : reviewRequests.filter(
          (request) => request.status === reviewFilter
        );

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

        <div className={styles.headerTitle}>
          <span>OFFICIAL DUTY</span>
          <h1>ขออนุญาตไปราชการ</h1>
          <p>
            ส่งคำขอ ตรวจสอบประวัติ
            {canReview ? " และพิจารณาคำขอภายในหน้าเดียว" : ""}
          </p>
        </div>

        {profile && (
          <div className={styles.profileBox}>
            <strong>{profile.full_name}</strong>
            <small>{profile.position || profile.role}</small>
          </div>
        )}
      </header>

      {canReview && (
        <nav className={styles.pageTabs}>
          <button
            type="button"
            className={
              viewMode === "request" ? styles.pageTabActive : ""
            }
            onClick={() => setViewMode("request")}
          >
            แบบคำขอและประวัติ
          </button>

          <button
            type="button"
            className={
              viewMode === "review" ? styles.pageTabActive : ""
            }
            onClick={() => setViewMode("review")}
          >
            พิจารณาคำขอ
            {pendingCount > 0 && (
              <span className={styles.badge}>{pendingCount}</span>
            )}
          </button>
        </nav>
      )}

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

      {loading ? (
        <section className={styles.loadingCard}>กำลังโหลดข้อมูล...</section>
      ) : viewMode === "request" ? (
        <section className={styles.requestGrid}>
          <form className={styles.card} onSubmit={handleSubmit}>
            <div className={styles.cardHeading}>
              <div className={styles.iconBox}>✈</div>
              <div>
                <h2>แบบคำขออนุญาต</h2>
                <p>กรอกข้อมูลภารกิจให้ครบถ้วน</p>
              </div>
            </div>

            <label>
              วันที่ไปราชการ <b>*</b>
              <input
                type="date"
                value={dutyDate}
                onChange={(event) => setDutyDate(event.target.value)}
                required
              />
            </label>

            <label>
              เหตุผลหรือภารกิจ <b>*</b>
              <textarea
                rows={5}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="เช่น เข้าร่วมประชุม อบรม หรือปฏิบัติภารกิจราชการ"
                required
              />
            </label>

            <label>
              หมายเหตุเพิ่มเติม
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
              />
            </label>

            <label>
              ไฟล์แนบ
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                onChange={(event) =>
                  setAttachment(event.target.files?.[0] ?? null)
                }
              />
              <small>รองรับ JPG, PNG และ PDF ขนาดไม่เกิน 5 MB</small>
            </label>

            <button
              type="submit"
              className={styles.submitButton}
              disabled={saving}
            >
              {saving ? "กำลังส่งคำขอ..." : "ส่งคำขอไปราชการ"}
            </button>
          </form>

          <section className={styles.card}>
            <div className={styles.cardHeading}>
              <div className={styles.iconBox}>◷</div>
              <div>
                <h2>ประวัติการขออนุญาต</h2>
                <p>รายการคำขอไปราชการของคุณ</p>
              </div>
            </div>

            {myRequests.length === 0 ? (
              <div className={styles.empty}>ยังไม่มีคำขอไปราชการ</div>
            ) : (
              <div className={styles.requestList}>
                {myRequests.map((request) => (
                  <article
                    className={styles.requestItem}
                    key={request.id}
                  >
                    <div className={styles.requestTop}>
                      <strong>{formatThaiDate(request.duty_date)}</strong>
                      <span
                        className={`${styles.status} ${
                          styles[`status_${request.status}`] ?? ""
                        }`}
                      >
                        {STATUS_LABELS[request.status] ?? request.status}
                      </span>
                    </div>

                    <p>{request.reason}</p>

                    {request.note && (
                      <small>หมายเหตุ: {request.note}</small>
                    )}

                    {request.reviewer_name && (
                      <small>
                        ผู้พิจารณา: {request.reviewer_name}
                      </small>
                    )}

                    {request.review_note && (
                      <small>ความเห็น: {request.review_note}</small>
                    )}

                    {request.attachment_file_url && (
                      <a
                        href={request.attachment_file_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        เปิดไฟล์แนบ
                      </a>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      ) : (
        <section className={styles.reviewSection}>
          <div className={styles.reviewHeader}>
            <div>
              <h2>พิจารณาคำขอไปราชการ</h2>
              <p>ตรวจสอบเอกสารและบันทึกผลการพิจารณา</p>
            </div>

            <div className={styles.reviewFilters}>
              {(
                ["pending", "all", "approved", "rejected"] as const
              ).map((item) => (
                <button
                  type="button"
                  key={item}
                  className={
                    reviewFilter === item
                      ? styles.reviewFilterActive
                      : ""
                  }
                  onClick={() => setReviewFilter(item)}
                >
                  {item === "all" ? "ทั้งหมด" : STATUS_LABELS[item]}
                </button>
              ))}
            </div>
          </div>

          {reviewLoading ? (
            <div className={styles.empty}>กำลังโหลดรายการ...</div>
          ) : visibleReviewRequests.length === 0 ? (
            <div className={styles.empty}>ไม่พบรายการในสถานะนี้</div>
          ) : (
            <div className={styles.reviewList}>
              {visibleReviewRequests.map((request) => (
                <article className={styles.reviewCard} key={request.id}>
                  <div className={styles.reviewCardTop}>
                    <div className={styles.requester}>
                      <RequestProfileAvatar
                        className={styles.requesterAvatar}
                        fileId={request.profiles?.profile_image_file_id}
                        name={request.full_name}
                      />

                      <div>
                        <h3>{request.full_name || "ไม่ระบุชื่อ"}</h3>
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
                      <dt>วันที่ไปราชการ</dt>
                      <dd>{formatThaiDate(request.duty_date)}</dd>
                    </div>
                    <div>
                      <dt>เหตุผลหรือภารกิจ</dt>
                      <dd>{request.reason}</dd>
                    </div>
                    {request.note && (
                      <div>
                        <dt>หมายเหตุ</dt>
                        <dd>{request.note}</dd>
                      </div>
                    )}
                  </dl>

                  {request.attachment_file_url && (
                    <a
                      className={styles.attachment}
                      href={request.attachment_file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      เปิดไฟล์แนบ
                    </a>
                  )}

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
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}





