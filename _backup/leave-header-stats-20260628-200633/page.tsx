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
  attachment_name?: string | null;
  evidence_file_url?: string | null;
  medical_certificate_required: boolean;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
  leave_number?: string | null;
  working_document_url?: string | null;
  pdf_file_url?: string | null;
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
  combined: { times: number; days: number };
};

type LeaveSettings = {
  fiscalYear: number;
  sickLeaveDays: number;
  personalLeaveDays: number;
  combinedLeaveTimesLimit: number;
  combinedLeaveDaysLimit: number;
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

function formatPendingSubmittedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: "ไม่พบวันที่ยื่น",
      time: "",
    };
  }

  return {
    date: new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date),
    time: new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date),
  };
}
function formatAdminLeaveDate(value: string, includeTime = false) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const datePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(date);

  if (!includeTime) {
    return datePart;
  }

  const timePart = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${datePart} ${timePart} น.`;
}

function adminLeaveStatusLabel(
  status: AdminPendingLeaveRequest["status"]
) {
  const labels = {
    pending: "รอพิจารณา",
    approved: "อนุมัติแล้ว",
    rejected: "ไม่อนุมัติ",
    cancelled: "ยกเลิก",
  };

  return labels[status];
}

function adminLeaveTypeLabel(
  type: AdminPendingLeaveRequest["leave_type"]
) {
  return type === "sick" ? "ลาป่วย" : "ลากิจ";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [adminLeavePage, setAdminLeavePage] = useState(1);
  const [memberHistoryPage, setMemberHistoryPage] = useState(1);

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
          ? fetchWithTimeout("/api/admin/leave?status=all", {
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

      const countedStatuses = new Set([
        "pending",
        "approved",
        "rejected",
      ]);

      const countedCurrentYear = loadedRequests.filter(
        (item) =>
          countedStatuses.has(item.status) &&
          Number(item.fiscal_year) === Number(settings.fiscalYear)
      );

      const sickRequests = countedCurrentYear.filter(
        (item) => item.leave_type === "sick"
      );

      const personalRequests = countedCurrentYear.filter(
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
        combined: {
          times: countedCurrentYear.length,
          days: countedCurrentYear.reduce(
            (total, item) =>
              total + Number(item.total_work_days || 0),
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
    if (window.matchMedia("(min-width: 801px)").matches) {
      setHistoryOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!attachment) {
      setAttachmentPreviewUrl("");
      return;
    }

    const previewUrl = URL.createObjectURL(attachment);
    setAttachmentPreviewUrl(previewUrl);

    return () => URL.revokeObjectURL(previewUrl);
  }, [attachment]);

  const sortedAdminLeaveRequests = useMemo(() => {
    const statusPriority: Record<
      AdminPendingLeaveRequest["status"],
      number
    > = {
      pending: 0,
      approved: 1,
      rejected: 2,
      cancelled: 3,
    };

    return [...pendingRequests].sort((a, b) => {
      const statusDifference =
        statusPriority[a.status] - statusPriority[b.status];

      if (statusDifference !== 0) {
        return statusDifference;
      }

      return (
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
      );
    });
  }, [pendingRequests]);

  const adminLeavePageSize = 10;
  const adminLeaveTotalPages = Math.max(
    1,
    Math.ceil(sortedAdminLeaveRequests.length / adminLeavePageSize)
  );
  const safeAdminLeavePage = Math.min(
    adminLeavePage,
    adminLeaveTotalPages
  );
  const pagedAdminLeaveRequests = sortedAdminLeaveRequests.slice(
    (safeAdminLeavePage - 1) * adminLeavePageSize,
    safeAdminLeavePage * adminLeavePageSize
  );

  useEffect(() => {
    if (adminLeavePage > adminLeaveTotalPages) {
      setAdminLeavePage(adminLeaveTotalPages);
    }
  }, [adminLeavePage, adminLeaveTotalPages]);

  function openLeaveDocument(item: AdminPendingLeaveRequest) {
    const url = item.pdf_file_url || item.working_document_url;

    if (!url) {
      setErrorMessage("ยังไม่มีไฟล์ใบลาสำหรับรายการนี้");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }
  const pendingAdminLeaveRequests = useMemo(
    () =>
      [...pendingRequests]
        .filter((item) => item.status === "pending")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ),
    [pendingRequests]
  );

  const adminLeaveHistoryRequests = useMemo(
    () =>
      [...pendingRequests]
        .filter((item) => item.status !== "pending")
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        ),
    [pendingRequests]
  );

  const adminHistoryPageSize = 10;
  const adminHistoryTotalPages = Math.max(
    1,
    Math.ceil(
      adminLeaveHistoryRequests.length / adminHistoryPageSize
    )
  );
  const safeAdminHistoryPage = Math.min(
    adminLeavePage,
    adminHistoryTotalPages
  );
  const pagedAdminHistoryRequests =
    adminLeaveHistoryRequests.slice(
      (safeAdminHistoryPage - 1) * adminHistoryPageSize,
      safeAdminHistoryPage * adminHistoryPageSize
    );

  useEffect(() => {
    if (adminLeavePage > adminHistoryTotalPages) {
      setAdminLeavePage(adminHistoryTotalPages);
    }
  }, [adminLeavePage, adminHistoryTotalPages]);
  const memberHistoryPageSize = 10;
  const memberHistoryTotalPages = Math.max(
    1,
    Math.ceil(requests.length / memberHistoryPageSize)
  );
  const safeMemberHistoryPage = Math.min(
    memberHistoryPage,
    memberHistoryTotalPages
  );
  const pagedMemberHistoryRequests = requests.slice(
    (safeMemberHistoryPage - 1) * memberHistoryPageSize,
    safeMemberHistoryPage * memberHistoryPageSize
  );

  useEffect(() => {
    if (memberHistoryPage > memberHistoryTotalPages) {
      setMemberHistoryPage(memberHistoryTotalPages);
    }
  }, [memberHistoryPage, memberHistoryTotalPages]);
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
      form.set("evidenceDescription", evidenceDescription.trim());
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

  async function deleteLeave(
    item: Pick<
      LeaveRequest,
      "id" | "leave_type" | "start_date" | "end_date"
    >
  ) {
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
      <button
        type="button"
        className={styles.mobileMenuButton}
        onClick={() => setMobileMenuOpen(true)}
        aria-label="เปิดเมนู"
        aria-expanded={mobileMenuOpen}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      {mobileMenuOpen && (
        <>
          <button
            type="button"
            className={styles.mobileMenuOverlay}
            aria-label="ปิดเมนู"
            onClick={() => setMobileMenuOpen(false)}
          />

          <aside className={styles.mobileDrawer} aria-label="เมนูหลัก">
            <div className={styles.mobileDrawerHeader}>
              <div>
                <small>เมนูหลัก</small>
                <strong>ระบบลงเวลาปฏิบัติงาน</strong>
              </div>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="ปิดเมนู"
              >
                ×
              </button>
            </div>

            <nav className={styles.mobileDrawerNav}>
              <a href="/attendance">
                <span>◷</span>
                <strong>การลงเวลา</strong>
              </a>

              <a href="/leave" className={styles.mobileDrawerActive}>
                <span>▤</span>
                <strong>ขออนุญาตลา</strong>
              </a>

              <a
                href={
                  ["director", "admin"].includes(profileRole)
                    ? "/admin/attendance"
                    : "/attendance/history"
                }
              >
                <span>▥</span>
                <strong>รายงาน</strong>
              </a>

              <a
                href={
                  ["director", "admin"].includes(profileRole)
                    ? "/admin/settings"
                    : "/account/profile"
                }
              >
                <span>⚙</span>
                <strong>ตั้งค่า</strong>
              </a>
            </nav>
          </aside>
        </>
      )}

<div className={styles.pageContent}>
<header className={styles.header}>
<div className={styles.headerTitle}>
            <h1>ขออนุญาตลาป่วย-ลากิจ</h1>
            <p>กรอกข้อมูลเพื่อยื่นใบลา</p>
          </div>
        
          <div className={styles.headerActions}>
            <a href="/attendance" className={styles.dashboardButton}>
              <span aria-hidden="true">⌂</span>
              กลับหน้า Dashboard
            </a>

            {summary && leaveSettings && (
              <section
                className={`${styles.leaveStatsCard} ${
                  summary.combined.times >
                    leaveSettings.combinedLeaveTimesLimit ||
                  summary.combined.days >
                    leaveSettings.combinedLeaveDaysLimit
                    ? styles.leaveStatsExceeded
                    : ""
                }`}
                aria-label="สถิติการลา"
              >
                <div className={styles.leaveStatsInline}>
                  <strong>สถิติการลา</strong>

                  <span className={styles.leaveStatPill} data-type="sick">
                    ลาป่วย {summary.sick.days} วัน
                  </span>

                  <span
                    className={styles.leaveStatPill}
                    data-type="personal"
                  >
                    ลากิจ {summary.personal.days} วัน
                  </span>
                </div>

                <small>
                  รวม {summary.combined.times}/
                  {leaveSettings.combinedLeaveTimesLimit} ครั้ง{" "}
                  {summary.combined.days}/
                  {leaveSettings.combinedLeaveDaysLimit} วัน
                </small>
              </section>
            )}
          </div>
</header>
      



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
            <div className={styles.leaveManagementGroups}>
              <section className={`${styles.compactLeaveSection} ${styles.pendingLeaveSection}`}>
                <div className={styles.compactLeaveHeader}>
                  <div>
                    <small>รายการที่ต้องดำเนินการ</small>
                    <h3>รายการใบลารอพิจารณา</h3>
                  </div>
                  <strong>{pendingAdminLeaveRequests.length} รายการ</strong>
                </div>

                {pendingAdminLeaveRequests.length === 0 ? (
                  <p className={styles.reviewEmpty}>ไม่มีใบลารอพิจารณา</p>
                ) : (
                  <>
                    <div className={styles.twoRowLeaveHeader}>
                      <span>ลำดับ</span>
                      <span>วันที่ยื่น</span>
                      <span>ชื่อ–ตำแหน่ง</span>
                      <span>ประเภท</span>
                      <span>วันลา</span>
                    </div>

                    <div className={styles.twoRowLeaveList}>
                      {pendingAdminLeaveRequests.map((item, index) => (
                        <article
                          key={item.id}
                          className={styles.twoRowLeaveItem}
                          data-status={item.status}
                        >
                          <div className={styles.twoRowLeaveMain}>
                            <strong
                              className={styles.twoRowNumber}
                              data-label="ลำดับ"
                            >
                              {index + 1}
                            </strong>

                            <time
                              className={styles.twoRowSubmitted}
                              data-label="วันที่ยื่น"
                              dateTime={item.created_at}
                            >
                              {formatAdminLeaveDate(item.created_at, true)}
                            </time>

                            <div
                              className={styles.twoRowPerson}
                              data-label="ชื่อ–ตำแหน่ง"
                            >
                              <strong>
                                {item.profiles?.full_name || "ไม่พบชื่อสมาชิก"}
                              </strong>
                              <small>
                                {item.profiles?.position ||
                                  item.profiles?.role ||
                                  "-"}
                              </small>
                            </div>

                            <span
                              className={styles.twoRowType}
                              data-label="ประเภท"
                              data-type={item.leave_type}
                            >
                              {adminLeaveTypeLabel(item.leave_type)}
                            </span>

                            <span
                              className={styles.twoRowLeavePeriod}
                              data-label="วันลา"
                            >
                              {formatAdminLeaveDate(item.start_date)}
                              {" – "}
                              {formatAdminLeaveDate(item.end_date)}
                              {" • "}
                              <strong>{item.total_work_days} วัน</strong>
                            </span>
                          </div>

                          <div className={styles.twoRowLeaveFooter}>
                            <div className={styles.twoRowLeaveLeft}>
                              <span
                                className={styles.twoRowStatus}
                                data-status={item.status}
                              >
                                {adminLeaveStatusLabel(item.status)}
                              </span>

                              <button
                                type="button"
                                className={styles.viewLeaveButton}
                                onClick={() => openLeaveDocument(item)}
                              >
                                ดูใบลา
                              </button>

                              {item.attachment_path ? (
                                <button
                                  type="button"
                                  className={styles.viewAttachmentButton}
                                  onClick={() => void openAttachment(item.id)}
                                >
                                  ดูไฟล์แนบ
                                </button>
                              ) : (
                                <span className={styles.twoRowNoAttachment}>
                                  ไม่มีไฟล์แนบ
                                </span>
                              )}
                            </div>

                            <div className={styles.twoRowLeaveRight}>
                              <button
                                type="button"
                                className={styles.approveButton}
                                disabled={processingId === item.id}
                                onClick={() =>
                                  void reviewLeave(item.id, "approve")
                                }
                              >
                                อนุมัติ
                              </button>

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
                                className={styles.deleteLeaveButton}
                                disabled={
                                  deletingId === item.id ||
                                  processingId === item.id
                                }
                                onClick={() => void deleteLeave(item)}
                              >
                                {deletingId === item.id
                                  ? "กำลังลบ..."
                                  : "ลบ"}
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>

              <section className={`${styles.compactLeaveSection} ${styles.historyLeaveSection}`}>
                <div className={styles.compactLeaveHeader}>
                  <div>
                    <small>รายการที่ดำเนินการแล้ว</small>
                    <h3>ประวัติการลา</h3>
                  </div>
                  <strong>{adminLeaveHistoryRequests.length} รายการ</strong>
                </div>

                {adminLeaveHistoryRequests.length === 0 ? (
                  <p className={styles.reviewEmpty}>ยังไม่มีประวัติการลา</p>
                ) : (
                  <>
                    <div className={styles.twoRowLeaveHeader}>
                      <span>ลำดับ</span>
                      <span>วันที่ยื่น</span>
                      <span>ชื่อ–ตำแหน่ง</span>
                      <span>ประเภท</span>
                      <span>วันลา</span>
                    </div>

                    <div className={styles.twoRowLeaveList}>
                      {pagedAdminHistoryRequests.map((item, index) => {
                        const rowNumber =
                          (safeAdminHistoryPage - 1) *
                            adminHistoryPageSize +
                          index +
                          1;

                        return (
                          <article
                            key={item.id}
                            className={styles.twoRowLeaveItem}
                            data-status={item.status}
                          >
                            <div className={styles.twoRowLeaveMain}>
                              <strong
                                className={styles.twoRowNumber}
                                data-label="ลำดับ"
                              >
                                {rowNumber}
                              </strong>

                              <time
                                className={styles.twoRowSubmitted}
                                data-label="วันที่ยื่น"
                                dateTime={item.created_at}
                              >
                                {formatAdminLeaveDate(item.created_at, true)}
                              </time>

                              <div
                                className={styles.twoRowPerson}
                                data-label="ชื่อ–ตำแหน่ง"
                              >
                                <strong>
                                  {item.profiles?.full_name || "ไม่พบชื่อสมาชิก"}
                                </strong>
                                <small>
                                  {item.profiles?.position ||
                                    item.profiles?.role ||
                                    "-"}
                                </small>
                              </div>

                              <span
                                className={styles.twoRowType}
                                data-label="ประเภท"
                                data-type={item.leave_type}
                              >
                                {adminLeaveTypeLabel(item.leave_type)}
                              </span>

                              <span
                                className={styles.twoRowLeavePeriod}
                                data-label="วันลา"
                              >
                                {formatAdminLeaveDate(item.start_date)}
                                {" – "}
                                {formatAdminLeaveDate(item.end_date)}
                                {" • "}
                                <strong>{item.total_work_days} วัน</strong>
                              </span>
                            </div>

                            <div className={styles.twoRowLeaveFooter}>
                              <div className={styles.twoRowLeaveLeft}>
                                <span
                                  className={styles.twoRowStatus}
                                  data-status={item.status}
                                >
                                  {adminLeaveStatusLabel(item.status)}
                                </span>

                                <button
                                  type="button"
                                  className={styles.viewLeaveButton}
                                  onClick={() => openLeaveDocument(item)}
                                >
                                  ดูใบลา
                                </button>

                                {item.attachment_path ? (
                                  <button
                                    type="button"
                                    className={styles.viewAttachmentButton}
                                    onClick={() =>
                                      void openAttachment(item.id)
                                    }
                                  >
                                    ดูไฟล์แนบ
                                  </button>
                                ) : (
                                  <span className={styles.twoRowNoAttachment}>
                                    ไม่มีไฟล์แนบ
                                  </span>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <div className={styles.adminLeavePagination}>
                      <span>
                        แสดง{" "}
                        {(safeAdminHistoryPage - 1) *
                          adminHistoryPageSize +
                          1}
                        –
                        {Math.min(
                          safeAdminHistoryPage *
                            adminHistoryPageSize,
                          adminLeaveHistoryRequests.length
                        )}{" "}
                        จาก {adminLeaveHistoryRequests.length} รายการ
                      </span>

                      <div>
                        <button
                          type="button"
                          disabled={safeAdminHistoryPage <= 1}
                          onClick={() =>
                            setAdminLeavePage((page) =>
                              Math.max(1, page - 1)
                            )
                          }
                        >
                          ก่อนหน้า
                        </button>

                        <strong>
                          หน้า {safeAdminHistoryPage}/
                          {adminHistoryTotalPages}
                        </strong>

                        <button
                          type="button"
                          disabled={
                            safeAdminHistoryPage >=
                            adminHistoryTotalPages
                          }
                          onClick={() =>
                            setAdminLeavePage((page) =>
                              Math.min(
                                adminHistoryTotalPages,
                                page + 1
                              )
                            )
                          }
                        >
                          ถัดไป
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

{!["director", "admin"].includes(profileRole) && (
            <section className={styles.memberOwnLeaveHistory}>
              <div className={styles.memberOwnLeaveHeader}>
                <h3>ประวัติการยื่นใบลาของฉัน</h3>
                <strong>{requests.length} รายการ</strong>
              </div>

              {loading ? (
                <p>กำลังโหลด...</p>
              ) : requests.length === 0 ? (
                <p>ยังไม่มีประวัติการยื่นใบลา</p>
              ) : (
                <>
                  <div className={styles.memberOwnLeaveColumnHeader}>
                    <span>ลำดับ</span>
                    <span>วันที่ยื่น</span>
                    <span>ประเภท</span>
                    <span>ช่วงวันลา</span>
                    <span>วัน</span>
                  </div>

<div className={styles.memberOwnLeaveList}>
                    {pagedMemberHistoryRequests.map((item, index) => {
                      const rowNumber =
                        (safeMemberHistoryPage - 1) *
                          memberHistoryPageSize +
                        index +
                        1;

                      return (
                        <article
                          key={item.id}
                          className={styles.memberOwnLeaveItem}
                          data-status={item.status}
                        >
                          <div className={styles.memberOwnLeaveMain}>
                            <strong data-label="ลำดับ">{rowNumber}</strong>

                            <time
                              data-label="วันที่ยื่น"
                              dateTime={item.created_at}
                            >
                              {formatAdminLeaveDate(item.created_at, true)}
                            </time>

                            <span data-label="ประเภท">
                              {leaveLabel(item.leave_type)}
                            </span>

                            <span data-label="วันลา">
                              {formatAdminLeaveDate(item.start_date)}
                              {" – "}
                              {formatAdminLeaveDate(item.end_date)}
                            </span>

                            <strong data-label="วัน">
                              {item.total_work_days}
                            </strong>
                          </div>

                          <div className={styles.memberOwnLeaveFooter}>
                            <span
                              className={styles.twoRowStatus}
                              data-status={item.status}
                            >
                              {statusLabel(item.status)}
                            </span>

                            <div className={styles.memberOwnLeaveActions}>
                              {item.working_document_url && (
                                <a
                                  href={item.working_document_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  ดูใบลา
                                </a>
                              )}

                              {item.evidence_file_id && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void openAttachment(item.id)
                                  }
                                >
                                  ดูไฟล์แนบ
                                </button>
                              )}

                              {item.pdf_file_url && (
                                <a
                                  href={item.pdf_file_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  ดู PDF
                                </a>
                              )}

                              {item.status === "pending" && (
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
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className={styles.adminLeavePagination}>
                    <span>
                      แสดง{" "}
                      {(safeMemberHistoryPage - 1) *
                        memberHistoryPageSize +
                        1}
                      –
                      {Math.min(
                        safeMemberHistoryPage *
                          memberHistoryPageSize,
                        requests.length
                      )}{" "}
                      จาก {requests.length} รายการ
                    </span>

                    <div>
                      <button
                        type="button"
                        disabled={safeMemberHistoryPage <= 1}
                        onClick={() =>
                          setMemberHistoryPage((page) =>
                            Math.max(1, page - 1)
                          )
                        }
                      >
                        ก่อนหน้า
                      </button>

                      <strong>
                        หน้า {safeMemberHistoryPage}/
                        {memberHistoryTotalPages}
                      </strong>

                      <button
                        type="button"
                        disabled={
                          safeMemberHistoryPage >=
                          memberHistoryTotalPages
                        }
                        onClick={() =>
                          setMemberHistoryPage((page) =>
                            Math.min(
                              memberHistoryTotalPages,
                              page + 1
                            )
                          )
                        }
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          )}

          
                    </div>
          )}
</section>
      </section>
          </div>
</main>
  );
}

