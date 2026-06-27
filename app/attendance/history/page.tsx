"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./attendance-history.module.css";

type AttendanceRecord = {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_distance_meters: number | null;
  check_out_distance_meters: number | null;
  check_in_status: string;
  check_out_status: string | null;
  note: string | null;
};

type Profile = {
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
};

function getToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getMonthStart() {
  const today = getToday();
  return `${today.slice(0, 7)}-01`;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatThaiDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parseLocalDate(value));
}

function formatThaiTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้อำนวยการ",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "นักการภารโรง",
  };

  return labels[role] ?? role;
}

function getStatus(record: AttendanceRecord) {
  const isDirectorDuty =
    record.check_in_status === "normal" &&
    record.note?.trim() === "ปฏิบัติราชการก่อนเข้าโรงเรียน";

  if (isDirectorDuty) {
    return { label: "ไปราชการ", tone: "info" as const };
  }

  if (!record.check_in_at) {
    return { label: "ไม่ลงเวลา", tone: "danger" as const };
  }

  if (record.check_in_status === "late") {
    return { label: "มาสาย", tone: "warning" as const };
  }

  if (record.check_out_status === "early") {
    return { label: "ออกก่อนเวลา", tone: "warning" as const };
  }

  if (!record.check_out_at) {
    return { label: "ยังไม่ลงเวลาออก", tone: "neutral" as const };
  }

  return { label: "ปกติ", tone: "success" as const };
}

