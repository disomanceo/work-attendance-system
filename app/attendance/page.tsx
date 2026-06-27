"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./attendance.module.css";

type Profile = {
  full_name: string;
  position: string | null;
  role: string;
  account_status: string;
  profile_image_file_id: string | null;
};

type AttendanceSettings = {
  school_name: string;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  late_after_time: string;
  is_active: boolean;
  gps_enabled: boolean;
  director_start_time: string;
  director_end_time: string;
  teacher_start_time: string;
  teacher_end_time: string;
  staff_start_time: string;
  staff_end_time: string;
  janitor_start_time: string;
  janitor_end_time: string;
};

type AttendanceRecord = {
  id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  check_in_status: string | null;
  check_out_status: string | null;
};

type PositionData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type PendingCheckIn = {
  userId: string;
  position: PositionData;
  distance: number;
};

type TodayLeave = {
  id: string;
  leave_type: "sick" | "personal" | "official_duty" | string;
  start_date: string;
  end_date: string;
  status: "pending" | "approved" | string;
  label: string;
  message: string;
};

type TodayLeaveResponse = {
  ok: boolean;
  message?: string;
  leave?: TodayLeave | null;
};

type MenuItem = {
  label: string;
  icon: string;
  href?: string;
  active?: boolean;
  soon?: boolean;
};

function getBangkokDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getBangkokTime() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
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

