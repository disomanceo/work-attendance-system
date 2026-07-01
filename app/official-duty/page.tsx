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

  const [dutyStartDate, setDutyStartDate] = useState("");
  const [dutyEndDate, setDutyEndDate] = useState("");
  const [subject, setSubject] = useState("");
  const [location, setLocation] = useState("");
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const [note, setNote] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);

  const [myRequests, setMyRequests] = useState<OfficialDutyRequest[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setMessage("");

        try {
          const currentProfile = await loadProfile();
          await loadMyRequests();

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
  }, [loadMyRequests, loadProfile, router]);

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
    } catch (error) {
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "เกิดข้อผิดพลาด"
      );
    } finally {
      setSaving(false);
    }
  }

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
          <p>ส่งคำขอและตรวจสอบประวัติการไปราชการของตนเอง</p>
        </div>

        {profile && (
          <div className={styles.profileBox}>
            <strong>{profile.full_name}</strong>
            <small>{profile.position || profile.role}</small>
          </div>
        )}
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

      {loading ? (
        <section className={styles.loadingCard}>กำลังโหลดข้อมูล...</section>
      ) : (
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
      )}
    </main>
  );
}