export default function AttendanceHistoryPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState(getMonthStart());
  const [endDate, setEndDate] = useState(getToday());
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setMessage("");

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, position, role, account_status")
        .eq("id", user.id)
        .single();

      if (
        profileError ||
        !profileData ||
        profileData.account_status !== "active"
      ) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setProfile(profileData as Profile);

      if (!startDate || !endDate) {
        throw new Error("กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุด");
      }

      if (startDate > endDate) {
        throw new Error("วันที่เริ่มต้นต้องไม่มากกว่าวันที่สิ้นสุด");
      }

      const { data, error } = await supabase
        .from("attendance_records")
        .select(
          `
            id,
            work_date,
            check_in_at,
            check_out_at,
            check_in_distance_meters,
            check_out_distance_meters,
            check_in_status,
            check_out_status,
            note
          `
        )
        .eq("user_id", user.id)
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: false });

      if (error) throw error;
      setRecords((data ?? []) as AttendanceRecord[]);
    } catch (error) {
      console.error("Load attendance history error:", error);
      setRecords([]);
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดประวัติการลงเวลาได้"
      );
    } finally {
      setLoading(false);
    }
  }, [endDate, router, startDate, supabase]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const summary = useMemo(() => {
    const late = records.filter(
      (record) => record.check_in_status === "late"
    ).length;
    const early = records.filter(
      (record) => record.check_out_status === "early"
    ).length;
    const complete = records.filter(
      (record) => record.check_in_at && record.check_out_at
    ).length;
    const incomplete = records.filter(
      (record) => !record.check_in_at || !record.check_out_at
    ).length;

    return {
      total: records.length,
      complete,
      late,
      early,
      incomplete,
    };
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (statusFilter === "all") return records;

    return records.filter((record) => {
      const status = getStatus(record).label;
      return status === statusFilter;
    });
  }, [records, statusFilter]);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <header className={styles.pageHeader}>
          <div>
            <p className={styles.eyebrow}>ATTENDANCE REPORT</p>
            <h1>ประวัติการลงเวลา</h1>
            <p className={styles.subtitle}>
              ตรวจสอบเวลาเข้า–ออกและสถานะการปฏิบัติงานของคุณ
            </p>
          </div>

          <div className={styles.headerActions}>
            <button type="button" onClick={() => router.push("/attendance")}>ลงเวลา</button>
            <button type="button" onClick={() => router.push("/dashboard")}>Dashboard</button>
          </div>
        </header>

        <section className={styles.profileStrip}>
          <div>
            <small>ผู้ใช้งาน</small>
            <strong>{profile?.full_name || "-"}</strong>
          </div>
          <div>
            <small>ตำแหน่ง</small>
            <strong>{profile?.position || getRoleLabel(profile?.role || "") || "-"}</strong>
          </div>
          <div>
            <small>ช่วงข้อมูล</small>
            <strong>{formatThaiDate(startDate)} – {formatThaiDate(endDate)}</strong>
          </div>
        </section>

        <section className={styles.toolbar}>
          <label>
            <span>วันที่เริ่มต้น</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>

          <label>
            <span>วันที่สิ้นสุด</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>

          <label>
            <span>สถานะ</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="ปกติ">ปกติ</option>
              <option value="มาสาย">มาสาย</option>
              <option value="ออกก่อนเวลา">ออกก่อนเวลา</option>
              <option value="ไปราชการ">ไปราชการ</option>
              <option value="ยังไม่ลงเวลาออก">ยังไม่ลงเวลาออก</option>
            </select>
          </label>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void loadHistory()}
            disabled={loading}
          >
            {loading ? "กำลังโหลด..." : "แสดงข้อมูล"}
          </button>
        </section>

        {message && <div className={styles.errorBox}>{message}</div>}

        <section className={styles.summaryGrid}>
          <article>
            <span>วันลงเวลาทั้งหมด</span>
            <strong>{summary.total.toLocaleString("th-TH")}</strong>
          </article>
          <article className={styles.successCard}>
            <span>ลงเวลาครบ</span>
            <strong>{summary.complete.toLocaleString("th-TH")}</strong>
          </article>
          <article className={styles.warningCard}>
            <span>มาสาย</span>
            <strong>{summary.late.toLocaleString("th-TH")}</strong>
          </article>
          <article className={styles.warningCard}>
            <span>ออกก่อนเวลา</span>
            <strong>{summary.early.toLocaleString("th-TH")}</strong>
          </article>
          <article className={styles.neutralCard}>
            <span>ข้อมูลไม่ครบ</span>
            <strong>{summary.incomplete.toLocaleString("th-TH")}</strong>
          </article>
        </section>

        <section className={styles.tableSection}>
          <div className={styles.tableHeader}>
            <div>
              <p className={styles.eyebrow}>MY ATTENDANCE</p>
              <h2>รายการลงเวลา</h2>
            </div>
            <span>{filteredRecords.length.toLocaleString("th-TH")} รายการ</span>
          </div>

          {loading ? (
            <div className={styles.emptyState}>กำลังโหลดข้อมูล...</div>
          ) : filteredRecords.length === 0 ? (
            <div className={styles.emptyState}>ไม่พบข้อมูลในช่วงวันที่ที่เลือก</div>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>วันที่</th>
                    <th>เวลาเข้า</th>
                    <th>เวลาออก</th>
                    <th>สถานะ</th>
                    <th>หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const status = getStatus(record);

                    return (
                      <tr key={record.id}>
                        <td data-label="วันที่">
                          <strong>{formatThaiDate(record.work_date)}</strong>
                        </td>
                        <td data-label="เวลาเข้า">
                          <strong>{formatThaiTime(record.check_in_at)}</strong>
                          {record.check_in_distance_meters !== null && (
                            <small>
                              ห่างโรงเรียน {Math.round(record.check_in_distance_meters).toLocaleString("th-TH")} เมตร
                            </small>
                          )}
                        </td>
                        <td data-label="เวลาออก">
                          <strong>{formatThaiTime(record.check_out_at)}</strong>
                          {record.check_out_distance_meters !== null && (
                            <small>
                              ห่างโรงเรียน {Math.round(record.check_out_distance_meters).toLocaleString("th-TH")} เมตร
                            </small>
                          )}
                        </td>
                        <td data-label="สถานะ">
                          <span className={`${styles.statusBadge} ${styles[status.tone]}`}>
                            {status.label}
                          </span>
                        </td>
                        <td data-label="หมายเหตุ">{record.note || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
