"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./leave.module.css";
type LeaveRequest = {
  id: string;
  leave_type: "personal" | "sick";
  start_date: string;
  end_date: string;
  total_work_days: number;
  reason: string;
  fiscal_year: number;
  submission_kind: "advance" | "urgent" | "retrospective" | "overdue";
  status: "pending" | "approved" | "rejected" | "cancelled";
  sequence_number: number | null;
  leave_number: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  evidence_file_id: string | null;
  evidence_file_url: string | null;
  evidence_description: string | null;
  working_document_id: string | null;
  working_document_url: string | null;
  pdf_file_id: string | null;
  pdf_file_url: string | null;
  medical_certificate_required: boolean;
  created_at: string;
};


type AdminPendingLeaveRequest = {
  id: string;
  leave_type: "personal" | "sick";
  start_date: string;
  end_date: string;
  total_work_days: number;
  reason: string;
  fiscal_year: number;
  submission_kind: string;
  attachment_path: string | null;
  medical_certificate_required: boolean;
  status: string;
  profiles: {
    full_name: string;
    position: string | null;
    role: string;
  } | null;
};

type Summary = {
  fiscalYear: number;
  sick: { times: number; days: number };
  personal: { times: number; days: number };
};

type LeaveSettings = {
  fiscalYear: number;
  sickLeaveDays: number;
  personalLeaveDays: number;
};

function thaiFiscalYear(year: number | null | undefined) {
  if (!year || year < 2500 || year > 2700) {
    return "ยังไม่ได้กำหนด";
  }
  return String(year);
}

function leaveLabel(type: LeaveRequest["leave_type"]) {
  return type === "sick" ? "ลาป่วย" : "ลากิจ";
}

function statusLabel(status: LeaveRequest["status"]) {
  const labels = {
    pending: "รอพิจารณา",
    approved: "อนุมัติ",
    rejected: "ไม่อนุมัติ",
    cancelled: "ยกเลิก",
  };
  return labels[status];
}

function submissionLabel(kind: LeaveRequest["submission_kind"]) {
  const labels = {
    advance: "ยื่นล่วงหน้า",
    urgent: "ยื่นกระชั้นชิด",
    retrospective: "ยื่นย้อนหลัง",
    overdue: "ยื่นเกินกำหนด",
  };
  return labels[kind];
}


