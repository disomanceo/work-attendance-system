"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RequestProfileAvatar from "@/components/profile/RequestProfileAvatar";
import styles from "./leave-admin.module.css";

type AdminLeaveRequest = {
  id: string;
  leave_type: "personal" | "sick";
  start_date: string;
  end_date: string;
  total_work_days: number;
  reason: string;
  fiscal_year: number;
  submission_kind: string;
  advance_work_days: number;
  retrospective_work_days: number;
  attachment_path: string | null;
  medical_certificate_required: boolean;
  status: string;
  profiles: {
    full_name: string;
    position: string | null;
    role: string;
    profile_image_file_id: string | null;
  } | null;
};

export default function AdminLeavePage() {
  const supabase = useMemo(() => createClient(), []);
  const [requests, setRequests] = useState<AdminLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState("");
  const [message, setMessage] = useState("");

  const token = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? "";
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const accessToken = await token();
      const response = await fetch("/api/admin/leave?status=pending", {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "โหลดรายการไม่สำเร็จ");
      }
      setRequests(result.requests);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "โหลดรายการไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(
    requestId: string,
    action: "approve" | "reject"
  ) {
    const note =
      action === "reject"
        ? window.prompt("ระบุเหตุผลที่ไม่อนุมัติ")?.trim() ?? ""
        : "";

    if (action === "reject" && note.length < 5) {
      setMessage("กรุณาระบุเหตุผลที่ไม่อนุมัติอย่างน้อย 5 ตัวอักษร");
      return;
    }

    setProcessingId(requestId);
    setMessage("");

    try {
      const accessToken = await token();
      const response = await fetch("/api/admin/leave", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ requestId, action, note }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "บันทึกผลไม่สำเร็จ");
      }
      setMessage(result.message);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "บันทึกผลไม่สำเร็จ"
      );
    } finally {
      setProcessingId("");
    }
  }

  async function openAttachment(requestId: string) {
    const accessToken = await token();
    const response = await fetch(
      `/api/leave/attachment?requestId=${encodeURIComponent(requestId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );
    if (!response.ok) {
      setMessage("เปิดไฟล์แนบไม่สำเร็จ");
      return;
    }
    const blob = await response.blob();
    window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
  }

  return (
    <main className={styles.page}>
      <header>
        <div>
          <small>DIRECTOR APPROVAL</small>
          <h1>พิจารณาใบลา</h1>
          <p>ลากิจและลาป่วยที่รอการพิจารณา</p>
        </div>
        <a href="/attendance">กลับหน้าหลัก</a>
      </header>

      {message && <div className={styles.message}>{message}</div>}

      {loading ? (
        <section className={styles.empty}>กำลังโหลด...</section>
      ) : requests.length === 0 ? (
        <section className={styles.empty}>ไม่มีใบลารอพิจารณา</section>
      ) : (
        <section className={styles.list}>
          {requests.map((item) => (
            <article key={item.id} className={styles.card}>
              <div className={styles.cardTop}>
                <div className={styles.requester}>
                  <RequestProfileAvatar
                    className={styles.requesterAvatar}
                    fileId={item.profiles?.profile_image_file_id}
                    name={item.profiles?.full_name}
                  />

                  <div>
                    <span>
                      {item.leave_type === "sick" ? "ลาป่วย" : "ลากิจ"}
                    </span>
                    <h2>{item.profiles?.full_name ?? "ไม่พบชื่อสมาชิก"}</h2>
                    <p>{item.profiles?.position || item.profiles?.role}</p>
                  </div>
                </div>
                <strong>{item.total_work_days} วันทำการ</strong>
              </div>

              <dl>
                <div>
                  <dt>ช่วงวันที่</dt>
                  <dd>
                    {item.start_date} ถึง {item.end_date}
                  </dd>
                </div>
                <div>
                  <dt>ปีงบประมาณ</dt>
                  <dd>{item.fiscal_year + 543}</dd>
                </div>
                <div>
                  <dt>ลักษณะการยื่น</dt>
                  <dd>{item.submission_kind}</dd>
                </div>
                <div>
                  <dt>เหตุผล</dt>
                  <dd>{item.reason}</dd>
                </div>
              </dl>

              {item.medical_certificate_required && (
                <p className={styles.warning}>
                  ใบนี้บังคับมีใบรับรองแพทย์
                </p>
              )}

              <div className={styles.actions}>
                {item.attachment_path && (
                  <button
                    type="button"
                    className={styles.fileButton}
                    onClick={() => void openAttachment(item.id)}
                  >
                    ดูหลักฐานแนบ
                  </button>
                )}
                <button
                  type="button"
                  className={styles.rejectButton}
                  disabled={processingId === item.id}
                  onClick={() => void review(item.id, "reject")}
                >
                  ไม่อนุมัติ
                </button>
                <button
                  type="button"
                  className={styles.approveButton}
                  disabled={processingId === item.id}
                  onClick={() => void review(item.id, "approve")}
                >
                  อนุมัติ
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
