"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./attendance.module.css";

type Profile = {
  role: string;
  account_status: string;
};

type AttendanceSettings = {
  school_name: string;
  latitude: number | null;
  longitude: number | null;
  allowed_radius_meters: number;
  late_after_time: string;
  is_active: boolean;
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
    second: "2-digit",
  }).format(new Date(value));
}

function normalizeTime(value: string) {
  return value.slice(0, 8);
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
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("role, account_status")
        .eq("id", user.id)
        .single<Profile>();

      if (
        profileError ||
        !profileData ||
        profileData.account_status !== "active"
      ) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      setProfile(profileData);

      const { data: settingsData, error: settingsError } = await supabase
        .from("attendance_settings")
        .select(
          "school_name, latitude, longitude, allowed_radius_meters, late_after_time, is_active"
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
  }, [router, supabase]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  async function verifyLocation() {
    if (
      !settings ||
      settings.latitude === null ||
      settings.longitude === null
    ) {
      throw new Error("ยังไม่ได้กำหนดพิกัดโรงเรียน");
    }

    if (!settings.is_active) {
      throw new Error("ระบบลงเวลายังไม่เปิดใช้งาน");
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

  async function handleCheckIn() {
    setProcessing(true);
    setMessage("");

    try {
      if (record?.check_in_at) {
        throw new Error("วันนี้คุณได้ลงเวลาแล้ว");
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
      const checkInStatus =
        currentTime > normalizeTime(settings.late_after_time)
          ? "late"
          : "normal";

      const { data, error } = await supabase
        .from("attendance_records")
        .insert({
          user_id: user.id,
          work_date: getBangkokDate(),
          check_in_at: new Date().toISOString(),
          check_in_latitude: position.latitude,
          check_in_longitude: position.longitude,
          check_in_distance_meters: distance,
          check_in_status: checkInStatus,
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
      setMessage("บันทึกเวลาปฏิบัติงานเรียบร้อยแล้ว");
    } catch (error) {
      console.error("Check-in error:", error);
      setMessageType("error");
      setMessage(
        error instanceof Error ? error.message : "ลงเวลาเข้าไม่สำเร็จ"
      );
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <main className={styles.loading}>
        <span className={styles.spinner} />
        กำลังโหลดระบบลงเวลา...
      </main>
    );
  }

  const isLate = record?.check_in_status === "late";
  const privileged = ["admin", "director"].includes(profile?.role ?? "");

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <button
          type="button"
          aria-label="กลับหน้าแรก"
          onClick={() => router.push("/dashboard")}
        >
          ←
        </button>

        <div>
          <span>ATTENDANCE</span>
          <h1>ลงเวลาปฏิบัติงาน</h1>
        </div>

        <Image
          src="/images/school-logo.png"
          alt="โลโก้โรงเรียน"
          width={52}
          height={52}
        />
      </header>

      <section className={styles.clockCard}>
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
        <small>{settings?.school_name || "โรงเรียนวัดไผ่มุ้ง"}</small>
      </section>

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

      <section className={styles.statusCard}>
        {!record?.check_in_at ? (
          <>
            <h2>พร้อมลงเวลาปฏิบัติงาน</h2>
            <p>กดปุ่มเพื่อให้ระบบตรวจสอบตำแหน่ง GPS</p>

            <button
              type="button"
              className={styles.checkInButton}
              disabled={processing}
              onClick={() => void handleCheckIn()}
            >
              <span className={styles.checkInIcon}>◉</span>
              <strong>
                {processing ? "กำลังตรวจสอบ GPS..." : "ลงเวลาปฏิบัติงาน"}
              </strong>
              {!processing && <small>แตะเพื่อเช็คอิน</small>}
            </button>
          </>
        ) : (
          <div className={styles.completed}>
            <span className={styles.completedIcon}>✓</span>
            <h2>วันนี้คุณได้ลงเวลาแล้ว</h2>

            <span
              className={isLate ? styles.lateStatus : styles.normalStatus}
            >
              {isLate ? "มาสาย" : "ปกติ"}
            </span>

            <p>
              เวลาเข้า <b>{formatThaiTime(record.check_in_at)}</b>
            </p>
          </div>
        )}
      </section>

      {distanceMeters !== null && (
        <section className={styles.locationCard}>
          ระยะห่างจากโรงเรียน{" "}
          <strong>{distanceMeters.toLocaleString("th-TH")} เมตร</strong>
        </section>
      )}


      <section className={styles.menuSection}>
        <h2>เมนูของฉัน</h2>

        <div className={styles.menuGrid}>
          <button
            type="button"
            onClick={() => router.push("/attendance/history")}
          >
            <span>◷</span>
            <b>ประวัติการลงเวลา</b>
          </button>

          <button
            type="button"
            onClick={() => router.push("/account/change-pin")}
          >
            <span>🔐</span>
            <b>เปลี่ยน PIN</b>
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
          >
            <span>⌂</span>
            <b>หน้าสรุปข้อมูล</b>
          </button>

          {privileged && (
            <>
              <button
                type="button"
                onClick={() => router.push("/admin/members")}
              >
                <span>👥</span>
                <b>จัดการสมาชิก</b>
              </button>

              <button
                type="button"
                onClick={() => router.push("/admin/attendance")}
              >
                <span>▥</span>
                <b>รายงานลงเวลา</b>
              </button>
            </>
          )}
        </div>
      </section>

      <button
        type="button"
        className={styles.historyButton}
        onClick={() => router.push("/attendance/history")}
      >
        ดูประวัติการลงเวลา →
      </button>
    </main>
  );
}