async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 75000
) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "ระบบใช้เวลาส่งใบลานานเกินกำหนด กรุณาตรวจสอบ Google Apps Script แล้วลองใหม่"
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export default function LeavePage() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [leaveSettings, setLeaveSettings] =
    useState<LeaveSettings | null>(null);
  const [leaveType, setLeaveType] =
    useState<LeaveRequest["leave_type"]>("personal");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [evidenceDescription, setEvidenceDescription] = useState("");
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [profileRole, setProfileRole] = useState("");
  const [pendingRequests, setPendingRequests] =
    useState<AdminPendingLeaveRequest[]>([]);
  const [processingId, setProcessingId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const getToken = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const token = await getToken();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error("ไม่พบข้อมูลผู้ใช้งาน");
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profileError || !profileData) {
        throw new Error("ไม่สามารถตรวจสอบสิทธิ์ผู้ใช้งานได้");
      }

      const currentRole = String(profileData.role || "");
      const canReviewLeave = ["director", "admin"].includes(currentRole);
      setProfileRole(currentRole);

      const [leaveResponse, settingsResponse, pendingResponse] = await Promise.all([
        fetchWithTimeout("/api/leave", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetchWithTimeout("/api/leave/settings", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        canReviewLeave
          ? fetchWithTimeout("/api/admin/leave?status=pending", {
              headers: { Authorization: `Bearer ${token}` },
              cache: "no-store",
            })
          : Promise.resolve(null),
      ]);

      const leaveResult = await leaveResponse.json();
      const settingsResult = await settingsResponse.json();
      const pendingResult = pendingResponse
        ? await pendingResponse.json()
        : { ok: true, requests: [] };

      if (!leaveResponse.ok || !leaveResult.ok) {
        throw new Error(
          leaveResult.message || "โหลดข้อมูลการลาไม่สำเร็จ"
        );
      }

      if (!settingsResponse.ok || !settingsResult.success) {
        throw new Error(
          settingsResult.detail ||
            settingsResult.message ||
            "โหลดข้อมูลปีงบประมาณไม่สำเร็จ"
        );
      }

      if (
        pendingResponse &&
        (!pendingResponse.ok || !pendingResult.ok)
      ) {
        throw new Error(
          pendingResult.message || "โหลดใบลารอพิจารณาไม่สำเร็จ"
        );
      }

      setPendingRequests(
        Array.isArray(pendingResult.requests)
          ? pendingResult.requests
          : []
      );

      const loadedRequests: LeaveRequest[] =
        Array.isArray(leaveResult.requests)
          ? leaveResult.requests
          : [];

      const settings: LeaveSettings =
        settingsResult.settings;

      const approvedCurrentYear =
        loadedRequests.filter(
          (item) =>
            item.status === "approved" &&
            Number(item.fiscal_year) ===
              Number(settings.fiscalYear)
        );

      const sickRequests =
        approvedCurrentYear.filter(
          (item) => item.leave_type === "sick"
        );

      const personalRequests =
        approvedCurrentYear.filter(
          (item) => item.leave_type === "personal"
        );

      const calculatedSummary: Summary = {
        fiscalYear: settings.fiscalYear,
        sick: {
          times: sickRequests.length,
          days: sickRequests.reduce(
            (total, item) =>
              total +
              Number(item.total_work_days || 0),
            0
          ),
        },
        personal: {
          times: personalRequests.length,
          days: personalRequests.reduce(
            (total, item) =>
              total +
              Number(item.total_work_days || 0),
            0
          ),
        },
      };

      setRequests(loadedRequests);
      setLeaveSettings(settings);
      setSummary(calculatedSummary);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "โหลดข้อมูลไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }, [getToken, supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!attachment) {
      setAttachmentPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [attachment]);

  async function submitLeave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const token = await getToken();
      const form = new FormData();
      form.set("leaveType", leaveType);
      form.set("startDate", startDate);
      form.set("endDate", endDate);
      form.set("reason", reason);
      form.set("lateSubmissionReason", "");
      form.set("evidenceDescription", attachment ? evidenceDescription.trim() || "-" : "-");
      if (attachment) form.set("attachment", attachment);

      const response = await fetchWithTimeout("/api/leave", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ส่งใบลาไม่สำเร็จ");
      }

      setMessage(
        `${result.message} หากได้รับอนุมัติ จะเป็น${leaveLabel(
          leaveType
        )}ครั้งที่ ${result.previewSequence}`
      );
      setStartDate("");
      setEndDate("");
      setReason("");
      setAttachment(null);
      setEvidenceDescription("");
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ส่งใบลาไม่สำเร็จ"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteLeave(item: LeaveRequest) {
    const confirmed = window.confirm(
      `ยืนยันลบ${leaveLabel(item.leave_type)} วันที่ ${item.start_date} ถึง ${item.end_date} ใช่หรือไม่?\n\nเมื่อลบแล้ว รายการนี้จะไม่ถูกนำไปนับในระบบลงเวลาและรายงาน PDF`
    );

    if (!confirmed) return;

    setDeletingId(item.id);
    setMessage("");
    setErrorMessage("");

    try {
      const token = await getToken();
      const response = await fetchWithTimeout("/api/leave", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId: item.id }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "ลบใบลาไม่สำเร็จ");
      }

      setMessage(result.message || "ลบใบลาเรียบร้อยแล้ว");
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "ลบใบลาไม่สำเร็จ"
      );
    } finally {
      setDeletingId("");
    }
  }


  async function reviewLeave(
    requestId: string,
    action: "approve" | "reject"
  ) {
    const note =
      action === "reject"
        ? window.prompt("ระบุเหตุผลที่ไม่อนุมัติ")?.trim() ?? ""
        : "";

    if (action === "reject" && note.length < 5) {
      setErrorMessage(
        "กรุณาระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 5 ตัวอักษร"
      );
      return;
    }

    setProcessingId(requestId);
    setMessage("");
    setErrorMessage("");

    try {
      const token = await getToken();
      const response = await fetchWithTimeout("/api/admin/leave", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, action, note }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกผลไม่สำเร็จ");
      }

      setMessage(result.message || "บันทึกผลเรียบร้อยแล้ว");
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "บันทึกผลไม่สำเร็จ"
      );
    } finally {
      setProcessingId("");
    }
  }

  async function openAttachment(requestId: string) {
    const token = await getToken();
    const response = await fetchWithTimeout(
      `/api/leave/attachment?requestId=${encodeURIComponent(requestId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      setErrorMessage("เปิดไฟล์แนบไม่สำเร็จ");
      return;
    }

    const blob = await response.blob();
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.page}>
<div className={styles.pageContent}>
<header className={styles.header}>
<div className={styles.headerTitle}>
            <h1>ขออนุญาตลาป่วย-ลากิจ</h1>
            <p>กรอกข้อมูลเพื่อยื่นใบลา</p>
          </div>
        </header>

      {summary && leaveSettings && (
        <section className={styles.summaryGrid}>
          <article>
            <small>ปีงบประมาณ</small>
            <strong>
              {thaiFiscalYear(
                leaveSettings.fiscalYear
              )}
            </strong>
          </article>

          <article>
            <small>ลาป่วย</small>
            <strong>
              {summary.sick.days} วัน
            </strong>
            <span>จาก {leaveSettings.sickLeaveDays} วัน</span>
          </article>

          <article>
            <small>ลากิจ</small>
            <strong>
              {summary.personal.days} วัน
            </strong>
            <span>จาก {leaveSettings.personalLeaveDays} วัน</span>
          </article>
        </section>
      )}

      {message && <div className={styles.success}>{message}</div>}
      {errorMessage && <div className={styles.error}>{errorMessage}</div>}

      <section className={styles.grid}>
        <form className={styles.formCard} onSubmit={submitLeave}>
          <h2>เลือกประเภทการลา</h2>

          <div className={styles.typeGrid}>
            <button
              type="button"
              className={leaveType === "personal" ? styles.activeType : ""}
              onClick={() => setLeaveType("personal")}
            >
              ลากิจ
              <small>ควรยื่นล่วงหน้า 3 วันทำการ</small>
            </button>
            <button
              type="button"
              className={leaveType === "sick" ? styles.activeType : ""}
              onClick={() => setLeaveType("sick")}
            >
              ลาป่วย
              <small>ย้อนหลังได้ภายใน 3 วันทำการ</small>
            </button>
          </div>

          <div className={styles.dateGrid}>
            <label>
              วันเริ่มลา
              <input
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              วันสิ้นสุด
              <input
                type="date"
                required
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>

          <label>
            เหตุผลการลา
            <textarea
              required
              minLength={5}
              maxLength={300}
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="ระบุเหตุผลอย่างน้อย 5 ตัวอักษร"
            />
          </label>

          <div>
            <span style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
              {leaveType === "sick"
                ? "ใบรับรองแพทย์หรือหลักฐาน"
                : "หลักฐานประกอบ เช่น รูปถ่าย (ไม่บังคับ)"}
            </span>

            <input
              ref={attachmentInputRef}
              id="leave-attachment"
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setAttachment(selected);
                if (!selected) setEvidenceDescription("");
              }}
            />

            <label
              htmlFor="leave-attachment"
              style={{
                display: "flex",
                minHeight: 112,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 8,
                padding: 18,
                border: "2px dashed #8b5cf6",
                borderRadius: 16,
                background: attachment ? "#f5f3ff" : "#faf7ff",
                color: "#5b21b6",
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 34 }}>📷</span>
              <strong>
                {attachment ? "แตะเพื่อเปลี่ยนรูปหลักฐาน" : "แตะเพื่อเลือกรูปจากเครื่องหรือมือถือ"}
              </strong>
              <small style={{ color: "#6b7280" }}>รองรับ JPG และ PNG ขนาดไม่เกิน 5 MB</small>
            </label>

            {attachment && (
              <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "88px minmax(0, 1fr)",
                    gap: 12,
                    alignItems: "center",
                    padding: 12,
                    border: "1px solid #ddd6fe",
                    borderRadius: 14,
                    background: "#ffffff",
                  }}
                >
                  {attachmentPreviewUrl && (
                    <img
                      src={attachmentPreviewUrl}
                      alt="ตัวอย่างหลักฐานที่เลือก"
                      style={{
                        width: 88,
                        height: 88,
                        objectFit: "cover",
                        borderRadius: 12,
                        border: "1px solid #ddd6fe",
                      }}
                    />
                  )}

                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", wordBreak: "break-word" }}>
                      {attachment.name}
                    </strong>
                    <small>{(attachment.size / 1024 / 1024).toFixed(2)} MB</small>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachment(null);
                          setEvidenceDescription("");
                          if (attachmentInputRef.current) {
                            attachmentInputRef.current.value = "";
                          }
                        }}
                        style={{
                          border: "1px solid #dc2626",
                          borderRadius: 8,
                          background: "white",
                          color: "#dc2626",
                          padding: "7px 12px",
                          cursor: "pointer",
                        }}
                      >
                        ลบรูปหลักฐาน
                      </button>
                    </div>
                  </div>
                </div>

                <label>
                  คำอธิบายใต้รูป (ไม่บังคับ)
                  <input
                    type="text"
                    minLength={2}
                    maxLength={100}
                    value={evidenceDescription}
                    onChange={(event) => setEvidenceDescription(event.target.value)}
                    placeholder="เช่น ใบรับรองแพทย์ หรือรายละเอียดเพิ่มเติม"
                  />
                </label>
              </div>
            )}

            {!attachment && (
              <small style={{ display: "block", marginTop: 8 }}>
                ไม่ได้แนบไฟล์ ระบบจะระบุหลักฐานเป็นเครื่องหมาย - ในเอกสาร
              </small>
            )}

            <small style={{ display: "block", marginTop: 8 }}>
              ลาป่วยตั้งแต่ 3 วันทำการบังคับแนบใบรับรองแพทย์
            </small>
          </div>

          <button className={styles.submitButton} disabled={saving}>
            {saving ? "กำลังส่งใบลา..." : "ส่งใบลาเพื่อรอพิจารณา"}
          </button>
        </form>

        <section className={styles.historyCard}>
          <button
            type="button"
            className={styles.historyToggle}
            onClick={() => setHistoryOpen((current) => !current)}
            aria-expanded={historyOpen}
          >
            <span className={styles.historyToggleIcon}>◷</span>
            <strong>ประวัติการลา {requests.length} รายการ</strong>
            <span className={styles.historyToggleAction}>
              {historyOpen ? "ซ่อนประวัติ" : "ดูประวัติทั้งหมด"}
              <b className={historyOpen ? styles.chevronOpen : ""}>⌄</b>
            </span>
          </button>

          {historyOpen && (
            <div className={styles.historyContent}>
              <div className={styles.historyTools}>
                <button type="button" onClick={() => void loadData()}>
                  รีเฟรชข้อมูล
                </button>
              </div>

              {["director", "admin"].includes(profileRole) && (
            <section className={styles.reviewSection}>
              <div className={styles.reviewHeading}>
                <div>
                  <small>สำหรับผู้บริหาร</small>
                  <h3>ใบลารอพิจารณา</h3>
                </div>
                <strong>{pendingRequests.length} รายการ</strong>
              </div>

              {pendingRequests.length === 0 ? (
                <p className={styles.reviewEmpty}>
                  ไม่มีใบลารอพิจารณา
                </p>
              ) : (
                <div className={styles.reviewList}>
                  {pendingRequests.map((item) => (
                    <article
                      key={item.id}
                      className={styles.reviewItem}
                    >
                      <div className={styles.reviewItemTop}>
                        <div>
                          <span className={styles.leaveType}>
                            {item.leave_type === "sick"
                              ? "ลาป่วย"
                              : "ลากิจ"}
                          </span>
                          <h4>
                            {item.profiles?.full_name ??
                              "ไม่พบชื่อสมาชิก"}
                          </h4>
                          <p>
                            {item.profiles?.position ||
                              item.profiles?.role}
                          </p>
                        </div>
                        <strong>
                          {item.total_work_days} วันทำการ
                        </strong>
                      </div>

                      <p>
                        {item.start_date} ถึง {item.end_date}
                      </p>
                      <p>{item.reason}</p>

                      {item.medical_certificate_required && (
                        <p className={styles.reviewWarning}>
                          ต้องมีใบรับรองแพทย์
                        </p>
                      )}

                      <div className={styles.reviewActions}>
                        {item.attachment_path && (
                          <button
                            type="button"
                            className={styles.evidenceButton}
                            onClick={() =>
                              void openAttachment(item.id)
                            }
                          >
                            ดูหลักฐาน
                          </button>
                        )}

                        <button
                          type="button"
                          className={styles.rejectButton}
                          disabled={processingId === item.id}
                          onClick={() =>
                            void reviewLeave(item.id, "reject")
                          }
                        >
                          ไม่อนุมัติ
                        </button>

                        <button
                          type="button"
                          className={styles.approveButton}
                          disabled={processingId === item.id}
                          onClick={() =>
                            void reviewLeave(item.id, "approve")
                          }
                        >
                          {processingId === item.id
                            ? "กำลังบันทึก..."
                            : "อนุมัติ"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {loading ? (
            <p>กำลังโหลด...</p>
          ) : requests.length === 0 ? (
            <p>ยังไม่มีประวัติการลา</p>
          ) : (
            <div className={styles.list}>
              {requests.map((item) => (
                <article key={item.id} className={styles.leaveItem}>
                  <div>
                    <span className={styles.leaveType}>
                      {leaveLabel(item.leave_type)}
                    </span>
                    <span className={styles.submission}>
                      {submissionLabel(item.submission_kind)}
                    </span>
                  </div>

                  <h3>
                    {item.leave_number ||
                      (item.sequence_number
                        ? `${leaveLabel(item.leave_type)}ครั้งที่ ${
                            item.sequence_number
                          }`
                        : leaveLabel(item.leave_type))}
                  </h3>

                  <p>
                    {item.start_date} ถึง {item.end_date} ·{" "}
                    {item.total_work_days} วันทำการ
                  </p>
                  <p>{item.reason}</p>

                  <footer>
                    <span data-status={item.status}>
                      {statusLabel(item.status)}
                    </span>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        justifyContent: "flex-end",
                      }}
                    >
                      {item.status === "pending" &&
                        item.working_document_url && (
                          <a
                            href={item.working_document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            เปิดใบลารอพิจารณา
                          </a>
                        )}

                      {item.evidence_file_id && (
                        <button
                          type="button"
                          onClick={() => void openAttachment(item.id)}
                        >
                          ดูหลักฐานแนบ
                        </button>
                      )}

                      {item.pdf_file_url && (
                        <a
                          href={item.pdf_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          เปิด PDF ใบลา
                        </a>
                      )}

                      <button
                        type="button"
                        className={styles.deleteLeaveButton}
                        disabled={deletingId === item.id}
                        onClick={() => void deleteLeave(item)}
                      >
                        {deletingId === item.id
                          ? "กำลังลบ..."
                          : "ลบใบลา"}
                      </button>
                    </div>
                  </footer>
                </article>
              ))}
            </div>
          )}
                    </div>
          )}
</section>
      </section>
          </div>

      <nav className={styles.bottomNav} aria-label="เมนูมือถือ">
        <a href="/attendance">
          <span>◷</span>
          <small>การลงเวลา</small>
        </a>
        <a href="/leave" className={styles.navActive}>
          <span>▤</span>
          <small>ขออนุญาตลา</small>
        </a>
        <a
          href={
            ["director", "admin"].includes(profileRole)
              ? "/admin/attendance"
              : "/attendance/history"
          }
        >
          <span>▥</span>
          <small>รายงาน</small>
        </a>
        <a
          href={
            ["director", "admin"].includes(profileRole)
              ? "/admin/settings"
              : "/account/profile"
          }
        >
          <span>⚙</span>
          <small>ตั้งค่า</small>
        </a>
      </nav>
</main>
  );
}