function normalizeTime(value: string) {
  return value.slice(0, 8);
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

function calculateDistanceMeters(
  latitude1: number,
  longitude1: number,
  latitude2: number,
  longitude2: number
) {
  const earthRadius = 6371000;
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const firstLatitude = toRadians(latitude1);
  const secondLatitude = toRadians(latitude2);

  const calculation =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  const angle = 2 * Math.atan2(
    Math.sqrt(calculation),
    Math.sqrt(1 - calculation)
  );

  return Math.round(earthRadius * angle);
}

function getLocation() {
  return new Promise<PositionData>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("อุปกรณ์นี้ไม่รองรับการระบุตำแหน่ง"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        }),
      (error) => {
        const messages: Record<number, string> = {
          1: "กรุณาอนุญาตให้เว็บไซต์เข้าถึงตำแหน่งของคุณ",
          2: "ไม่สามารถตรวจหาตำแหน่งปัจจุบันได้",
          3: "ตรวจหาตำแหน่งนานเกินไป กรุณาลองใหม่",
        };

        reject(
          new Error(messages[error.code] || "ไม่สามารถตรวจหาตำแหน่งได้")
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

export default function AttendancePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [todayLeave, setTodayLeave] = useState<TodayLeave | null>(null);
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lateReasonOpen, setLateReasonOpen] = useState(false);
  const [lateReason, setLateReason] = useState("");
  const [lateReasonError, setLateReasonError] = useState("");
  const [pendingCheckIn, setPendingCheckIn] =
    useState<PendingCheckIn | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("attendance_sidebar_collapsed");
    setSidebarCollapsed(saved === "true");
  }, []);

  const loadTodayLeave = useCallback(
    async (accessToken?: string) => {
      let token = accessToken;

      if (!token) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        token = session?.access_token;
      }

      if (!token) {
        throw new Error("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่");
      }

      const response = await fetch("/api/leave/today", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });

      const result = (await response.json()) as TodayLeaveResponse;

      if (!response.ok || !result.ok) {
        throw new Error(
          result.message || "ตรวจสอบข้อมูลการลาของวันนี้ไม่สำเร็จ"
        );
      }

      const leave = result.leave ?? null;
      setTodayLeave(leave);
      return leave;
    },
    [supabase]
  );

  const loadAttendance = useCallback(async () => {
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

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.replace("/login");
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, position, role, account_status, profile_image_file_id")
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

      const { data: settingsData, error: settingsError } = await supabase
        .from("attendance_settings")
        .select(
          "school_name, latitude, longitude, allowed_radius_meters, late_after_time, is_active, gps_enabled, director_start_time, director_end_time, teacher_start_time, teacher_end_time, staff_start_time, staff_end_time, janitor_start_time, janitor_end_time"
        )
        .eq("id", 1)
        .single();

      if (settingsError || !settingsData) {
        throw new Error("ไม่พบการตั้งค่าระบบลงเวลา");
      }

      setSettings(settingsData);

      const { data: attendanceData, error: attendanceError } = await supabase
        .from("attendance_records")
        .select(
          "id, check_in_at, check_out_at, check_in_status, check_out_status"
        )
        .eq("user_id", user.id)
        .eq("work_date", getBangkokDate())
        .maybeSingle();

      if (attendanceError) throw attendanceError;
      setRecord(attendanceData ?? null);

      await loadTodayLeave(session.access_token);
    } catch (error) {
      console.error("Load attendance error:", error);
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถโหลดข้อมูลลงเวลาได้"
      );
    } finally {
      setLoading(false);
    }
  }, [loadTodayLeave, router, supabase]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    let objectUrl = "";

    async function loadProfileImage() {
      if (!profile?.profile_image_file_id) {
        setProfileImageUrl("");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const accessToken = session?.access_token;

      if (!accessToken) return;

      const response = await fetch(
        `/api/account/profile-assets?fileId=${encodeURIComponent(
          profile.profile_image_file_id
        )}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) return;

      const blob = await response.blob();
      objectUrl = URL.createObjectURL(blob);
      setProfileImageUrl(objectUrl);
    }

    void loadProfileImage();

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.profile_image_file_id, supabase]);

  async function verifyLocation() {
    if (!settings) {
      throw new Error("ยังโหลดการตั้งค่าไม่สำเร็จ");
    }

    if (!settings.is_active) {
      throw new Error("ระบบลงเวลายังไม่เปิดใช้งาน");
    }

    if (!settings.gps_enabled) {
      setDistanceMeters(null);
      return {
        position: {
          latitude: 0,
          longitude: 0,
          accuracy: 0,
        },
        distance: 0,
      };
    }

    if (
      settings.latitude === null ||
      settings.longitude === null
    ) {
      throw new Error("ยังไม่ได้กำหนดพิกัดโรงเรียน");
    }

    const position = await getLocation();
    const distance = calculateDistanceMeters(
      position.latitude,
      position.longitude,
      settings.latitude,
      settings.longitude
    );

    setDistanceMeters(distance);

    if (distance > settings.allowed_radius_meters) {
      throw new Error(
        `คุณอยู่นอกพื้นที่ลงเวลา ระยะห่าง ${distance.toLocaleString(
          "th-TH"
        )} เมตร อนุญาตไม่เกิน ${settings.allowed_radius_meters} เมตร`
      );
    }

    return { position, distance };
  }

  function countReasonCharacters(value: string) {
    return Array.from(value.trim()).length;
  }

  async function saveCheckIn(
    pending: PendingCheckIn,
    note: string | null,
    checkInStatus: "normal" | "late" = note
      ? "late"
      : "normal"
  ) {
    const activeLeave = await loadTodayLeave();

    if (activeLeave) {
      throw new Error(activeLeave.message);
    }

    const { data, error } = await supabase
      .from("attendance_records")
      .insert({
        user_id: pending.userId,
        work_date: getBangkokDate(),
        check_in_at: new Date().toISOString(),
        check_in_latitude: pending.position.latitude,
        check_in_longitude: pending.position.longitude,
        check_in_distance_meters: pending.distance,
        check_in_status: checkInStatus,
        note,
        updated_at: new Date().toISOString(),
      })
      .select(
        "id, check_in_at, check_out_at, check_in_status, check_out_status"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("วันนี้มีข้อมูลลงเวลาอยู่แล้ว");
      }

      throw error;
    }

    setRecord(data);
    setMessageType("success");
    setMessage(
      note === "ปฏิบัติราชการก่อนเข้าโรงเรียน"
        ? "บันทึกเวลาเรียบร้อยแล้ว สถานะ: ไปราชการ"
        : checkInStatus === "late"
          ? "บันทึกเวลามาสายพร้อมเหตุผลเรียบร้อยแล้ว"
          : "บันทึกเวลาปฏิบัติงานเรียบร้อยแล้ว"
    );
  }

  async function handleCheckIn() {
    setProcessing(true);
    setMessage("");

    try {
      if (record?.check_in_at) {
        throw new Error("วันนี้คุณได้ลงเวลาแล้ว");
      }

      const activeLeave = todayLeave ?? (await loadTodayLeave());

      if (activeLeave) {
        throw new Error(activeLeave.message);
      }

      if (!settings) {
        throw new Error("ยังโหลดการตั้งค่าไม่สำเร็จ");
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      const { position, distance } = await verifyLocation();
      const currentTime = getBangkokTime();

      const roleStartTimeMap: Record<string, string> = {
        director: settings.director_start_time,
        teacher: settings.teacher_start_time,
        staff: settings.staff_start_time,
        janitor: settings.janitor_start_time,
        admin: settings.director_start_time,
      };

      const currentRole = profile?.role ?? "teacher";

      const roleStartTime =
        roleStartTimeMap[currentRole] ??
        settings.teacher_start_time ??
        settings.late_after_time;

      const isLateCheckIn =
        currentTime > normalizeTime(roleStartTime);

      const pending: PendingCheckIn = {
        userId: user.id,
        position,
        distance,
      };

      if (isLateCheckIn && currentRole === "director") {
        await saveCheckIn(
          pending,
          "ปฏิบัติราชการก่อนเข้าโรงเรียน",
          "normal"
        );
        return;
      }

      if (isLateCheckIn) {
        setPendingCheckIn(pending);
        setLateReason("");
        setLateReasonError("");
        setLateReasonOpen(true);
        return;
      }

      await saveCheckIn(pending, null);
    } catch (error) {
      console.error("Check-in error:", error);
      setMessageType("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "ลงเวลาเข้าไม่สำเร็จ"
      );
    } finally {
      setProcessing(false);
    }
  }

  function closeLateReasonModal() {
    if (processing) return;

    setLateReasonOpen(false);
    setLateReason("");
    setLateReasonError("");
    setPendingCheckIn(null);
  }

  async function confirmLateCheckIn() {
    const normalizedReason = lateReason.trim();
    const reasonLength =
      countReasonCharacters(normalizedReason);

    if (reasonLength < 5) {
      setLateReasonError(
        "กรุณาระบุเหตุผลอย่างน้อย 5 ตัวอักษร"
      );
      return;
    }

    if (reasonLength > 30) {
      setLateReasonError(
        "เหตุผลต้องไม่เกิน 30 ตัวอักษร"
      );
      return;
    }

    if (!pendingCheckIn) {
      setLateReasonError(
        "ไม่พบข้อมูลการลงเวลา กรุณาปิดแล้วลองใหม่"
      );
      return;
    }

    setProcessing(true);
    setLateReasonError("");

    try {
      await saveCheckIn(
        pendingCheckIn,
        normalizedReason
      );

      setLateReasonOpen(false);
      setLateReason("");
      setPendingCheckIn(null);
    } catch (error) {
      console.error("Late check-in error:", error);
      setLateReasonError(
        error instanceof Error
          ? error.message
          : "บันทึกเหตุผลมาสายไม่สำเร็จ"
      );
    } finally {
      setProcessing(false);
    }
  }
  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function toggleSidebarCollapsed() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    window.localStorage.setItem(
      "attendance_sidebar_collapsed",
      String(next)
    );
  }

  function openMenu(item: MenuItem) {
    if (item.soon || !item.href) {
      setMessageType("success");
      setMessage(`${item.label} อยู่ระหว่างพัฒนาระบบ`);
      setSidebarOpen(false);
      return;
    }

    setSidebarOpen(false);
    router.push(item.href);
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <span className={styles.spinner} />
        กำลังโหลดระบบลงเวลา...
      </main>
    );
  }

  if (!profile) {
    return <main className={styles.loading}>ไม่พบข้อมูลผู้ใช้งาน</main>;
  }

  const isLate = record?.check_in_status === "late";
  const isOfficialDuty =
    record?.check_in_status === "official_duty";
  const checkInStatusLabel = isOfficialDuty
    ? "ไปราชการ"
    : isLate
      ? "มาสาย"
      : "ปกติ";
  const hasCheckedIn = Boolean(record?.check_in_at);
  const canViewReports = ["admin", "director"].includes(profile.role);
  const canManageMembers = ["admin", "director"].includes(profile.role);
  const historyHref =
    profile.role === "admin" || profile.role === "director"
      ? "/admin/attendance"
      : "/attendance/history";

  const menuItems: MenuItem[] = [
    {
      label: "หน้าหลัก",
      icon: "◷",
      href: "/attendance",
      active: true,
    },
    {
      label: "การลงเวลาปฏิบัติงาน",
      icon: "▣",
      href: historyHref,
    },
    {
      label: "ขออนุญาตลาป่วย-ลากิจ",
      icon: "▤",
      href: "/leave",
    },
    {
      label: "ข้อมูลส่วนตัว",
      icon: "♙",
      href: "/account/profile",
    },

  ];

  if (["director", "admin"].includes(profile.role)) {
    menuItems.push({

      label: "ตั้งค่า",
      icon: "⚙",
      href: "/admin/settings",
    });
  }

  if (canManageMembers) {
    menuItems.push({
      label: "จัดการสมาชิก",
      icon: "👥",
      href: "/admin/members",
    });
  }

  return (
    <main
      className={`${styles.page} ${
        sidebarCollapsed ? styles.sidebarCollapsedPage : ""
      } ${hasCheckedIn ? styles.checkedInPage : ""}`}
    >
      <button
        type="button"
        className={styles.mobileMenuButton}
        aria-label="เปิดเมนู"
        onClick={() => setSidebarOpen(true)}
      >
        ☰
      </button>

      {sidebarOpen && (
        <button
          type="button"
          className={styles.overlay}
          aria-label="ปิดเมนู"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`${styles.sidebar} ${
          sidebarOpen ? styles.sidebarOpen : ""
        } ${sidebarCollapsed ? styles.sidebarCollapsed : ""}`}
      >
        <div className={styles.sidebarBrand}>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={toggleSidebarCollapsed}
            aria-label={sidebarCollapsed ? "ขยายเมนู" : "ย่อเมนู"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>

        <div className={styles.userCard}>
          <div className={styles.avatar}>
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="รูปโปรไฟล์" />
            ) : (
              profile.full_name.trim().charAt(0) || "U"
            )}
          </div>

          {!sidebarCollapsed && (
            <div>
              <strong>{profile.full_name}</strong>
              <small>
                {profile.position || getRoleLabel(profile.role)}
              </small>
              <span>● ออนไลน์</span>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <h2 className={styles.menuTitle}>เมนูของฉัน</h2>
        )}

        <nav className={styles.menuList} aria-label="เมนูของฉัน">
          {menuItems.map((item) => (
            <button
              type="button"
              key={item.label}
              className={`${styles.menuItem} ${
                item.active ? styles.menuItemActive : ""
              } ${item.soon ? styles.menuItemSoon : ""}`}
              onClick={() => openMenu(item)}
              title={sidebarCollapsed ? item.label : undefined}
            >
              <span className={styles.menuIcon}>{item.icon}</span>

              {!sidebarCollapsed && (
                <>
                  <b>{item.label}</b>
                  {item.soon && <small>เร็ว ๆ นี้</small>}
                </>
              )}
            </button>
          ))}
        </nav>

        <button
          type="button"
          className={styles.logoutButton}
          onClick={() => void handleLogout()}
        >
          <span>⇥</span>
          {!sidebarCollapsed && <b>ออกจากระบบ</b>}
        </button>
      </aside>

      <section className={styles.content}>
        <header className={styles.mobileTopBar}>
          <button
            type="button"
            className={styles.mobileMenuButtonInline}
            aria-label="เปิดเมนู"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>

          <div className={styles.mobileProfile}>
            <div className={styles.mobileAvatar}>
              {profileImageUrl ? (
                <img src={profileImageUrl} alt="รูปโปรไฟล์" />
              ) : (
                profile.full_name.trim().charAt(0) || "U"
              )}
            </div>

            <div>
              <strong>{profile.full_name}</strong>
              <small>{profile.position || getRoleLabel(profile.role)}</small>
            </div>
          </div>
        </header>

        <header className={styles.topBar}>
          <div>
            <span>ATTENDANCE</span>
            <h1>การลงเวลาปฏิบัติงาน</h1>
            <p>ลงเวลา ตรวจสอบสถานะ และดูข้อมูลการปฏิบัติงานของคุณ</p>
          </div>        </header>

        {message && (
          <div
            className={
              messageType === "success"
                ? styles.successMessage
                : styles.errorMessage
            }
            role="alert"
          >
            {message}
          </div>
        )}

        <section className={styles.heroGrid}>
          <article className={styles.checkInPanel}>
            <div className={styles.mobileCheckInHeader}>
              <p>{formatThaiDate(now)}</p>
              <strong>
                {new Intl.DateTimeFormat("th-TH", {
                  timeZone: "Asia/Bangkok",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                }).format(now)}
              </strong>
              <small>เวลาปัจจุบันแบบเรียลไทม์</small>
            </div>

            {todayLeave ? (
              <div className={styles.leaveTodayWrap}>
                <div className={styles.leaveTodayIcon}>✓</div>
                <strong>{todayLeave.message}</strong>
                <small>
                  สถานะคำขอ:{" "}
                  {todayLeave.status === "approved"
                    ? "อนุมัติแล้ว"
                    : "รอพิจารณา"}
                </small>
              </div>
            ) : !record?.check_in_at ? (
              <>
                <button
                  type="button"
                  className={styles.checkInButton}
                  disabled={processing}
                  onClick={() => void handleCheckIn()}
                >
                  <span className={styles.fingerprintIcon} aria-hidden="true">
                    <svg viewBox="0 0 64 64" role="img">
                      <path d="M32 7C20 7 10 17 10 29c0 7 2 11 2 18" />
                      <path d="M32 14c-9 0-16 7-16 16 0 8 3 13 3 22" />
                      <path d="M32 21c-5 0-9 4-9 9 0 9 4 15 4 26" />
                      <path d="M32 28c-2 0-4 2-4 4 0 10 5 15 5 25" />
                      <path d="M38 57c0-8-4-14-4-25 0-2 2-4 4-4 4 0 6 4 6 8 0 8 2 12 4 17" />
                      <path d="M41 22c6 3 9 8 9 15 0 7 2 11 5 15" />
                      <path d="M48 17c7 6 9 13 9 21" />
                    </svg>
                  </span>
                  <strong>
                    {processing
                      ? "กำลังตรวจสอบ GPS..."
                      : "ลงเวลาปฏิบัติงาน"}
                  </strong>
                  {!processing && <small>แตะเพื่อเช็คอิน</small>}
                </button>

                <div className={styles.mobileFeedback}>
                  {processing ? (
                    <p className={styles.processingText}>
                      กำลังตรวจสอบตำแหน่ง GPS...
                    </p>
                  ) : message ? (
                    <p
                      className={
                        messageType === "success"
                          ? styles.feedbackSuccess
                          : styles.feedbackError
                      }
                    >
                      {message}
                    </p>
                  ) : (
                    <p>ระบบจะตรวจสอบตำแหน่ง GPS ก่อนบันทึกเวลา</p>
                  )}

                  {distanceMeters !== null && (
                    <small>
                      ระยะห่างจากโรงเรียน{" "}
                      <b>{distanceMeters.toLocaleString("th-TH")} เมตร</b>
                    </small>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.completedWrap}>
                <div className={styles.completedCircle}>
                  <span>✓</span>
                  <strong>วันนี้คุณได้ลงเวลาแล้ว</strong>
                  <small>{formatThaiTime(record.check_in_at)}</small>
                </div>

                <div className={styles.completedDetails}>
                  <span
                    className={
                      isLate ? styles.badgeLate : styles.badgeNormal
                    }
                  >
                    {checkInStatusLabel}
                  </span>

                  {distanceMeters !== null && (
                    <small>
                      ระยะ GPS{" "}
                      <b>{distanceMeters.toLocaleString("th-TH")} เมตร</b>
                    </small>
                  )}
                </div>
              </div>
            )}
          </article>

          <article className={`${styles.statusPanel} ${styles.mobileSecondary}`}>
            <div className={styles.currentDate}>
              <span>▣</span>
              <p>{formatThaiDate(now)}</p>
            </div>

            <div className={styles.liveClock}>
              {new Intl.DateTimeFormat("th-TH", {
                timeZone: "Asia/Bangkok",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }).format(now)}
              <span>● เวลาปัจจุบัน</span>
            </div>

            <div className={styles.todayStatus}>
              <small>สถานะวันนี้</small>
              {todayLeave ? (
                <strong className={styles.leaveStatus}>
                  ✓ {todayLeave.label}
                </strong>
              ) : !record?.check_in_at ? (
                <strong className={styles.waitingStatus}>
                  ◷ ยังไม่ได้ลงเวลาเข้า
                </strong>
              ) : (
                <strong
                  className={
                    isLate ? styles.lateStatus : styles.normalStatus
                  }
                >
                  {checkInStatusLabel}
                </strong>
              )}
            </div>

            <div className={styles.locationRow}>
              <span>⌖</span>
              <div>
                <small>ตำแหน่งลงเวลา</small>
                <strong>
                  {settings?.school_name || "โรงเรียนวัดไผ่มุ้ง"}
                </strong>
              </div>
            </div>
          </article>
        </section>

        <section className={`${styles.summaryGrid} ${styles.mobileSecondary}`}>
          <article className={styles.todayCard}>
            <div className={styles.todayIcon}>✓</div>

            <div>
              <small>สถานะของคุณวันนี้</small>
              <h2>
                {todayLeave
                  ? todayLeave.message
                  : record?.check_in_at
                    ? "วันนี้คุณได้ลงเวลาแล้ว"
                    : "ยังไม่ได้ลงเวลาปฏิบัติงาน"}
              </h2>

              <p>
                {todayLeave ? (
                  <>
                    ประเภท <strong>{todayLeave.label}</strong>
                  </>
                ) : (
                  <>
                    เวลาเข้า{" "}
                    <strong>{formatThaiTime(record?.check_in_at ?? null)}</strong>
                  </>
                )}
              </p>
            </div>

            {record?.check_in_at && (
              <span
                className={
                  isLate ? styles.badgeLate : styles.badgeNormal
                }
              >
                {checkInStatusLabel}
              </span>
            )}
          </article>

          <article className={styles.workTimeCard}>
            <small>เวลาปฏิบัติงาน</small>
            <strong>
              {profile.role === "janitor" ? "08:30 - 18:00" : "08:30 - 16:30"}
            </strong>
            <p>วันจันทร์ - วันศุกร์</p>
          </article>
        </section>

        {distanceMeters !== null && (
          <section className={`${styles.locationNotice} ${styles.mobileSecondary}`}>
            ระยะห่างจากโรงเรียน{" "}
            <strong>{distanceMeters.toLocaleString("th-TH")} เมตร</strong>
          </section>
        )}

        <section className={`${styles.bottomGrid} ${styles.mobileSecondary}`}>

          <article className={styles.monthSummary}>
            <div className={styles.sectionHeading}>
              <div>
                <small>MONTHLY</small>
                <h2>สรุปการลงเวลา</h2>
              </div>
            </div>

            <div className={styles.summaryCircle}>
              <span>เดือนนี้</span>
              <strong>{record?.check_in_at ? "1" : "0"}</strong>
              <small>วันที่ลงเวลา</small>
            </div>

            <div className={styles.legend}>
              <span>
                <i className={styles.greenDot} /> ปกติ
              </span>
              <span>
                <i className={styles.redDot} /> มาสาย
              </span>
              <span>
                <i className={styles.purpleDot} /> ลา/ขาด
              </span>
            </div>
          </article>
        </section>
      </section>

      {lateReasonOpen && (
        <div
          className={styles.lateReasonOverlay}
          role="presentation"
        >
          <section
            className={styles.lateReasonModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="late-reason-title"
          >
            <div className={styles.lateReasonIcon}>!</div>

            <div className={styles.lateReasonHeading}>
              <small>ลงเวลาหลังเวลาเริ่มงาน</small>
              <h2 id="late-reason-title">
                กรุณาระบุเหตุผลที่มาสาย
              </h2>
              <p>
                ระบุเหตุผลตั้งแต่ 5–30 ตัวอักษร
              </p>
            </div>

            <label className={styles.lateReasonField}>
              <span>เหตุผลมาสาย</span>
              <textarea
                value={lateReason}
                onChange={(event) => {
                  const nextValue = event.target.value;

                  if (Array.from(nextValue).length <= 30) {
                    setLateReason(nextValue);
                  }

                  if (lateReasonError) {
                    setLateReasonError("");
                  }
                }}
                rows={3}
                maxLength={30}
                autoFocus
                disabled={processing}
                placeholder="เช่น รถติดจากอุบัติเหตุระหว่างเดินทาง"
              />
            </label>

            <div className={styles.lateReasonMeta}>
              <small
                className={
                  countReasonCharacters(lateReason) >= 5
                    ? styles.lateReasonCountValid
                    : ""
                }
              >
                {countReasonCharacters(lateReason)}/30 ตัวอักษร
              </small>

              {lateReasonError && (
                <p role="alert">{lateReasonError}</p>
              )}
            </div>

            <div className={styles.lateReasonActions}>
              <button
                type="button"
                className={styles.lateReasonCancel}
                onClick={closeLateReasonModal}
                disabled={processing}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                className={styles.lateReasonConfirm}
                onClick={() => void confirmLateCheckIn()}
                disabled={
                  processing ||
                  countReasonCharacters(lateReason) < 5 ||
                  countReasonCharacters(lateReason) > 30
                }
              >
                {processing
                  ? "กำลังบันทึก..."
                  : "ยืนยันและลงเวลา"}
              </button>
            </div>
          </section>
        </div>
      )}    </main>
  );
}




