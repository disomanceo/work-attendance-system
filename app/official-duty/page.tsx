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
import FeedbackToast from "@/components/ui/FeedbackToast";
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

function formatThaiDateRange(startDate: string, endDate?: string | null) {
  if (!endDate || endDate === startDate) return formatThaiDate(startDate);
  return `${formatThaiDate(startDate)} - ${formatThaiDate(endDate)}`;
}

function countInclusiveDays(startDate: string, endDate: string) {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T00:00:00+07:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(
    1,
    Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
  );
}

export default function OfficialDutyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("request");
  const [reviewFilter, setReviewFilter] =
    useState<ReviewFilter>("pending");

  const [dutyStartDate, setDutyStartDate] = useState("");
  const [dutyEndDate, setDutyEndDate] = useState("");
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
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

    if (!dutyStartDate) {
      setMessageType("error");
      setMessage("กรุณาเลือกวันที่ไป");
      return;
    }

    if (!dutyEndDate) {
      setMessageType("error");
      setMessage("กรุณาเลือกวันที่กลับ");
      return;
    }

    if (dutyEndDate < dutyStartDate) {
      setMessageType("error");
      setMessage("วันที่กลับต้องไม่ก่อนวันที่ไป");
      return;
    }

    if (subject.trim().length < 3) {
      setMessageType("error");
      setMessage("กรุณาระบุเรื่องไปราชการอย่างน้อย 3 ตัวอักษร");
      return;
    }

    if (location.trim().length < 2) {
      setMessageType("error");
      setMessage("กรุณาระบุสถานที่ไปราชการ");
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

      formData.set("dutyStartDate", dutyStartDate);
      formData.set("dutyEndDate", dutyEndDate);
      formData.set("subject", subject.trim());
      formData.set("location", location.trim());
      formData.set("evidenceDescription", evidenceDescription.trim());
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

      setDutyStartDate("");
      setDutyEndDate("");
      setSubject("");
      setLocation("");
      setEvidenceDescription("");
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
              วันที่ไป <b>*</b>
              <input
                type="date"
                value={dutyStartDate}
                onChange={(event) => {
                  setDutyStartDate(event.target.value);
                  if (!dutyEndDate || dutyEndDate < event.target.value) {
                    setDutyEndDate(event.target.value);
                  }
                }}
                required
              />
            </label>

            <label>
              วันที่กลับ <b>*</b>
              <input
                type="date"
                value={dutyEndDate}
                min={dutyStartDate || undefined}
                onChange={(event) => setDutyEndDate(event.target.value)}
                required
              />
              {dutyStartDate && dutyEndDate && (
                <small>
                  รวม {countInclusiveDays(dutyStartDate, dutyEndDate)} วัน
                </small>
              )}
            </label>

            <label>
              เรื่องไปราชการ <b>*</b>
              <textarea
                rows={3}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="เช่น เข้าร่วมอบรมเชิงปฏิบัติการ"
                required
              />
            </label>

            <label>
              สถานที่ <b>*</b>
              <input
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="เช่น สำนักงานเขตพื้นที่การศึกษาสุพรรณบุรี"
                required
              />
            </label>

            <label>
              หลักฐานไปราชการ
              <input
                value={evidenceDescription}
                onChange={(event) =>
                  setEvidenceDescription(event.target.value)
                }
                placeholder="เช่น หนังสือเชิญ หรือ กำหนดการ"
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

            <label>
              หมายเหตุเพิ่มเติม
              <textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
              />
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
                      <strong>
                        {request.official_duty_number || "-"} ·{" "}
                        {formatThaiDateRange(
                          request.duty_date,
                          request.duty_end_date
                        )}
                      </strong>
                      <span
                        className={`${styles.status} ${
                          styles[`status_${request.status}`] ?? ""
                        }`}
                      >
                        {STATUS_LABELS[request.status] ?? request.status}
                      </span>
                    </div>

                    <p>{request.subject || request.reason}</p>

                    {request.location && (
                      <small>สถานที่: {request.location}</small>
                    )}

                    <small>จำนวนวัน: {request.total_days || 1} วัน</small>

                    {request.evidence_description && (
                      <small>หลักฐาน: {request.evidence_description}</small>
                    )}

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

                    <div className={styles.documentLinks}>
                      {request.working_document_url && (
                        <a
                          href={request.working_document_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          เปิดเอกสารรอพิจารณา
                        </a>
                      )}

                      {request.pdf_file_url && (
                        <a
                          href={request.pdf_file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {request.pdf_file_name || "เปิด PDF"}
                        </a>
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
                    </div>
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
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}





