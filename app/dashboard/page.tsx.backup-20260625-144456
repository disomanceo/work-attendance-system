"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./dashboard.module.css";

type Profile = {
  full_name: string;
  phone: string;
  position: string | null;
  role: string;
  account_status: string;
};

type AttendanceRecord = {
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_status: string | null;
};

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatThaiDate(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "full",
  }).format(date);
}

function formatThaiTime(value: string | null) {
  if (!value) return "--:--";

  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatLiveTime(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function getGreeting(date: Date) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      hour12: false,
    }).format(date)
  );

  if (hour < 12) return "สวัสดีตอนเช้า";
  if (hour < 17) return "สวัสดีตอนบ่าย";
  return "สวัสดีตอนเย็น";
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    admin: "ผู้ดูแลระบบ",
    director: "ผู้บริหาร",
    teacher: "ครู",
    staff: "เจ้าหน้าที่",
    janitor: "ภารโรง",
  };

  return labels[role] ?? role;
}

function getAutoCheckoutTime(role: string) {
  return role === "janitor" ? "18:00 น." : "16:30 น.";
}

function getAttendanceStatus(record: AttendanceRecord | null) {
  if (!record?.check_in_at) return "ยังไม่ได้ลงเวลา";
  if (record.check_out_at) return "สิ้นสุดงานแล้ว";
  return "กำลังปฏิบัติงาน";
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      setMessage("");

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
        .select("full_name, phone, position, role, account_status")
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

      const { data: attendanceData, error: attendanceError } = await supabase
        .from("attendance_records")
        .select("check_in_at, check_out_at, check_in_status")
        .eq("user_id", user.id)
        .eq("work_date", getBangkokDate())
        .maybeSingle();

      if (attendanceError) {
        console.error("Load dashboard attendance error:", attendanceError);
      }

      if (mounted) {
        setProfile(profileData);
        setRecord(attendanceData ?? null);
        setLoading(false);
      }
    }

    void loadDashboard();

    return () => {
      mounted = false;
    };
  }, [router, supabase]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <span className={styles.spinner} />
        กำลังโหลดข้อมูล...
      </main>
    );
  }

  if (!profile) {
    return (
      <main className={styles.loading}>
        {message || "ไม่พบข้อมูลสมาชิก"}
      </main>
    );
  }

  const canViewReports = ["admin", "director", "staff"].includes(
    profile.role
  );
  const canManageMembers = profile.role === "admin";
  const historyHref = canViewReports
    ? "/admin/attendance"
    : "/attendance/history";
  const attendanceStatus = getAttendanceStatus(record);
  const autoCheckoutTime = getAutoCheckoutTime(profile.role);

  return (
    <main className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.schoolBrand}>
          <Image
            src="/images/school-logo.png"
            alt="โลโก้โรงเรียนวัดไผ่มุ้ง"
            width={58}
            height={58}
            priority
          />

          <div>
            <strong>โรงเรียนวัดไผ่มุ้ง</strong>
            <span>ระบบลงเวลาปฏิบัติงาน</span>
          </div>
        </div>

        <button className={styles.logoutButton} onClick={handleLogout}>
          ออกจากระบบ
        </button>
      </header>

      <section className={styles.welcomeCard}>
        <div>
          <span className={styles.greeting}>{getGreeting(now)} ☀️</span>
          <h1>{profile.full_name}</h1>
          <p>
            {profile.position || getRoleLabel(profile.role)} ·{" "}
            {getRoleLabel(profile.role)}
          </p>
        </div>

        <Image
          className={styles.panda}
          src="/images/login-panda.png"
          alt=""
          width={190}
          height={190}
          priority
        />
      </section>

      <section className={styles.clockCard}>
        <p>{formatThaiDate(now)}</p>
        <div className={styles.liveTime}>
          {formatLiveTime(now)}
          <span>● LIVE</span>
        </div>
        <small>เวลาปัจจุบัน อัปเดตแบบเรียลไทม์</small>
      </section>

      <section className={styles.attendanceHero}>
        <div className={styles.statusCircle}>
          <span>◷</span>
          <strong>{attendanceStatus}</strong>
          <small>เช้าวันนี้</small>
        </div>

        <div className={styles.attendanceAction}>
          <h2>ลงเวลาปฏิบัติงาน</h2>
          <p>ระบบจะตรวจสอบตำแหน่ง GPS ก่อนบันทึกเวลา</p>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => router.push("/attendance")}
          >
            <span>◉</span>
            {record?.check_in_at ? "ดูข้อมูลลงเวลาวันนี้" : "ลงเวลาปฏิบัติงาน"}
          </button>
        </div>
      </section>

      <section className={styles.autoCheckout}>
        <span>🔔</span>
        <div>
          <strong>ระบบบันทึกเวลาออกอัตโนมัติ</strong>
          <p>
            เวลาออกของบัญชีนี้คือ <b>{autoCheckoutTime}</b>{" "}
            ไม่ต้องกดลงเวลาออก
          </p>
        </div>
      </section>

      <section className={styles.todaySection}>
        <div className={styles.sectionHeading}>
          <h2>สรุปงานวันนี้</h2>
          <button onClick={() => router.push(historyHref)}>
            ดูประวัติ
          </button>
        </div>

        <div className={styles.summaryGrid}>
          <article>
            <span>☀️</span>
            <small>ลงเวลาเข้า</small>
            <strong>{formatThaiTime(record?.check_in_at ?? null)}</strong>
          </article>

          <article>
            <span>✓</span>
            <small>สถานะวันนี้</small>
            <strong>{attendanceStatus}</strong>
          </article>

          <article>
            <span>◷</span>
            <small>เวลาออกอัตโนมัติ</small>
            <strong>{autoCheckoutTime}</strong>
          </article>
        </div>
      </section>

      <section className={styles.menuSection}>
        <h2>เมนูใช้งาน</h2>

        <div className={styles.menuGrid}>
          <button onClick={() => router.push(historyHref)}>
            <span>◷</span>
            <b>ประวัติการลงเวลา</b>
          </button>

          <button onClick={() => router.push("/account/change-pin")}>
            <span>🔐</span>
            <b>เปลี่ยน PIN</b>
          </button>


          {canManageMembers && (
            <button onClick={() => router.push("/admin/members")}>
              <span>👥</span>
              <b>จัดการสมาชิก</b>
            </button>
          )}
        </div>
      </section>

      <nav className={styles.bottomNav} aria-label="เมนูหลัก">
        <button className={styles.active}>
          <span>⌂</span>
          หน้าแรก
        </button>

        <button onClick={() => router.push("/attendance")}>
          <span>◉</span>
          ลงเวลา
        </button>

        <button onClick={() => router.push(historyHref)}>
          <span>▣</span>
          ประวัติ
        </button>

        <button onClick={() => router.push("/account/change-pin")}>
          <span>♙</span>
          โปรไฟล์
        </button>
      </nav>
    </main>
  );
}
